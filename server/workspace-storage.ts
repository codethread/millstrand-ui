import { execFile } from 'node:child_process';
import { basename, dirname, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { PerfLogger } from '../shared/perf.ts';

const exec = promisify(execFile);
const weaverStatusesSchema = z.compile(
  z.array(
    z
      .object({
        config_dir: z.string(),
        database_kind: z.string(),
        database_label: z.string(),
        database_path: z.string().nullable(),
      })
      .loose(),
  ),
  { strict: true },
);

export function parseDatabasePath(value: unknown, workspace: string): string {
  const parsed = weaverStatusesSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Mill returned invalid weaver storage metadata.`);
  const status = parsed.data.find((candidate) => candidate.config_dir === workspace);
  if (status === undefined) throw new Error(`Mill does not know workspace ${workspace}`);
  if (status.database_kind !== 'sqlite-file' || status.database_path === null)
    throw new Error(`Workspace storage is not file-backed SQLite: ${status.database_kind}`);
  if (!isAbsolute(status.database_path) || status.database_label !== status.database_path)
    throw new Error(`Workspace SQLite storage metadata is inconsistent.`);
  return status.database_path;
}

export async function discoverDatabase(workspace: string, logger: PerfLogger): Promise<string> {
  const started = performance.now();
  const { stdout } = await exec('mill', ['weaver', 'list'], {
    cwd: dirname(workspace),
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    encoding: 'utf8',
  });
  logger.record({
    scope: 'mill',
    target: 'weaver list (storage)',
    workspace: basename(dirname(workspace)),
    ms: performance.now() - started,
    detail: `bytes=${Buffer.byteLength(stdout)}`,
  });
  return parseDatabasePath(JSON.parse(stdout) as unknown, workspace);
}
