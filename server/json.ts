import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

export interface JsonRepresentation {
  body: Buffer;
  contentEncoding: 'gzip' | null;
}

function acceptedEncodings(header: string | string[] | undefined): Map<string, number> {
  if (header === undefined) return new Map();
  const accepted = new Map<string, number>();
  for (const value of Array.isArray(header) ? header : [header]) {
    for (const encoding of value.split(',')) {
      const [name, ...parameters] = encoding.split(';').map((part) => part.trim().toLowerCase());
      if (name === undefined || name === '') continue;
      const parameter = parameters.find((candidate) => candidate.startsWith('q='));
      const quality = parameter === undefined ? 1 : Number(parameter.slice(2));
      accepted.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
    }
  }
  return accepted;
}

/** Serialize once and select the best supported HTTP content encoding. */
export async function encodeJson(
  data: unknown,
  acceptEncoding: string | string[] | undefined,
): Promise<JsonRepresentation | null> {
  const body = Buffer.from(JSON.stringify(data));
  const accepted = acceptedEncodings(acceptEncoding);
  const wildcard = accepted.get('*');
  const gzipQuality = accepted.get('gzip') ?? wildcard ?? 0;
  const identityQuality = accepted.get('identity') ?? (wildcard === 0 ? 0 : 1);
  if (gzipQuality > 0 && gzipQuality >= identityQuality)
    return { body: await compress(body), contentEncoding: 'gzip' };
  if (identityQuality > 0) return { body, contentEncoding: null };
  return null;
}
