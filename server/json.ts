import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

export interface JsonRepresentation {
  body: Buffer;
  contentEncoding: 'gzip' | null;
}

function acceptsGzip(header: string | string[] | undefined): boolean {
  if (header === undefined) return false;
  const encodings = (Array.isArray(header) ? header : [header]).flatMap((value) =>
    value.split(',').map((part) => part.trim()),
  );
  for (const encoding of encodings) {
    const [name, ...parameters] = encoding.split(';').map((part) => part.trim().toLowerCase());
    if (name !== 'gzip') continue;
    const quality = parameters.find((parameter) => parameter.startsWith('q='));
    return quality === undefined || Number(quality.slice(2)) > 0;
  }
  return false;
}

/** Serialize once and compress only when the HTTP client explicitly accepts gzip. */
export async function encodeJson(
  data: unknown,
  acceptEncoding: string | string[] | undefined,
): Promise<JsonRepresentation> {
  const body = Buffer.from(JSON.stringify(data));
  if (!acceptsGzip(acceptEncoding)) return { body, contentEncoding: null };
  return { body: await compress(body), contentEncoding: 'gzip' };
}
