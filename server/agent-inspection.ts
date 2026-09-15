import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { HttpError, string } from './parse.ts';

const exec = promisify(execFile);

// Fixed, read-only trusted program: no HTTP input is interpolated into Clojure.
// Core list-lean filters before attribute assembly. Keep every lifecycle state
// for identity/run history, but never read unrelated notes, events or artifacts.
// Using the public API avoids installing a UI-specific query in every weaver.
const inspectionSource = `
(do
  (require 'clojure.data.json
           'millstrand.api.current.alpha
           'millstrand.api.weaver.alpha)
  (clojure.data.json/write-str
    (millstrand.api.weaver.alpha/list-lean
      (millstrand.api.current.alpha/runtime) 1024
      [:or
        [:= [:attr "identity/session"] "true"]
        [:and [:= [:attr "harness/run"] "true"]
              [:= [:attr "harness/published"] "true"]
              [:exists [:attr "identity/id"]]]
        [:exists [:attr "owner"]]]
      {} 10000)
    :key-fn (fn [key] (if (keyword? key) (subs (str key) 1) key))))
`;

export async function readAgentStrands(workspace: string): Promise<unknown> {
  try {
    const request = exec('mill', ['weaver', 'repl', '--workspace', workspace, '--stdin'], {
      cwd: dirname(workspace),
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    });
    request.child.stdin?.end(inspectionSource);
    const { stdout } = await request;
    // REPL prints one Clojure string containing JSON; decode its string envelope,
    // then leave domain validation to parseAgents at the directory boundary.
    return JSON.parse(string(JSON.parse(stdout) as unknown, 'agent read JSON')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown agent read failure';
    throw new HttpError(502, `Agent inspection failed: ${message.slice(0, 1500)}`);
  }
}
