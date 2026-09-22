(ns me.reviewers
  "Declare review lenses specific to Millstrand UI."
  (:require [ct.spools.harnesses.reviewers :as reviewers]
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

#_{:clj-kondo/ignore [:unresolved-symbol]}
(reviewers/defreviewer!
  repository-images
  "Reject repository images unless they are small decorative UI assets."
  {:seat 'grunt
   :labels ["PR" "Images" "Repository size"]
   :glob ["**/*.{png,PNG,jpg,JPG,jpeg,JPEG,svg,SVG,gif,GIF,webp,WEBP,avif,AVIF,bmp,BMP,ico,ICO,tif,TIF,tiff,TIFF}"]}
  (format-alpha/prose
   "
    Review every added, modified, or renamed image. Deletions are allowed.
    An image is valid in Git only when all of these are true:

    - it is a decorative asset used by the product UI, rather than evidence,
      documentation, a screenshot, a test artifact, or generated output;
    - its committed blob is no larger than 100 KiB (102,400 bytes); and
    - its repository location and a concrete code reference show that it ships
      as part of the UI.

    Any image under `docs/`, any path segment named `evidence`, and any
    screenshot or documentation image must live in external artifact storage
    such as GitHub user content, never in this repository. Flag every violating
    addition, modification, or rename as an actionable P1 finding. Inspect the
    actual file or Git blob size; do not infer size from the textual diff. Do
    not accept an image merely because it is small, optimized, or referenced
    from Markdown. Do not choose or require a particular CDN.

    Report repository-relative paths, byte sizes, the failed condition, and the
    smallest fix (remove the file and use an external URL for evidence or docs).
    Say `No findings` only when every changed image satisfies all conditions or
    the image changes are deletions. Do not edit files or repository state.
    "
   {}))
