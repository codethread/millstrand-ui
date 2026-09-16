import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { WorkspaceOption } from '../shared/api.ts';
import { sorted } from '../shared/array.ts';
import { z } from 'zod';
import { HttpError } from './parse.ts';
import { StrandData } from './strand.ts';
import { ViewStore } from './views.ts';

const workspaceEntrySchema = z
  .object({
    config_dir: z.string(),
    state: z.string(),
  })
  .loose();
const workspaceListSchema = z.compile(z.array(workspaceEntrySchema), { strict: true });

const exec = promisify(execFile);

export function workspaceId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 24);
}

function option(path: string, status: WorkspaceOption['status']): WorkspaceOption {
  return {
    id: workspaceId(path),
    name: basename(path) === '.millstrand' ? basename(dirname(path)) : basename(path),
    path,
    status,
  };
}

/** The registry's config_dir is the canonical workspace selection, not its mutable weaver ID. */
export function parseWorkspaces(value: unknown, defaultPath: string): WorkspaceOption[] {
  const parsed = workspaceListSchema.safeParse(value);
  if (!parsed.success) throw new Error('weavers must be an array');
  const byPath = new Map<string, WorkspaceOption>();
  for (const row of parsed.data) {
    const path = row.config_dir;
    if (!isAbsolute(path)) throw new Error('weaver.config_dir must be an absolute path');
    const state = row.state;
    const canonicalPath = resolve(path);
    byPath.set(canonicalPath, option(canonicalPath, state === 'running' ? 'running' : 'offline'));
  }
  if (!byPath.has(defaultPath)) byPath.set(defaultPath, option(defaultPath, 'offline'));
  return sorted(
    [...byPath.values()],
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
  );
}

interface WorkspaceClients {
  path: string;
  strand: StrandData;
  views: ViewStore;
}

type DiscoverWorkspaces = () => Promise<WorkspaceOption[]>;

async function discoverWorkspaces(defaultPath: string): Promise<WorkspaceOption[]> {
  try {
    const { stdout } = await exec('mill', ['weaver', 'list'], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseWorkspaces(JSON.parse(stdout) as unknown, defaultPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown mill failure';
    throw new HttpError(502, `Could not discover local workspaces: ${detail.slice(0, 1500)}`);
  }
}

export class WorkspaceDirectory {
  private readonly clients = new Map<string, WorkspaceClients>();
  private snapshot: WorkspaceOption[] | null = null;
  private validUntil = 0;
  private pending: Promise<WorkspaceOption[]> | null = null;

  constructor(
    private readonly defaultPath: string,
    private readonly discover: DiscoverWorkspaces = () => discoverWorkspaces(defaultPath),
  ) {}

  async list(force = false): Promise<WorkspaceOption[]> {
    if (!force && this.snapshot !== null && Date.now() < this.validUntil) return this.snapshot;
    if (this.pending !== null) return this.pending;
    this.pending = this.discover()
      .then((workspaces) => {
        this.snapshot = workspaces;
        this.validUntil = Date.now() + 5_000;
        return workspaces;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async select(id: string | null): Promise<WorkspaceClients> {
    let path = this.defaultPath;
    if (id !== null) {
      const found = (await this.list()).find((workspace) => workspace.id === id);
      if (!found) throw new HttpError(404, 'That workspace is not known to the local mill.');
      if (found.status === 'offline')
        throw new HttpError(503, `The ${found.name} weaver is offline.`);
      path = found.path;
    }
    let selected = this.clients.get(path);
    if (selected === undefined) {
      selected = { path, strand: new StrandData(path), views: new ViewStore(path) };
      this.clients.set(path, selected);
    }
    return selected;
  }
}
