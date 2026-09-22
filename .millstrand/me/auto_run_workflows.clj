(ns millstrand-ui.auto-run-workflows
  "Repository-owned delivery contracts for automatically assigned UI features."
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]
            [ct.spools.codethread.auto-run-land :as autonomous]
            [millhouse.spools.land.support :as land-support]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.format.alpha :as format]))

(s/def ::text (s/and string? (complement str/blank?)))
(s/def ::card ::text)
(s/def ::feature ::text)
(s/def ::branch ::text)
(s/def ::worktree ::text)
(s/def ::params (s/keys :req-un [::card ::feature ::branch ::worktree]))

(s/def ::on-change #{"human-review" "full-land" "stop"})
(s/def ::summary ::text)
(s/def ::evidence ::text)
(s/def ::findings ::text)
(s/def ::next-action ::text)
(s/def ::inspect-summary
  (s/keys :req-un [::summary ::evidence ::findings ::next-action]))
(s/def ::inspect-params
  (s/keys :req-un [::card ::feature ::branch ::worktree ::on-change]))

(defn- shell-gate [id title dependencies argv timeout failure-instruction]
  (workflow/gate id title :shell
    :depends-on dependencies
    :attributes {"shell/argv" argv
                 "shell/cwd" (fn [{:keys [worktree]}] worktree)
                 "shell/timeout-secs" timeout}
    failure-instruction))

(defn- delivery-failure-instruction [autonomous?]
  (if autonomous?
    (fn [{:keys [card]}] (autonomous/failure-policy card))
    "Await this executor-owned gate. Inspect failures, repair the cause, then explicitly clear gate/error to retry. Never manually assert a passing result."))

(defn- review-delivery
  "Return the shared quality, PR, verification, review-card and exit sequence.

  Both established delivery workflows and changed inspection routes use this
  sequence, so PR verification, review-card handling and autonomous landing
  remain one contract."
  [autonomous? dependencies]
  (let [failure-instruction (delivery-failure-instruction autonomous?)]
    (concat
     [(shell-gate :quality "Pass repository quality checks" dependencies
                  ["pnpm" "quality"] 5400 failure-instruction)
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
                    (land-support/pr-checks-argv "required" branch))
                  2100 failure-instruction)
      (shell-gate :verify-handoff "Verify the passing PR and review package" [:ci]
                  (fn [{:keys [branch]}]
                    ["node" "--experimental-transform-types"
                     "scripts/auto-run-review.ts" branch])
                  120 failure-instruction)
      (workflow/gate
       :review-card "Move the verified feature into review" :code
       :depends-on [:verify-handoff]
       :attributes {"code/fn" "millhouse.spools.land.card-actions/review-card!"
                    "code/params" (fn [{:keys [card]}] {:card card})}
       (if autonomous?
         failure-instruction
         "This is an automatic card transition after the review-package checks."))]
     (if autonomous?
       [(workflow/call :land #'autonomous/autonomous-land {}
                       :depends-on [:review-card]
                       :title "Review and hand off autonomous landing")]
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

           {failure-policy}
         " {:card card :failure-policy (if autonomous? (autonomous/failure-policy card) "")}))) ]
    (review-delivery autonomous? [:implement]))))

(defn- clean-worktree-argv []
  ["sh" "-ceu"
   "test -z \"$(git status --porcelain)\"\ntest \"$(git rev-list --count origin/main..HEAD)\" -eq 0"])

(defn- clean-inspection-cleanup-gate [id dependencies]
  (workflow/gate
   id "Remove the clean inspection worktree and branch" :shell
   :depends-on dependencies
   :attributes
   {"shell/argv"
    (fn [{:keys [branch worktree]}]
      ["sh" "-ceu"
       "branch=$1\nworktree=$2\nroot=$(dirname \"$(git -C \"$worktree\" rev-parse --path-format=absolute --git-common-dir)\")\ntest \"$branch\" != main\ntest \"$branch\" = \"$(git -C \"$worktree\" branch --show-current)\"\nrm -rf \"$worktree/node_modules\" \"$worktree/dist\" \"$worktree/coverage\"\nfind \"$worktree\" -type f \\( -name '*.tsbuildinfo' -o -name '.DS_Store' \\) -delete\ntest -z \"$(git -C \"$worktree\" status --porcelain --ignored --untracked-files=all)\"\ntest \"$(git -C \"$worktree\" rev-list --count origin/main..HEAD)\" -eq 0\ngit -C \"$root\" worktree remove \"$worktree\"\ngit -C \"$root\" branch -d \"$branch\""
       "clean-inspection-cleanup" branch worktree])
    "shell/cwd" (fn [{:keys [worktree]}] worktree)
    "shell/timeout-secs" 120}
   "Cleanup discards known build artifacts, but refuses to remove a worktree containing any other ignored files so local configuration is not deleted. Leave the card open and record the retained paths if cleanup refuses to remove it."))

