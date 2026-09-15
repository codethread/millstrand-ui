import type { ReviewDetail, ReviewDirectory } from '../shared/reviews.ts';
import {
  reviewPublicationBlock,
  type CurateReview,
  type ReviewComments,
  type PublishReview,
  type ReviewPublicationReceipt,
} from '../shared/review-comments.ts';
import { parseReviewComments, parseReviewPublicationReceipt } from './review-comments.ts';
import { parseReviewList, parseReviewDetail } from './reviews.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { parseAgents } from './agents.ts';
import { readAgentStrands } from './agent-inspection.ts';
import {
  agentLaunchArgs,
  parseAgentOptions,
  parseAgentReply,
  parsePromptContext,
  reviewPromptContext,
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
          reviews: parseReviewList(await this.run(['review', 'list', '--all'])),
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
    return this.reviewDetails.get(id, () => this.readReview(id));
  }

  private async readReview(id: string): Promise<ReviewDetail> {
    return parseReviewDetail(await this.run(['review', 'show', id]));
  }

  async reviewComments(id: string): Promise<ReviewComments> {
    const snapshot = parseReviewComments(await this.run(['review', 'comments', id]));
    if (snapshot.review.id !== id)
      throw new HttpError(502, 'Review comments returned a different review.');
    return snapshot;
  }

  async publishReview(id: string, input: PublishReview): Promise<ReviewPublicationReceipt> {
    const snapshot = await this.reviewComments(id);
    if (
      snapshot.review.revision !== input.revision ||
      snapshot.review.curation.version !== input.curationVersion
    )
      throw new HttpError(409, 'The saved review snapshot changed. Refresh before sending.');
    const blocked = reviewPublicationBlock(snapshot);
    if (blocked) throw new HttpError(409, blocked);
    try {
      const receipt = parseReviewPublicationReceipt(
        await this.run(['review', 'publish', id, '--request', JSON.stringify(input)]),
      );
      if (
        receipt.reviewId !== id ||
        receipt.revision !== input.revision ||
        receipt.curationVersion !== input.curationVersion
      )
        throw new HttpError(
          502,
          'Publication returned a different snapshot receipt. Refresh to inspect the outcome before retrying.',
        );
      const included = new Set(
        snapshot.comments
          .filter((comment) => comment.inclusion === 'included')
          .map((comment) => comment.id),
      );
      if (
        receipt.comments.length !== included.size ||
        receipt.comments.some((comment) => !included.has(comment.id))
      )
        throw new HttpError(
          502,
          'Publication returned incomplete or unrelated comment receipts. Refresh to inspect the outcome.',
        );
      return receipt;
    } finally {
      // A timeout may follow a remote effect. Never clear local curation or infer rollback.
      this.reviewDetails.clear();
      this.reviewDirectories.clear();
    }
  }

  async curateReview(id: string, input: CurateReview): Promise<ReviewComments> {
    const current = await this.reviewComments(id);
    if (
      !current.review.current ||
      !current.review.curation.mutable ||
      current.review.revision !== input.revision ||
      current.review.curation.version !== input.expectedVersion
    )
      throw new HttpError(
        409,
        'Review curation changed or is locked. Refresh and inspect the current comment before retrying.',
      );
    for (const change of input.changes) {
      const comment = current.comments.find((comment) => comment.id === change.id);
      if (!comment) throw new HttpError(404, 'Comment is not in this review.');
      if (change.candidate && change.candidate.expectedVersion !== comment.candidate.version)
        throw new HttpError(409, 'The candidate changed. Your draft has been retained.');
    }
    const result = parseReviewComments(
      await this.run([
        'review',
        'curate',
        id,
        '--request',
        JSON.stringify({ ...input, by: 'millstrand-ui' }),
      ]),
    );
    if (result.review.id !== id) throw new HttpError(502, 'Curation returned a different review.');
    this.reviewDetails.clear();
    return result;
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
      const rows = await readAgentStrands(this.workspace);
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
    if (
      (input.targetKind === 'review' || input.targetKind === 'review-comment') &&
      input.targetId !== cardId
    )
      throw new HttpError(404, 'The review target must match the selected review.');
    // Dispatch must validate current authoritative state, not the polling cache.
    const review =
      input.targetKind === 'review' || input.targetKind === 'review-comment'
        ? await this.readReview(cardId)
        : null;
    if (review !== null && review.id !== cardId)
      throw new HttpError(404, 'The selected review was not found.');
    if (review !== null && (review.state !== 'active' || review.decision !== 'pending'))
      throw new HttpError(
        409,
        'This review is no longer active and pending. Refresh the review before prompting.',
      );
    const card = review ?? (await this.card(cardId));
    if (review !== null && review.worktree === null)
      throw new HttpError(
        409,
        'This review has no recorded worktree. Record its review worktree before prompting.',
      );
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
    let context = review === null ? null : reviewPromptContext(review, this.workspace);
    if (input.targetKind === 'review-comment') {
      const snapshot = await this.reviewComments(cardId);
      const comment = snapshot.comments.find((comment) => comment.id === input.comment.id);
      if (!comment) throw new HttpError(404, 'Comment is not in this review.');
      if (
        !snapshot.review.current ||
        !snapshot.review.curation.mutable ||
        snapshot.review.revision !== input.comment.revision ||
        comment.candidate.version !== input.comment.candidateVersion
      )
        throw new HttpError(
          409,
          'The comment changed or curation is locked. Refresh before prompting.',
        );
      context += `\nComment Strand: ${comment.id}; candidate version: ${comment.candidate.version}; frozen revision: ${snapshot.review.revision}. Inspect strand show ${comment.id} and strand review comments ${cardId} for its canonical text and position. Return only proposed revised comment text for the user to inspect and edit. Do not adopt, curate, publish, or change canonical comment text; adoption is a separate explicit user action.`;
    }
    const reply = parseAgentReply(
      await this.run(agentLaunchArgs(this.workspace, cwd, cardId, input, context)),
    );
    this.agentDirectories.clear();
    return {
      ...reply,
      prompt: {
        cardId,
        text: input.prompt,
        ...(context === null
          ? { kind: 'card' as const }
          : input.targetKind === 'review-comment'
            ? { kind: 'review-comment' as const, context, comment: input.comment }
            : { kind: 'review' as const, context }),
      },
    };
  }

  private async agentDirectory(card: Pick<Card, 'worktree'>): Promise<string> {
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
        'The selected work item’s recorded worktree is unavailable or is not registered in this weaver’s repository. Repair its recorded worktree before prompting.',
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
