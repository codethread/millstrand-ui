(ns me.reviewers
  "Declare review lenses specific to Millstrand UI."
  (:require [millhouse.harnesses :as harnesses]
            [millhouse.harnesses.reviewers :as reviewers]
            [millstrand.api.format.alpha :as format-alpha]
            [millstrand.api.lifecycle.alpha :as lifecycle]))

(defn open-di-reviewer-seat!
  "Inherit the reviewer seat with a lens-local xhigh effort override."
  [{:keys [runtime]}]
  (harnesses/register-alias!
   runtime :di-reviewer
   {:doc "Review service dependency injection with xhigh effort."
    :parent :reviewer
    :effort :xhigh
    :attributes {}}))

(defn close-di-reviewer-seat!
  "Remove only the repository-owned DI reviewer seat."
  [{:keys [runtime]}]
  (harnesses/unregister-alias! runtime :di-reviewer))

(lifecycle/defresource! di-reviewer-seat
  "Own the DI lens effort override without changing the shared reviewer seat."
  {:open 'me.reviewers/open-di-reviewer-seat!
   :close 'me.reviewers/close-di-reviewer-seat!})

(reviewers/defreviewer!
  test-mock-contracts
  "Check that test mocks match the APIs they replace."
  {:seat ['reviewer 'luna]
   :labels ["PR" "Tests" "Mocks" "API"]
   :glob ["**.{test,spec}.{ts,tsx}"]}
  (format-alpha/prose
   "
    Review changed TypeScript test and spec files for mocks, stubs, fakes,
    spies, fixtures, and simulated responses. For each mocked dependency,
    inspect the real API or authoritative boundary contract and verify that
    the substitute preserves the members, argument and return shapes,
    asynchronous behavior, errors, callbacks, and relevant side effects used
    by the code under test. Flag mocks that let tests pass while production
    behavior would fail, including stale response schemas and impossible call
    sequences. Do not request broader integration coverage unless a concrete
    mismatch makes the current test misleading.

    Report only actionable P1/P2 defects with repository-relative paths and
    line numbers, explain the API mismatch, and give the smallest practical
    fix. Say `No findings` when the mocks faithfully represent their APIs. Do
    not edit files or repository state.
    "
   {}))

(reviewers/defreviewer!
  dependency-injection
  "Find services coupled to I/O instead of injectable Clean Architecture boundaries."
  {:seat 'di-reviewer
   :labels ["PR" "Architecture" "DI"]
   :glob ["**.{ts,tsx,clj}"]}
  (format-alpha/prose
   "
    Review only service I/O coupling and dependency injection, not general
    correctness, style, mock fidelity, or test coverage. Inspect changed
    services and their callers/tests. Trace dependencies far enough to locate
    the actual boundary; do not turn the review into an unrelated repo-wide
    architecture rewrite.

    Apply Clean Architecture's dependency direction: domain/application logic
    must not depend on concrete filesystem, database, network, subprocess or
    logging implementations. Services should accept the capabilities they
    need through explicit parameters, constructor options, factories or scoped
    dependency overrides; production wiring belongs at the composition root.
    Prefer small consumer-owned contracts and ordinary functions, not a DI
    framework or an interface for every function.

    A service that MUST be mocked to isolate its consumers from I/O is a
    strong architectural smell, not a testing workaround to accept. Look for
    hard-wired imports, internally constructed I/O clients, import-time effects
    and mutable global dependencies that force module mocking, monkey-patching
    or spies on production implementations. Confirm there is no usable injection
    seam before reporting a finding: a test choosing a mock does not by itself
    prove the service requires one. Passing tests or faithful mocks do not
    excuse a missing boundary.

    Injectable in-memory fakes, function stubs, no-op implementations and
    explicit scoped overrides are valid solutions. They need only implement
    the consumer's contract, not replicate an entire external SDK. Do not flag
    real I/O inside a dedicated adapter, production composition root or focused
    adapter/integration test merely because it exists. The question is whether
    consumers can exercise their logic without real I/O or replacing module
    internals and globals.

    For every confirmed defect, require the implementor to refactor toward an
    injectable boundary. If that requires a wider architectural decision,
    require escalation to `oracle` with the concrete coupling evidence and the
    decision needed; more mocking is not an acceptable resolution. Report the
    required action, but do not edit code or launch oracle yourself.

    Report only actionable P1/P2 findings with repository-relative paths and
    line numbers, the coupled service and I/O dependency, why an existing seam
    is insufficient, and the smallest refactor or oracle escalation needed.
    Say `No findings` when the reviewed services have adequate boundaries.
    Do not mutate files, repository state or runtime configuration.
    "
   {}))
