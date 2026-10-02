import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { encodeJson } from './json';

const decompress = promisify(gunzip);

describe('JSON representation', () => {
  const value = { repeated: 'agent history '.repeat(100) };

  it('compresses an accepted gzip representation without changing its JSON', async () => {
    const representation = await encodeJson(value, 'gzip, deflate, br');

    expect(representation.contentEncoding).toBe('gzip');
    expect(JSON.parse((await decompress(representation.body)).toString('utf8'))).toEqual(value);
  });

  it('leaves the representation uncompressed when gzip is unavailable', async () => {
    const representation = await encodeJson(value, 'gzip;q=0, br');

    expect(representation.contentEncoding).toBeNull();
    expect(JSON.parse(representation.body.toString('utf8'))).toEqual(value);
  });
});
