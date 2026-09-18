import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  dialogueSchema,
  type LogDirectory,
  type LogEvent,
  type LogProvider,
  type LogSession,
  type LogSnapshot,
} from '../shared/log-lab.ts';

const providers: readonly LogProvider[] = ['pi', 'codex', 'claude'];
const maxBytes = 1024 * 1024;
const maxRecords = 400;
const sessionStem = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface LogLabReaderOptions {
  stateRoot?: string;
}

interface AllowedSession {
  provider: LogProvider;
  stem: string;
}

function directoryFor(stateRoot: string, provider: LogProvider): string {
  return resolve(stateRoot, `${provider}-dialogue`);
}

function sourceError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
  return new Error(`Unable to read dialogue source: ${message}`);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function title(events: LogEvent[]): string {
  const prompt = events.find((event) => event.record.event === 'prompt' && event.record.text);
  if (prompt === undefined) return 'Untitled session';
  const text = prompt.record.text!.replaceAll(/\s+/g, ' ').trim();
  return text === '' ? 'Untitled session' : text.slice(0, 160);
}

function metadata(events: LogEvent[], key: 'cwd' | 'model'): string | null {
  for (const event of events) {
    const value = event.record[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export class LogLabReader {
  readonly stateRoot: string;

  constructor(options: LogLabReaderOptions = {}) {
    this.stateRoot = resolve(options.stateRoot ?? resolve(homedir(), '.local/state'));
  }

  private path({ provider, stem }: AllowedSession): string {
    return resolve(directoryFor(this.stateRoot, provider), `${stem}.jsonl`);
  }

  private allowed(provider: LogProvider, stem: string): AllowedSession {
    if (!sessionStem.test(stem)) throw new Error('Session must be a dialogue file stem.');
    return { provider, stem };
  }

  private async readFile(
    session: AllowedSession,
  ): Promise<{ data: Buffer; size: number; modifiedAt: string }> {
    const path = this.path(session);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    let handle;
    try {
      const directory = await lstat(directoryFor(this.stateRoot, session.provider));
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error('Dialogue source directory is not a regular directory.');
      handle = await open(path, flags);
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('Dialogue source is not a regular file.');
      const length = Math.min(info.size, maxBytes);
      const data = Buffer.alloc(length);
      if (length > 0) await handle.read(data, 0, length, info.size - length);
      return { data, size: info.size, modifiedAt: info.mtime.toISOString() };
    } catch (error) {
      throw sourceError(error);
    } finally {
      await handle?.close();
    }
  }

  async snapshot(provider: LogProvider, stem: string): Promise<LogSnapshot> {
    const session = this.allowed(provider, stem);
    const file = await this.readFile(session);
    const offset = file.size - file.data.length;
    let start = 0;
    if (offset > 0) {
      const newline = file.data.indexOf(0x0a);
      if (newline === -1) {
        return {
          events: [],
          skipped: 0,
          truncated: true,
          bytes: file.size,
          modifiedAt: file.modifiedAt,
        };
      }
      start = newline + 1;
    }
    const completeEnd = file.data.lastIndexOf(0x0a);
    if (completeEnd < start) {
      return {
        events: [],
        skipped: 0,
        truncated: offset > 0,
        bytes: file.size,
        modifiedAt: file.modifiedAt,
      };
    }
    const lines: { start: number; end: number }[] = [];
    for (let lineStart = start; lineStart <= completeEnd;) {
      const newline = file.data.indexOf(0x0a, lineStart);
      if (newline === -1 || newline > completeEnd) break;
      lines.push({ start: lineStart, end: newline });
      lineStart = newline + 1;
    }
    const retained = lines.slice(-maxRecords);
    let skipped = 0;
    const events: LogEvent[] = [];
    for (const line of retained) {
      const text = file.data.subarray(line.start, line.end).toString('utf8').replace(/\r$/, '');
      try {
        const record = dialogueSchema.parse(JSON.parse(text) as unknown);
        events.push({ id: String(offset + line.start), record });
      } catch {
        skipped += 1;
      }
    }
    return {
      events,
      skipped,
      truncated: offset > 0 || lines.length > retained.length,
      bytes: file.size,
      modifiedAt: file.modifiedAt,
    };
  }

  async directory(): Promise<LogDirectory> {
    const sessions: LogSession[] = [];
    const warnings: string[] = [];
    for (const provider of providers) {
      let entries;
      try {
        const sourceDirectory = directoryFor(this.stateRoot, provider);
        const info = await lstat(sourceDirectory);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new Error('Dialogue source directory is not a regular directory.');
        entries = await readdir(sourceDirectory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) continue;
        warnings.push(`${provider}: ${sourceError(error).message}`);
        continue;
      }
      const candidates = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => entry.name.slice(0, -'.jsonl'.length))
        .filter((stem) => sessionStem.test(stem));
      // Stat the directory first; never open thousands of historical logs at once.
      const recent: { stem: string; modified: number }[] = [];
      for (const stem of candidates) {
        try {
          const info = await lstat(this.path({ provider, stem }));
          if (info.isFile() && !info.isSymbolicLink())
            recent.push({ stem, modified: info.mtimeMs });
        } catch (error) {
          if (!isMissing(error))
            warnings.push(`${provider}/${stem}: ${sourceError(error).message}`);
        }
      }
      recent.sort((a, b) => b.modified - a.modified);
      const found = await Promise.all(
        recent.slice(0, 30).map(async ({ stem }) => {
          try {
            const snapshot = await this.snapshot(provider, stem);
            return { stem, snapshot };
          } catch (error) {
            warnings.push(`${provider}/${stem}: ${sourceError(error).message}`);
            return null;
          }
        }),
      );
      sessions.push(
        ...found.flatMap((item): LogSession[] => {
          if (item === null) return [];
          const { stem, snapshot } = item;
          return [
            {
              id: stem,
              provider,
              title: title(snapshot.events),
              cwd: metadata(snapshot.events, 'cwd'),
              model: metadata(snapshot.events, 'model'),
              modifiedAt: snapshot.modifiedAt,
              bytes: snapshot.bytes,
            },
          ];
        }),
      );
    }
    sessions.sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt));
    const capped = new Map<LogProvider, number>();
    return {
      sessions: sessions.filter((session) => {
        const count = capped.get(session.provider) ?? 0;
        capped.set(session.provider, count + 1);
        return count < 30;
      }),
      warnings,
    };
  }

  async sourceModifiedAt(provider: LogProvider, stem: string): Promise<string> {
    const session = this.allowed(provider, stem);
    const info = await lstat(this.path(session));
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('Dialogue source is not a regular file.');
    return `${info.mtimeMs}:${info.size}`;
  }
}
