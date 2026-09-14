import type { ReviewDetail, ReviewDirectory } from '../shared/reviews.ts';
import { parseReviewList, parseReviewDetail } from './reviews.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { parseAgents } from './agents.ts';
import {
  agentLaunchArgs,
  parseAgentOptions,
  parseAgentReply,
  parsePromptContext,
} from './agent-prompts.ts';
import type {
  AgentDirectory,
  AgentOption,
  AgentPrompt,
  AgentReply,
  Board,
  Card,
  CardDetail,
  CardGraph,
  LabelChange,
  Note,
} from '../shared/api.ts';
import {
  array,
  HttpError,
  object,
  parseCard,
  parseGraph,
  parseNote,
  parseRelation,
  parseTask,
  parseWork,
  strandErrorMessage,
} from './parse.ts';

const exec = promisify(execFile);
const cacheLifetime = 3_000;

/** One shared in-flight request per key; refresh failures remain visible to callers. */
class ReadCache<T> {
  private readonly values = new Map<string, { value: T; until: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private generation = 0;

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const running = this.pending.get(key);
    if (running) return running;
    const generation = this.generation;
    const request = load()
      .then((value) => {
        if (generation === this.generation)
          this.values.set(key, { value, until: Date.now() + cacheLifetime });
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  clear(): void {
    this.generation += 1;
    this.values.clear();
    this.pending.clear();
  }
}

export class StrandData {
  private readonly boards = new ReadCache<Board>();
  private readonly agentDirectories = new ReadCache<AgentDirectory>();
  private readonly details = new ReadCache<CardDetail>();
  private readonly graphs = new ReadCache<CardGraph>();
  private readonly replies = new ReadCache<AgentReply>();

  private readonly reviewDirectories = new ReadCache<ReviewDirectory>();
  private readonly reviewDetails = new ReadCache<ReviewDetail>();

  constructor(readonly workspace: string) {}

  reviews(): Promise<ReviewDirectory> {
    return this.reviewDirectories.get('reviews', async () => {
      try {
        return {
          kind: 'available',
          workspace: { path: this.workspace, name: basename(dirname(this.workspace)) },
          fetchedAt: new Date().toISOString(),
          reviews: parseReviewList(await this.run(['review', 'list', '--all', 'true'])),
        };
      } catch (error) {
        if (
          error instanceof HttpError &&
          /unknown (operation|subcommand|command)|operation .*not found|no such (operation|command)/i.test(
            error.message,
          )
        )
          return {
            kind: 'unsupported',
            message:
              'Reviews are not available in this weaver. Load a spool that provides strand review list and strand review show.',
          };
        throw error;
      }
    });
  }

  review(id: string): Promise<ReviewDetail> {
    return this.reviewDetails.get(id, async () =>
      parseReviewDetail(await this.run(['review', 'show', id])),
    );
  }

  private async run(args: string[]): Promise<unknown> {
    try {
      const { stdout } = await exec('strand', ['--workspace', this.workspace, ...args], {
        cwd: dirname(this.workspace),
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, MILLSTRAND_ERROR_FORMAT: 'json' },
      });
      return JSON.parse(stdout) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown strand failure';
      const stderr =
        error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
          ? error.stderr
          : '';
      throw new HttpError(
        502,
        strandErrorMessage(stderr, `Strand command failed: ${detail.slice(0, 1500)}`),
      );
    }
  }

  board(): Promise<Board> {
    return this.boards.get('board', async () => {
      const raw = object(await this.run(['kanban', 'board', '--all', 'true']), 'board');
      const cards = array(raw['cards'], 'board.cards').map(parseCard);
      const counts = new Map<string, number>();
      for (const card of cards) {
        for (const label of card.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return {
        workspace: { path: this.workspace, name: basename(dirname(this.workspace)) },
        fetchedAt: new Date().toISOString(),
        cards,
        labels: [...counts]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, count]) => ({ label, count })),
      };
    });
  }

  agents(): Promise<AgentDirectory> {
    return this.agentDirectories.get('agents', async () => {
      // The core list operation also works in worlds without the Harnesses spool.
      // Read one extra row so a bounded read never silently hides an active agent.
      const rows = array(await this.run(['list', '--limit', '10001']), 'agent strands');
      if (rows.length > 10000)
        throw new HttpError(503, 'Agent inspection is limited to workspaces with 10,000 strands.');
      return {
        workspace: { path: this.workspace, name: basename(dirname(this.workspace)) },
        fetchedAt: new Date().toISOString(),
        identities: parseAgents(rows),
      };
    });
  }

  async agentOptions(): Promise<AgentOption[]> {
    return parseAgentOptions(await this.run(['agent', 'list']));
  }

  agentReply(id: string): Promise<AgentReply> {
    return this.replies.get(id, async () => {
      const [summary, raw] = await Promise.all([
        this.run(['agent', 'show', id]),
        this.run(['show', id]),
      ]);
      const row = object(raw, 'run');
      const attrs = object(row['attributes'], 'run.attributes');
      return { ...parseAgentReply(summary), prompt: parsePromptContext(attrs['harness/context']) };
    });
  }

  async promptAgent(cardId: string, input: AgentPrompt): Promise<AgentReply> {
    const card = await this.card(cardId);
    if (
      input.targetId !== cardId &&
      !(await this.graph(cardId)).nodes.some((node) => node.id === input.targetId)
    )
      throw new HttpError(404, 'That strand is not in the selected card’s graph.');
    if (!(await this.agentOptions()).some((agent) => agent.name === input.alias))
      throw new HttpError(
        400,
        'That agent is not available headlessly in this weaver. Choose an available alias.',
      );
    const cwd = await this.agentDirectory(card);
    const reply = parseAgentReply(
      await this.run(agentLaunchArgs(this.workspace, cwd, cardId, input)),
    );
    this.agentDirectories.clear();
    return { ...reply, prompt: { cardId, text: input.prompt } };
  }

  private async agentDirectory(card: Card): Promise<string> {
    const root = dirname(this.workspace);
    if (card.worktree === null) return root;
    try {
      if (!isAbsolute(card.worktree)) throw new Error('Worktree path must be absolute.');
      const { stdout } = await exec('git', ['-C', root, 'worktree', 'list', '--porcelain', '-z'], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
      const known = stdout
        .split('\0')
        .filter((field) => field.startsWith('worktree '))
        .map((field) => resolve(field.slice('worktree '.length)));
      const cwd = resolve(card.worktree);
      if (!known.includes(cwd) || !(await stat(cwd)).isDirectory())
        throw new Error('The recorded worktree is missing or belongs to another repository.');
      return cwd;
    } catch {
      throw new HttpError(
        409,
        'The card’s recorded worktree is unavailable or is not registered in this weaver’s repository. Repair the card’s worktree before prompting.',
      );
    }
  }

  private async card(id: string): Promise<Card> {
    const card = (await this.board()).cards.find((card) => card.id === id);
    if (!card) throw new HttpError(404, `Kanban card ${id} was not found in this workspace.`);
    return card;
  }

  detail(id: string): Promise<CardDetail> {
    return this.details.get(id, async () => {
      const known = await this.card(id);
      const [cardPayload, notesPayload] = await Promise.all([
        this.run(['kanban', 'card', id]),
        this.run(['notes', id]),
      ]);
      const raw = object(cardPayload, 'card detail');
      const cardRaw = object(raw['card'], 'card detail.card');
      const attrs = object(cardRaw['attributes'], 'card.attributes');
      const body = attrs['body'];
      if (body !== undefined && typeof body !== 'string')
        throw new Error('card body must be a string');
      return {
        card: { ...parseCard(cardRaw), epicId: known.epicId },
        body: body ?? '',
        attributes: attrs,
        tasks: array(raw['tasks'], 'card detail.tasks').map(parseTask),
        notes: array(notesPayload, 'card notes').map(parseNote).reverse(),
        activeWork: array(raw['active-work'], 'card detail.active-work').map(parseWork),
        ready: array(raw['ready'], 'card detail.ready').map(parseWork),
        related: array(raw['related'], 'card detail.related').map(parseRelation),
      };
    });
  }

  graph(id: string): Promise<CardGraph> {
    return this.graphs.get(id, async () => {
      await this.card(id);
      return parseGraph(await this.run(['kanban-export', id]));
    });
  }

  async taskNotes(cardId: string, taskId: string): Promise<Note[]> {
    const detail = await this.detail(cardId);
    if (!detail.tasks.some((task) => task.id === taskId)) {
      throw new HttpError(404, 'That task does not belong to this kanban card.');
    }
    return array(await this.run(['notes', taskId]), 'task notes')
      .map(parseNote)
      .reverse();
  }

  async changeLabels(id: string, change: LabelChange): Promise<CardDetail> {
    await this.card(id);
    await this.run([
      'kanban',
      'label',
      change.action === 'add' ? 'add' : 'rm',
      id,
      ...change.labels,
    ]);
    this.boards.clear();
    this.details.clear();
    this.graphs.clear();
    return this.detail(id);
  }
}
