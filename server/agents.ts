import type { AgentIdentity, AgentRun } from '../shared/api.ts';
import { ProvenanceIndex } from './provenance.ts';

/**
 * Project registered identities and every published run from durable role edges.
 * A run is attached to identities only through `performed`; pre-binding runs stay
 * participant-free instead of consulting the superseded scalar identity snapshot.
 */
export function parseAgents(value: unknown): { identities: AgentIdentity[]; runs: AgentRun[] } {
  return new ProvenanceIndex(value).agents();
}