(defn- inspect-introduction [{:keys [card on-change]}]
  (format/prose
   "
     Read card {card}, its epic and tasks, and AGENTS.md. Claim the card with
     your provided identity, branch, worktree and Harnesses run ID. Work in the
     provided worktree; do not create a second one. Perform the bounded
     investigation, audit, exploratory review or regression check the card
     requests. Record the evidence and findings on the card and its tasks.

     Do not manufacture a code change. If a bounded fix is necessary, make and
     test it only when it is within the card's scope. Before choosing a
     disposition, use the structured choice input to preserve: summary,
     evidence, findings, and a recommended next action. Copy that same
     structured summary into a card note using `strand kanban note --by`.

     The admitted changed-work policy is `{on-change}`. It cannot be changed
     from this workflow run. Product findings use needs-review or blocked.
   " {:card card :on-change on-change}))

(defn- inspect-disposition []
  (workflow/checkpoint
   :disposition "Record evidence and choose the inspection disposition"
   :depends-on [:inspect]
   :kind :agent
   :choices [{:key :clean
              :label "Clean: evidence only, no repository changes"
              :next :auto-inspect-clean
              :input {:spec ::inspect-summary
                      :doc "Structured inspection summary, evidence, findings, and recommended next action."}}
             {:key :fixed
              :label "Fixed: bounded repository changes need ordinary delivery"
              :next :auto-inspect-fixed
              :input {:spec ::inspect-summary
                      :doc "Structured inspection summary, evidence, findings, and recommended next action."}}
             {:key :needs-review
              :label "Needs review: findings require a human decision"
              :next :auto-inspect-needs-review
              :input {:spec ::inspect-summary
                      :doc "Structured inspection summary, evidence, findings, and recommended next action."}}
             {:key :blocked
              :label "Blocked: trustworthy blocker prevents a conclusion"
              :next :auto-inspect-blocked
              :input {:spec ::inspect-summary
                      :doc "Structured inspection summary, evidence, findings, and recommended next action."}}]))

(workflow/defworkflow! auto-human-review
  "Prepare a passing, documented PR and stop for the user's full review."
  {:entrypoints #{:start} :param-spec ::params}
  (delivery false))

(workflow/defworkflow! auto-full-land
  "Prepare and review the change, then hand shared landing to a canonical-root grunt."
  {:entrypoints #{:start} :param-spec ::params}
  (delivery true))

(workflow/defworkflow! auto-inspect
  "Inspect a card with durable evidence and a safe clean, fixed, review, or blocked disposition."
  {:entrypoints #{:start} :param-spec ::inspect-params}
  (workflow/workflow
   "Inspect the assigned feature"
   (workflow/step :inspect "Inspect the card-defined scope" :self inspect-introduction)
   (inspect-disposition)))

(workflow/defworkflow! auto-inspect-clean
  "Verify evidence-only work is clean, then finish the card without a PR."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (workflow/workflow
   "Finish clean inspection"
   (shell-gate :verify-clean "Verify no dirty files or commits ahead" []
               (fn [_] (clean-worktree-argv)) 120
               "The clean disposition is invalid while files are dirty or commits are ahead. Leave the card open and record the actual finding; do not manufacture a PR.")
   (clean-inspection-cleanup-gate :cleanup-clean [:verify-clean])
   (workflow/gate
    :reserve-clean-finish "Reserve the claimed card for clean completion" :code
    :depends-on [:cleanup-clean]
    :attributes {"code/fn" "millstrand-ui.auto-run/mark-clean-finishing!"
                 "code/params" (fn [{:keys [card]}] {:card card})}
    "This atomically reserves the still-claimed card after cleanup. A concurrent review transition leaves the card open rather than completing a clean inspection.")
   (workflow/gate
    :finish-card "Finish the clean evidence-only card" :code
    :depends-on [:reserve-clean-finish]
    :attributes {"code/fn" "millhouse.spools.land.card-actions/finish-card!"
                 "code/params" (fn [{:keys [card]}] {:card card})}
    "This closes only the clean, evidenced card after its disposable worktree and branch are removed. It does not create, push, or review a PR.")))

(workflow/defworkflow! auto-inspect-fixed
  "Select the admitted changed-work delivery policy after recording fixed evidence."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (workflow/workflow
   "Route bounded fixes"
   (workflow/checkpoint
    :human-review "Continue fixed work to human review" :kind :agent
    :condition [:= :on-change "human-review"]
    :choices [{:key :continue :label "Use the admitted human-review policy"
               :next :auto-inspect-fixed-human-review}]
    :attributes {"workflow/instruction" "The card admitted human-review before dispatch. Choose the sole option; do not replace the policy or bypass PR verification."})
   (workflow/checkpoint
    :full-land "Continue fixed work to autonomous landing" :kind :agent
    :condition [:= :on-change "full-land"]
    :choices [{:key :continue :label "Use the admitted full-land policy"
               :next :auto-inspect-fixed-full-land}]
    :attributes {"workflow/instruction" "The card admitted full-land before dispatch. Choose the sole option; ordinary delivery, review and the existing finisher own landing."})
   (workflow/checkpoint
    :stop "Stop after quality for a human delivery decision" :kind :agent
    :condition [:= :on-change "stop"]
    :choices [{:key :continue :label "Use the admitted stop policy"
               :next :auto-inspect-fixed-stop}]
    :attributes {"workflow/instruction" "The card admitted the conservative stop policy before dispatch. Choose the sole option; quality runs, then the card remains open without a PR."})))

(workflow/defworkflow! auto-inspect-fixed-human-review
  "Run ordinary reviewed delivery for a bounded inspection fix."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (apply workflow/workflow "Prepare fixed inspection for human review"
         (review-delivery false [])))

(workflow/defworkflow! auto-inspect-fixed-full-land
  "Run ordinary autonomous delivery for a bounded inspection fix."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (apply workflow/workflow "Deliver fixed inspection automatically"
         (review-delivery true [])))

(workflow/defworkflow! auto-inspect-fixed-stop
  "Run quality for a bounded inspection fix, then leave its delivery open."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (workflow/workflow
   "Verify fixed inspection and stop"
   (shell-gate :quality "Pass repository quality checks" []
               ["pnpm" "quality"] 5400
               "A quality failure is a product result to record and repair; leave the card open.")
   (workflow/step
    :stop "Leave the fixed card open for a human delivery decision" :self
    :depends-on [:quality]
    (fn [{:keys [card]}]
      (format/prose
       "
         Quality passed, but the admitted on-change policy is stop. Record the
         exact commit, quality evidence and recommended next action on card
         {card}, then return. Do not create a PR, move the card to review,
         start land, or finish the card.
       " {:card card})))))

(workflow/defworkflow! auto-inspect-needs-review
  "Move an evidence-backed inspection finding into review and stop."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (workflow/workflow
   "Hand inspection findings to review"
   (shell-gate :verify-clean "Verify findings left no dirty files or commits ahead" []
               (fn [_] (clean-worktree-argv)) 120
               "Code changes cannot use needs-review to bypass quality and ordinary delivery. Record the actual fix as fixed, or clean the worktree before returning an evidence-only finding.")
   (clean-inspection-cleanup-gate :cleanup-clean [:verify-clean])
   (workflow/gate
    :review-card "Move the finding card into review" :code
    :depends-on [:cleanup-clean]
    :attributes {"code/fn" "millhouse.spools.land.card-actions/review-card!"
                 "code/params" (fn [{:keys [card]}] {:card card})}
    "Move this evidence-backed finding to review. This is not a PR or landing transition.")
   (workflow/step
    :stop "Stop with findings and a recommended next action" :self
    :depends-on [:review-card]
    (fn [{:keys [card]}]
      (format/prose
       "
         The card is in review. Return the structured finding, evidence and
         recommended next action recorded for {card}. Do not manufacture a code
         change, PR, or landing run for this inspection outcome.
       " {:card card})))))

(workflow/defworkflow! auto-inspect-blocked
  "Leave a blocked inspection open with its durable blocker evidence."
  {:entrypoints #{:continue} :param-spec ::inspect-params}
  (workflow/workflow
   "Stop blocked inspection"
   (shell-gate :verify-clean "Verify blocker evidence left no dirty files or commits ahead" []
               (fn [_] (clean-worktree-argv)) 120
               "Code changes cannot use blocked to bypass quality and ordinary delivery. Record the actual fix as fixed, or clean the worktree before leaving a blocker open.")
   (clean-inspection-cleanup-gate :cleanup-clean [:verify-clean])
   (workflow/step
    :stop "Leave the blocked card open with trustworthy evidence" :self
    :depends-on [:cleanup-clean]
    (fn [{:keys [card]}]
      (format/prose
       "
         Leave card {card} claimed and open. Return the structured blocker,
         attempted evidence and recommended next action recorded for it. Do not
         claim success, create a PR, move the card to review, or finish the card.
       " {:card card})))))
