import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { WorkspaceOption } from '../shared/api.ts';
import { array, HttpError, object, string } from './parse.ts';
import { StrandData } from './strand.ts';
import { ViewStore } from './views.ts';

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
  const byPath = new Map<string, WorkspaceOption>();
  for (const entry of array(value, 'weavers')) {
    const row = object(entry, 'weaver');
    const path = string(row['config_dir'], 'weaver.config_dir');
    if (!isAbsolute(path)) throw new Error('weaver.config_dir must be an absolute path');
    const state = string(row['state'], 'weaver.state');
    const canonicalPath = resolve(path);
    byPath.set(canonicalPath, option(canonicalPath, state === 'running' ? 'running' : 'offline'));
  }
  if (!byPath.has(defaultPath)) byPath.set(defaultPath, option(defaultPath, 'offline'));
  return [...byPath.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
  );
}

interface WorkspaceClients {
  path: string;
  strand: StrandData;
  views: ViewStore;
}

export class WorkspaceDirectory {
  private readonly clients = new Map<string, WorkspaceClients>();
  private snapshot: WorkspaceOption[] | null = null;
  private validUntil = 0;
  private pending: Promise<WorkspaceOption[]> | null = null;

  constructor(private readonly defaultPath: string) {}

  async list(): Promise<WorkspaceOption[]> {
    if (this.snapshot !== null && Date.now() < this.validUntil) return this.snapshot;
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

  private async discover(): Promise<WorkspaceOption[]> {
    try {
      const { stdout } = await exec('mill', ['weaver', 'list'], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return parseWorkspaces(JSON.parse(stdout) as unknown, this.defaultPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown mill failure';
      throw new HttpError(502, `Could not discover local workspaces: ${detail.slice(0, 1500)}`);
    }
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
