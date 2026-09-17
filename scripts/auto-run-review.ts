import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const checkSchema = z.discriminatedUnion('__typename', [
  z.object({
    __typename: z.literal('CheckRun'),
    name: z.string(),
    status: z.string(),
    conclusion: z.string(),
  }),
  z.object({
    __typename: z.literal('StatusContext'),
    context: z.string(),
    state: z.string(),
  }),
]);

const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  url: z.url(),
  state: z.literal('OPEN'),
  isDraft: z.literal(false),
  baseRefName: z.literal('main'),
  headRefName: z.string(),
  headRefOid: z.string().regex(/^[a-f0-9]{40}$/),
  body: z.string(),
  statusCheckRollup: z.array(checkSchema).min(1),
});

/** Verify the exact pushed revision and the repository's review handoff contract. */
export function verifyReviewPackage(value: unknown, branch: string, head: string) {
  const pr = pullRequestSchema.parse(value);
  if (pr.headRefName !== branch || pr.headRefOid !== head) {
    throw new Error('PR must contain the exact local branch HEAD');
  }
  const passing = pr.statusCheckRollup.every((check) =>
    check['__typename'] === 'CheckRun'
      ? check.status === 'COMPLETED' && ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion)
      : check.state === 'SUCCESS',
  );
  const qualityPassed = pr.statusCheckRollup.some(
    (check) =>
      check['__typename'] === 'CheckRun' &&
      check.name === 'quality' &&
      check.status === 'COMPLETED' &&
      check.conclusion === 'SUCCESS',
  );
  if (!passing || !qualityPassed) {
    throw new Error('All PR checks must pass, including the quality job');
  }
  for (const section of ['Summary', 'Walkthrough', 'Verification', 'Screenshots']) {
    const content = new RegExp(`^## ${section}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(
      pr.body,
    )?.[1];
    if (!content?.trim()) throw new Error(`PR requires a nonempty ## ${section} section`);
  }
  if (!/```mermaid\s*\n[\s\S]+?```/.test(pr.body)) {
    throw new Error('PR walkthrough requires a Mermaid C4-level diagram');
  }
  return { pr: pr.number, url: pr.url, head: pr.headRefOid, checks: 'passed' };
}

function command(program: string, args: string[]): string {
  return execFileSync(program, args, { encoding: 'utf8', timeout: 30_000 }).trim();
}

function main() {
  const branch = z.string().min(1).parse(process.argv[2]);
  if (command('git', ['status', '--porcelain'])) {
    throw new Error('Commit all work before preparing the review handoff');
  }
  if (command('git', ['branch', '--show-current']) !== branch) {
    throw new Error('Review verification must run in the assigned branch worktree');
  }
  const head = command('git', ['rev-parse', 'HEAD']);
  const fields = [
    'number',
    'url',
    'state',
    'isDraft',
    'baseRefName',
    'headRefName',
    'headRefOid',
    'body',
    'statusCheckRollup',
  ];
  const pr: unknown = JSON.parse(command('gh', ['pr', 'view', branch, '--json', fields.join(',')]));
  console.log(JSON.stringify(verifyReviewPackage(pr, branch, head)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
