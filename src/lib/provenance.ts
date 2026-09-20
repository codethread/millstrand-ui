import type { CardOwnership, IdentityAttribution, OwnershipClaim } from '../../shared/api';

export function attributionLabel(
  attribution: IdentityAttribution | null,
  absent = 'Not recorded',
): string {
  if (attribution === null) return absent;
  if (attribution.status === 'resolved') return attribution.identity;
  return `${attribution.status === 'ambiguous' ? 'Ambiguous' : 'Unresolved'} identity: ${attribution.identity}`;
}

/** Claim order is authoritative, including a repeated owner after a handoff. */
export function orderedOwnershipHistory(ownership: CardOwnership): OwnershipClaim[] {
  return ownership.history.reduce<OwnershipClaim[]>((ordered, claim) => {
    const position = ordered.findIndex(
      (existing) =>
        existing.order > claim.order ||
        (existing.order === claim.order && existing.id.localeCompare(claim.id) > 0),
    );
    return position === -1
      ? [...ordered, claim]
      : [...ordered.slice(0, position), claim, ...ordered.slice(position)];
  }, []);
}

export function priorOwnership(ownership: CardOwnership): OwnershipClaim[] {
  const history = orderedOwnershipHistory(ownership);
  return ownership.current === null
    ? history
    : history.filter((claim) => claim.id !== ownership.current!.id);
}
