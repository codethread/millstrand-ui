import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  dialogueSchema,
  type LogEvent,
  type LogProvider,
  type LogSnapshot,
} from '../shared/session-log.ts';

const maxBytes = 1024 * 1024;
const maxRecords = 400;
const sessionStem = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface SessionLogReaderOptions {
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

export class SessionLogReader {
  readonly stateRoot: string;

  constructor(options: SessionLogReaderOptions = {}) {
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

  async sourceModifiedAt(provider: LogProvider, stem: string): Promise<string> {
    const session = this.allowed(provider, stem);
    const info = await lstat(this.path(session));
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('Dialogue source is not a regular file.');
    return `${info.mtimeMs}:${info.size}`;
  }
}
