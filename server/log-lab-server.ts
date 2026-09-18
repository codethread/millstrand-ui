import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { createServer, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';
import {
  conceptSchema,
  providerSchema,
  type Concept,
  type LogProvider,
} from '../shared/log-lab.ts';
import { LogLabReader } from './log-lab-reader.ts';
import { WorkspaceDirectory } from './workspaces.ts';
import { WorkspaceDatabase } from './workspace-database.ts';
import { readLogActivity } from './log-activity.ts';

interface Options {
  concept: Concept | 'dashboard';
  host: string;
  port: number;
}

function options(args: string[]): Options {
  let concept: Concept | 'dashboard' = 'console';
  let host = '127.0.0.1';
  let port: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') {
      console.log(
        'Usage: log-lab-server --concept console|conversation|inspector [--port number] [--host address]',
      );
      process.exit(0);
    }
    if (flag !== '--concept' && flag !== '--host' && flag !== '--port')
      throw new Error(`Unknown argument: ${flag}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    index += 1;
    if (flag === '--concept') concept = conceptSchema.or(z.literal('dashboard')).parse(value);
    if (flag === '--host') host = value;
    if (flag === '--port') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
        throw new Error('Port must be an integer from 1 to 65535.');
      port = parsed;
    }
  }
  if (host.trim() === '') throw new Error('Host must not be empty.');
  const defaults = { console: 4311, conversation: 4312, inspector: 4313, dashboard: 4314 };
  return { concept, host, port: port ?? defaults[concept] };
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function requestSession(url: URL): { provider: LogProvider; session: string } {
  const provider = providerSchema.safeParse(url.searchParams.get('provider'));
  if (!provider.success) throw new Error('provider must be pi, codex, or claude.');
  const session = url.searchParams.get('session');
  if (session === null) throw new Error('session is required.');
  return { provider: provider.data, session };
}

function sse(response: ServerResponse, event: string, value: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

async function main(): Promise<void> {
  const config = options(process.argv.slice(2));
  const reader = new LogLabReader();
  const { stdout } = await promisify(execFile)('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  const workspaces = new WorkspaceDirectory(resolve(dirname(stdout.trim()), '.millstrand'));
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://log-lab.local');
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        json(response, 405, { error: 'Method not allowed.' });
        return;
      }
      if (url.pathname === '/api/log-lab/config' && request.method === 'GET') {
        json(response, 200, { concept: config.concept });
        return;
      }
      if (url.pathname === '/api/log-lab/activity' && request.method === 'GET') {
        const workspace = await workspaces.select(url.searchParams.get('workspace'));
        const rows = await new WorkspaceDatabase(workspace.path).readAgentStrands();
        json(response, 200, await readLogActivity(rows, reader));
        return;
      }
      if (url.pathname === '/api/log-lab/sessions' && request.method === 'GET') {
        json(response, 200, await reader.directory());
        return;
      }
      if (url.pathname === '/api/log-lab/snapshot' && request.method === 'GET') {
        const { provider, session } = requestSession(url);
        json(response, 200, await reader.snapshot(provider, session));
        return;
      }
      if (url.pathname === '/api/log-lab/stream' && request.method === 'GET') {
        const { provider, session } = requestSession(url);
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        response.flushHeaders();
        let closed = false;
        let modifiedAt: string | null = null;
        let timer: NodeJS.Timeout | null = null;
        const close = (): void => {
          closed = true;
          if (timer !== null) clearTimeout(timer);
        };
        request.on('close', close);
        response.on('close', close);
        const poll = async (): Promise<void> => {
          try {
            const current = await reader.sourceModifiedAt(provider, session);
            if (current !== modifiedAt) {
              sse(response, 'snapshot', await reader.snapshot(provider, session));
              modifiedAt = current;
            } else response.write(': heartbeat\n\n');
          } catch (error) {
            sse(response, 'source-error', {
              message: error instanceof Error ? error.message : 'Unable to read dialogue source.',
            });
            modifiedAt = null;
          }
          if (!closed) timer = setTimeout(() => void poll(), 1000);
        };
        void poll();
        return;
      }
      if (url.pathname.startsWith('/api/') && config.concept !== 'dashboard') {
        json(response, 404, { error: 'API route not found.' });
        return;
      }
      if (url.pathname === '/' || url.pathname === '/log-lab.html') {
        const html = await vite.transformIndexHtml(
          url.pathname,
          await readFile(
            fileURLToPath(
              new URL(
                config.concept === 'dashboard' ? '../index.html' : '../log-lab.html',
                import.meta.url,
              ),
            ),
            'utf8',
          ),
        );
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        response.end(request.method === 'HEAD' ? undefined : html);
        return;
      }
      vite.middlewares(request, response);
    })().catch((error: unknown) => {
      if (!response.headersSent)
        json(response, 400, {
          error: error instanceof Error ? error.message : 'Unexpected server error.',
        });
      else response.end();
    });
  });
  const vite = await createViteServer({
    configFile: false,
    cacheDir: `node_modules/.vite-log-lab-${config.port}`,
    appType: 'custom',
    define: {
      'import.meta.env.VITE_LOG_LAB': JSON.stringify(
        config.concept === 'dashboard' ? 'true' : 'false',
      ),
    },
    server: {
      middlewareMode: true,
      ws: { server, clientPort: config.port },
      proxy: config.concept === 'dashboard' ? { '/api': 'http://127.0.0.1:4315' } : {},
    },
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  });
  server.listen(config.port, config.host, () => {
    console.log(`Log lab ${config.concept} · http://${config.host}:${config.port}`);
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void vite.close();
      server.close();
      server.closeAllConnections();
    });
  }
}

void main();
