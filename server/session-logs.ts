import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { LogSource } from '../shared/log-activity.ts';
import { providerSchema } from '../shared/session-log.ts';
import { HttpError } from './parse.ts';
import { SessionLogReader } from './session-log-reader.ts';

const sourceSchema = z.object({
  provider: providerSchema,
  session: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
});
const maxStreams = 32;

export function parseSessionLogSource(url: URL): LogSource {
  const result = sourceSchema.safeParse({
    provider: url.searchParams.get('provider'),
    session: url.searchParams.get('session'),
  });
  if (!result.success)
    throw new HttpError(400, 'A supported provider and dialogue session file stem are required.');
  return result.data;
}

/** One bounded file tail per visible viewer; closed connections and shutdown stop their timers. */
export class SessionLogStreams {
  private readonly responses = new Set<ServerResponse>();

  constructor(private readonly reader: SessionLogReader) {}

  open(response: ServerResponse, source: LogSource): void {
    if (this.responses.size >= maxStreams)
      throw new HttpError(503, 'Too many session log streams are open.');
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    response.flushHeaders();
    this.responses.add(response);
    let closed = false;
    let modifiedAt: string | null = null;
    let timer: NodeJS.Timeout | null = null;
    const close = (): void => {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      this.responses.delete(response);
    };
    response.once('close', close);
    const write = (payload: string): Promise<boolean> => {
      if (response.write(payload)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const drained = (): void => {
          response.off('close', disconnected);
          resolve(true);
        };
        const disconnected = (): void => {
          response.off('drain', drained);
          resolve(false);
        };
        response.once('drain', drained);
        response.once('close', disconnected);
      });
    };
    const poll = async (): Promise<void> => {
      let payload: string;
      try {
        const current = await this.reader.sourceModifiedAt(source.provider, source.session);
        if (closed) return;
        if (current !== modifiedAt) {
          const snapshot = await this.reader.snapshot(source.provider, source.session);
          if (closed) return;
          payload = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
          modifiedAt = current;
        } else payload = ': heartbeat\n\n';
      } catch {
        if (closed) return;
        payload = `event: source-error\ndata: ${JSON.stringify({ message: 'Unable to read dialogue source.' })}\n\n`;
        modifiedAt = null;
      }
      if ((await write(payload)) && !closed) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
  }

  close(): void {
    for (const response of this.responses) response.destroy();
  }
}
