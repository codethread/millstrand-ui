(ns millstrand-ui.auto-run-workflows
  "Repository-owned delivery contracts for automatically assigned UI features."
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.format.alpha :as format]))

(s/def ::text (s/and string? (complement str/blank?)))
(s/def ::card ::text)
(s/def ::feature ::text)
(s/def ::branch ::text)
(s/def ::worktree ::text)
(s/def ::params (s/keys :req-un [::card ::feature ::branch ::worktree]))

(defn- shell-gate [id title dependencies argv timeout]
  (workflow/gate id title :shell
    :depends-on dependencies
    :attributes {"shell/argv" argv
                 "shell/cwd" (fn [{:keys [worktree]}] worktree)
                 "shell/timeout-secs" timeout}
    "Await this executor-owned gate. Inspect failures, repair the cause, then explicitly clear gate/error to retry. Never manually assert a passing result."))

(defn- delivery [autonomous?]
  (apply
   workflow/workflow
   (if autonomous? "Deliver automatically" "Prepare for human review")
   (concat
    [(workflow/step
      :implement "Implement and verify the assigned feature" :self
      (fn [{:keys [card]}]
        (format/prose
         "
           Read card {card}, its epic and tasks, and AGENTS.md. Claim the card
           with your provided identity, branch, worktree and Harnesses run ID.
           Work in the provided worktree; do not create a second one. Implement
           the scoped outcome yourself and record evidence on the card's tasks.
           Follow the architecture contract and preserve unrelated work.

           Verify the changed surfaces in a real browser at desktop and narrow
           widths. Capture screenshots when the work affects visible UI. Use
           disposable fixtures for mutations; never launch paid agents or
           publish external reviews as a smoke test. Add focused regression
           tests when behavior or ownership boundaries warrant them.

           Run pnpm quality while iterating. When implementation and browser
           verification are complete, commit your work and complete this step.
           Do not start land yet; the following steps own the review handoff.
         " {:card card})))
     (shell-gate :quality "Pass repository quality checks" [:implement]
                 ["pnpm" "quality"] 5400)
     (workflow/step
      :prepare-pr "Publish the exact change with its review package" :self
      :depends-on [:quality]
      (fn [{:keys [card branch]}]
        (format/prose
         "
           Push {branch} and create or update its PR against main. It must be
           ready for review, not a draft. The PR body must contain these exact
           nonempty Markdown sections:

           - ## Summary: outcome, scope and important decisions.
           - ## Walkthrough: explain the change with a Mermaid diagram at a
             useful C4 context/container/component level. Show the affected
             boundaries and data flow, not an exhaustive class diagram.
           - ## Verification: automated checks, browser pages/viewports/states,
             reproduction or manual testing instructions, and limitations.
           - ## Screenshots: accessible captured evidence for visible changes;
             otherwise explain specifically why screenshots are not applicable.

           Put the PR URL and concise handoff on card {card}; retain detailed
           evidence on its verification task. Complete this step only after
           publishing the committed revision and review package. The next gates
           independently wait for CI and verify the exact PR head and package.
         " {:card card :branch branch})))
     (shell-gate :ci "Wait for the PR checks" [:prepare-pr]
                 (fn [{:keys [branch]}]
                   ["gh" "pr" "checks" branch "--watch" "--fail-fast"])
                 2100)
     (shell-gate :verify-handoff "Verify the passing PR and review package" [:ci]
                 (fn [{:keys [branch]}]
                   ["node" "--experimental-transform-types"
                    "scripts/auto-run-review.ts" branch])
                 120)
     (workflow/gate
      :review-card "Move the verified feature into review" :code
      :depends-on [:verify-handoff]
      :attributes {"code/fn" "millhouse.spools.land.card-actions/review-card!"
                   "code/params" (fn [{:keys [card]}] {:card card})}
      "This is an automatic card transition after the review-package checks.")]
    (if autonomous?
      [(workflow/step
        :land "Drive shared land through completion" :self
        :depends-on [:review-card]
        (fn [{:keys [card branch worktree]}]
          (format/prose
           "
             This card has explicit user authorisation for autonomous landing.
             Start or continue the shared land run `land-auto-{card}`, supplying
             card {card}, feature {card}, branch {branch}, and worktree {worktree}.
             Inspect strand workflow show land and strand prime merge-queue.

             Drive all ordinary steps and adjudicate the mandatory basic review.
             Await executor-owned gates. Preserve the FIFO merge queue and record
             actual sign-off inputs; never bypass a failing check or review.
             Before land removes your worktree, change your shell cwd to the
             canonical checkout from wktree root. Keep using the same workspace.

             Complete this delivery step only after land has merged, cleaned up,
             and closed the card. Report failures or material scope changes for
             intervention rather than spawning a coordinator or retry loop.
           " {:card card :branch branch :worktree worktree})))]
      [(workflow/checkpoint
        :human-acceptance "Human review: return the passing PR and stop"
        :depends-on [:review-card]
        :kind :human
        :choices [{:key :reviewed :label "Human review recorded"}]
        :attributes
        {"workflow/instruction"
         (format/prose
          "
            Stop here and return the PR URL, walkthrough, screenshots or their
            applicability explanation, verification evidence and open questions.
            Do not choose this checkpoint, merge, start land, finish the card,
            remove the worktree, or remain running to poll for the user.

            The user will review and decide what happens next. Generic landing
            instructions on the epic do not override this explicit stop boundary.
          " {})})]))))

(workflow/defworkflow! auto-human-review
  "Prepare a passing, documented PR and stop for the user's full review."
  {:entrypoints #{:start} :param-spec ::params}
  (delivery false))

(workflow/defworkflow! auto-full-land
  "Prepare the same review package, then drive authorised shared landing."
  {:entrypoints #{:start} :param-spec ::params}
  (delivery true))
