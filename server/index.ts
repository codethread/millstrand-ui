import { execFile } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HttpError, parseLabelChange, parseViews, requestValue } from './parse.ts';
import { WorkspaceDirectory } from './workspaces.ts';
import { parseAgentPrompt } from './agent-prompts.ts';

const exec = promisify(execFile);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

interface Options {
  workspace: string;
  host: string;
  port: number;
}

async function options(args: string[]): Promise<Options> {
  let workspace = process.env['MILLSTRAND_WORKSPACE'];
  let host = process.env['MILLSTRAND_UI_HOST'] ?? '0.0.0.0';
  let port = process.env['MILLSTRAND_UI_PORT'] ?? '4173';
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') {
      console.log('Usage: millstrand-ui [--workspace directory] [--host address] [--port number]');
      console.log('Defaults: canonical Git workspace, 0.0.0.0, port 4173.');
      process.exit(0);
    }
    if (flag !== '--workspace' && flag !== '--host' && flag !== '--port')
      throw new Error(`Unknown argument: ${flag}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    index += 1;
    if (flag === '--workspace') workspace = value;
    if (flag === '--host') host = value;
    if (flag === '--port') port = value;
  }
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)
    throw new Error('Port must be an integer from 1 to 65535.');
  if (host.trim() === '') throw new Error('Host must not be empty.');
  if (workspace === undefined) {
    const { stdout } = await exec(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' },
    );
    workspace = resolve(dirname(stdout.trim()), '.millstrand');
  }
  let workspacePath = resolve(workspace);
  if (basename(workspacePath) !== '.millstrand') {
    // The CLI accepts the workspace itself; the web launcher also accepts its repository root.
    try {
      if ((await stat(resolve(workspacePath, '.millstrand'))).isDirectory())
        workspacePath = resolve(workspacePath, '.millstrand');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  workspacePath = await realpath(workspacePath);
  if (!(await stat(workspacePath)).isDirectory()) throw new Error('Workspace must be a directory.');
  return { workspace: workspacePath, host, port: portNumber };
}

function json(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Use application/json.');
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    length += bytes.length;
    if (length > 128 * 1024) throw new HttpError(413, 'Request is too large.');
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function checkWriteOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (!origin) return;
  // No cross-site writes. Matching hostnames allow Vite's development proxy on another port.
  let permitted = false;
  try {
    permitted =
      new URL(origin).hostname === new URL(`http://${request.headers.host ?? ''}`).hostname;
  } catch {
    throw new HttpError(403, 'Invalid request origin.');
  }
  if (!permitted) throw new HttpError(403, 'Cross-site writes are not allowed.');
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

async function staticFile(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requested = resolve(dist, `.${pathname}`);
  if (requested !== resolve(dist) && !requested.startsWith(resolve(dist) + sep))
    throw new HttpError(404, 'File not found.');
  let path = requested;
  try {
    if (!(await stat(path)).isFile()) path = resolve(dist, 'index.html');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    if (extname(pathname)) throw new HttpError(404, 'File not found.');
    path = resolve(dist, 'index.html');
  }
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new HttpError(
        503,
        'The web app is not built yet. Run pnpm build, or use the Vite URL during pnpm dev.',
      );
    }
    throw error;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : data);
}

const config = await options(process.argv.slice(2));
const workspaces = new WorkspaceDirectory(config.workspace);

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', 'http://millstrand.local');
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'Invalid URL encoding.');
    }
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') checkWriteOrigin(request);
    if (path === '/api/workspaces' && method === 'GET') {
      json(response, 200, await workspaces.list(url.searchParams.has('refresh')));
      return;
    }
    if (path === '/api/health' && method === 'GET') {
      const selected = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, { ok: true, workspace: selected.path });
      return;
    }
    if (path === '/api/board' && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.board());
      return;
    }
    if (path === '/api/reviews' && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.reviews());
      return;
    }
    const reviewId = /^\/api\/reviews\/([a-zA-Z0-9_-]+)$/.exec(path)?.[1];
    if (reviewId !== undefined && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.review(reviewId));
      return;
    }
    if (path === '/api/agents' && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.agents());
      return;
    }
    if (path === '/api/agent-options' && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.agentOptions());
      return;
    }
    const runId = /^\/api\/agent-runs\/([a-zA-Z0-9_-]+)$/.exec(path)?.[1];
    if (runId !== undefined && method === 'GET') {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await strand.agentReply(runId));
      return;
    }
    if (path === '/api/views' && method === 'GET') {
      const { views } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await views.load());
      return;
    }
    if (path === '/api/views' && method === 'PUT') {
      const { views } = await workspaces.select(url.searchParams.get('workspace'));
      json(response, 200, await views.save(requestValue(parseViews, await body(request))));
      return;
    }
    const match =
      /^\/api\/cards\/([a-zA-Z0-9_-]+)(?:\/(graph|labels|tasks|agent-runs)(?:\/([a-zA-Z0-9_-]+)\/notes)?)?$/.exec(
        path,
      );
    const id = match?.[1];
    if (id !== undefined) {
      const { strand } = await workspaces.select(url.searchParams.get('workspace'));
      const action = match?.[2];
      const taskId = match?.[3];
      if (method === 'GET' && action === undefined) json(response, 200, await strand.detail(id));
      else if (method === 'GET' && action === 'graph' && taskId === undefined)
        json(response, 200, await strand.graph(id));
      else if (method === 'GET' && action === 'tasks' && taskId !== undefined)
        json(response, 200, await strand.taskNotes(id, taskId));
      else if (method === 'POST' && action === 'agent-runs' && taskId === undefined) {
        json(
          response,
          201,
          await strand.promptAgent(id, requestValue(parseAgentPrompt, await body(request))),
        );
      } else if (method === 'PATCH' && action === 'labels' && taskId === undefined) {
        json(
          response,
          200,
          await strand.changeLabels(id, requestValue(parseLabelChange, await body(request))),
        );
      } else
        throw new HttpError(
          405,
          'This action is not available. Cards are read-only except for labels.',
        );
      return;
    }
    if (path === '/api' || path.startsWith('/api/'))
      throw new HttpError(404, 'API route not found.');
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    await staticFile(path, request, response);
  })().catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    if (!response.headersSent) json(response, status, { error: message });
    else response.end();
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Millstrand UI · ${config.workspace}`);
  console.log(`  Local: http://localhost:${config.port}`);
  if (config.host === '0.0.0.0' || config.host === '::') {
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal)
          console.log(`  LAN:   http://${address.address}:${config.port}`);
      }
    }
  } else console.log(`  Bound: http://${config.host}:${config.port}`);
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
  });
}
