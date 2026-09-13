import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { JsonValue, SavedView } from '../shared/api.ts';
import { object, parseViews } from './parse.ts';

export class ViewStore {
  readonly file = join(
    process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'),
    'millstrand',
    'millstrand-ui',
    'views.json',
  );
  // Every workspace shares this file; serialize their read-modify-write operations together.
  private static writing: Promise<void> = Promise.resolve();

  constructor(private readonly workspace: string) {}

  private async read(): Promise<Record<string, JsonValue>> {
    try {
      return object(JSON.parse(await readFile(this.file, 'utf8')) as unknown, 'saved views store');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async load(): Promise<SavedView[]> {
    const stored = (await this.read())[this.workspace];
    return stored === undefined ? [] : parseViews(stored);
  }

  async save(views: SavedView[]): Promise<SavedView[]> {
    const write = ViewStore.writing.then(async () => {
      const all = await this.read();
      const contents = JSON.stringify({ ...all, [this.workspace]: views }, null, 2) + '\n';
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, this.file);
    });
    // A failed write rejects its request without poisoning the next explicit save.
    ViewStore.writing = write.catch(() => undefined);
    await write;
    return views;
  }
}
