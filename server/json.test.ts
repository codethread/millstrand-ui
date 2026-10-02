import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { encodeJson, type JsonRepresentation } from './json';

const decompress = promisify(gunzip);

function expectPresent(representation: JsonRepresentation | null): JsonRepresentation {
  if (representation === null) throw new Error('Expected an acceptable JSON representation.');
  return representation;
}

describe('JSON representation', () => {
  const value = { repeated: 'agent history '.repeat(100) };

  it('compresses an accepted gzip representation without changing its JSON', async () => {
    const representation = await encodeJson(value, 'gzip, deflate, br');

    expect(representation?.contentEncoding).toBe('gzip');
    expect(
      JSON.parse((await decompress(expectPresent(representation).body)).toString('utf8')),
    ).toEqual(value);
  });

  it('uses gzip through a wildcard when identity is forbidden', async () => {
    const representation = await encodeJson(value, 'identity;q=0, *;q=1');

    expect(representation?.contentEncoding).toBe('gzip');
  });

  it('leaves the representation uncompressed when gzip is unavailable', async () => {
    const representation = await encodeJson(value, 'gzip;q=0, br');

    expect(representation?.contentEncoding).toBeNull();
    expect(JSON.parse(expectPresent(representation).body.toString('utf8'))).toEqual(value);
  });

  it('rejects negotiation when neither supported representation is acceptable', async () => {
    await expect(encodeJson(value, 'gzip;q=0, identity;q=0')).resolves.toBeNull();
  });
});
