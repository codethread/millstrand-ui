# Native identity projection verification

Source contract: Harnesses `a67c8bfac1b2e11e0d05e8ab8b8db577d51040f4`.
No dependency pin, plugin installation, Weaver restart, or paid agent launch was used.

## Persisted lifecycle fixture

`server/workspace-database.test.ts` creates a disposable file-backed SQLite schema and
reads it through `WorkspaceDatabase` and `ProvenanceIndex`.

| State                   | Assertion                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Fresh published startup | Run is present with its exact `serves` target and no participant.                                                  |
| Native callback         | The same run gains its exact `performed` identity and observed model/effort.                                       |
| Assignment and claim    | Run targeting remains separate from the card's explicit `claims` / `claimed` owner.                                |
| Resume                  | `resumes` preserves the predecessor run and the same performed identity.                                           |
| Child                   | Identity-to-identity `parent-of` edges survive the bounded SQL projection.                                         |
| Completion              | Terminal status/substatus and historical association remain visible.                                               |
| External direct         | Alias and targets remain absent; observed model, literal `unknown` effort, external origin, and session are exact. |
| Refresh                 | A second persisted read after callback mutations replaces the pre-binding projection with bound evidence.          |

## Persisted association investigation

A read-only copy of the live workspace database showed duplicate friendly identities
are ordinary persisted evidence: `clear-silver-raven` has five identity strands,
`vivid-amber-shark` has four, and several names have two or three. Friendly-ID URLs
therefore explained the reported intermittent missing selection. All new UI links now
carry the immutable identity strand ID; a unique friendly selector remains only for old
shared URLs.

The same evidence showed identity strand `7br4o` (`vivid-amber-shark`) has two recorded
identity `parent-of` sources: `evk1r` (`swift-steady-swan`) and `k4g4w`
(`kind-bright-marten`). The projection preserves every exact parent strand ID as an
array. Identity/run association still comes only from `performed`, and an exact run
inspector now uses that run's session instead of the identity's newest session.

## Browser

The production build ran against the existing canonical workspace on port 4191. The
live run and card were inspected read-only; the card's current run, explicit owner,
target, exact session tail, tasks, and narrow selector agreed after refresh. Direct
navigation to duplicate friendly identity `clear-silver-raven` by exact strand `24nhe`
resolved the intended identity while retaining `agent=24nhe` in the URL.

- `agents-desktop.png` — filtered active Agents directory.
- `agent-inspector-narrow.png` — exact identity/run inspector at 390 × 844.
- `card-agents-desktop.png` — card participation and exact session tail at 1440 × 900.
- `card-agents-narrow.png` — refreshed narrow card roster with the `Tasks (2)` selector and
  both inherited-owner tasks.

The existing muted microcopy in the card log has an axe color-contrast finding; this
change does not alter those shared colors. No interaction, clipping, or narrow-layout
failure was observed.
