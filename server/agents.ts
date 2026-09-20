import type { AgentIdentity, AgentRun } from '../shared/api.ts';
import { ProvenanceIndex } from './provenance.ts';

/**
 * Project registered identities and every published run from durable role edges.
 * A run is attached to identities only through `performed`; scalar identity/id is
 * retained solely as explicit unresolved provenance while enrichment is absent.
 */
export function parseAgents(value: unknown): { identities: AgentIdentity[]; runs: AgentRun[] } {
  return new ProvenanceIndex(value).agents();
}
