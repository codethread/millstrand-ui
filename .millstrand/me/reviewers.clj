(ns me.reviewers
  "Declare review lenses specific to Millstrand UI."
  (:require [millhouse.harnesses.reviewers :as reviewers]
            [millstrand.api.format.alpha :as format-alpha]))

#_{:clj-kondo/ignore [:unresolved-symbol]}
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
