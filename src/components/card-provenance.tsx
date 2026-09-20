import type { Card, IdentityAttribution, OwnershipClaim } from '../../shared/api';
import { formatDate } from '../lib/board';
import { attributionLabel, orderedOwnershipHistory } from '../lib/provenance';

export function AttributionName({
  attribution,
  absent,
}: {
  attribution: IdentityAttribution | null;
  absent?: string;
}) {
  const label = attributionLabel(attribution, absent);
  return (
    <span
      title={
        attribution !== null && attribution.status !== 'resolved'
          ? `Identity enrichment is ${attribution.status}; using the recorded friendly identity.`
          : undefined
      }
    >
      {label}
    </span>
  );
}

function ClaimRow({ claim, current }: { claim: OwnershipClaim; current: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <strong>{current ? 'Current owner' : 'Owner'}</strong>
      <AttributionName attribution={claim.owner} />
      <span className="text-xs text-muted-foreground">{formatDate(claim.claimedAt)}</span>
      {claim.actor !== null && claim.actor.identity !== claim.owner.identity && (
        <span className="text-xs text-muted-foreground">
          claimed by <AttributionName attribution={claim.actor} />
        </span>
      )}
    </li>
  );
}

/** Durable attribution comes from claims; note authors and session state never change it. */
export function CardProvenance({ card }: { card: Card }) {
  const history = orderedOwnershipHistory(card.ownership);
  const current = card.ownership.current;
  return (
    <section className="detail-section" aria-label="Reporter and ownership">
      <h3 className="detail-section-title">Reporter and ownership</h3>
      <dl className="property-list">
        <dt>Reporter</dt>
        <dd>
          <AttributionName attribution={card.reporter} absent="No durable reporter recorded" />
        </dd>
        <dt>Current owner</dt>
        <dd>{current === null ? 'Unassigned' : <AttributionName attribution={current.owner} />}</dd>
      </dl>
      {history.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Claim and handoff history · oldest first
          </p>
          <ol className="space-y-2">
            {history.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} current={claim.id === current?.id} />
            ))}
          </ol>
        </div>
      ) : (
        <p className="detail-empty mt-3">No explicit ownership claim has been recorded.</p>
      )}
    </section>
  );
}

export function CardOwnerSummary({ card }: { card: Card }) {
  return (
    <p className="text-xs text-muted-foreground">
      Owner:{' '}
      {card.ownership.current === null ? (
        'Unassigned'
      ) : (
        <AttributionName attribution={card.ownership.current.owner} />
      )}
    </p>
  );
}
