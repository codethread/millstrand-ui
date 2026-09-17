import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { HttpError, string } from './parse.ts';

const exec = promisify(execFile);

// Fixed read-only program, never interpolated with HTTP input. Select bounded
// card IDs first, then hydrate in bulk: CLI list's lean omission descriptors
// cannot represent long dispatcher errors (or other string properties). The
// full list query tolerates deleted IDs; strict strands-by-ids hydration does not.
const inspectionSource = `
(do
  (require 'clojure.data.json
           'millstrand.api.current.alpha
           'millstrand.api.weaver.alpha)
  (let [runtime (millstrand.api.current.alpha/runtime)
        cards (millstrand.api.weaver.alpha/list-lean
                runtime 0 [:= [:attr "kanban/card"] "true"] {} 10000)]
    (clojure.data.json/write-str
      (if (seq cards)
        (millstrand.api.weaver.alpha/list runtime [:in :id (mapv :id cards)] {})
        [])
      :key-fn (fn [key] (if (keyword? key) (subs (str key) 1) key)))))
`;

export async function readCardStrands(workspace: string): Promise<unknown> {
  try {
    const request = exec('mill', ['weaver', 'repl', '--workspace', workspace, '--stdin'], {
      cwd: dirname(workspace),
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    });
    request.child.stdin?.end(inspectionSource);
    const { stdout } = await request;
    return JSON.parse(string(JSON.parse(stdout) as unknown, 'card read JSON')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown card read failure';
    throw new HttpError(502, `Card inspection failed: ${message.slice(0, 1500)}`);
  }
}
