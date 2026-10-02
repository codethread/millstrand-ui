(ns millstrand-ui.land
  "Millstrand UI's one-seat review and squash landing policy."
  (:require [clojure.java.io :as io]
            [clojure.spec.alpha :as s]
            [millhouse.land.support :as support]
            [millhouse.workflow :as workflow]
            [millhouse.workflow.execution :as execution]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.format.alpha :as format-alpha]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.millstrand.alpha :as millstrand]
            [millstrand.api.runtime.alpha :as runtime]
            [millstrand.api.weaver.alpha :as weaver]
            [millstrand.api.spool.alpha :refer [attr-get fail! require-valid!]]))

(defn- landing-workspace [worktree]
  (.getCanonicalPath (io/file (support/canonical-worktree worktree) ".millstrand")))

(defn- require-landing-workspace! [worktree]
  (let [expected (landing-workspace worktree)
        actual (.getCanonicalPath
                (io/file (get-in (current/runtime) [:metadata :config-dir])))]
    (when-not (= expected actual)
      (fail! "Start Land in the canonical workspace, not the feature worktree's Weaver"
             {:workspace actual :expected-workspace expected :worktree worktree}))))

(defn- non-blank-string?
  "Return true when v is a non-blank string."
  [v]
  (support/non-blank-string? v))

(s/def ::non-blank-string non-blank-string?)
(s/def ::body ::non-blank-string)
(s/def ::worktree ::non-blank-string)
(s/def ::feature ::non-blank-string)
(s/def ::branch ::non-blank-string)
(s/def ::card ::non-blank-string)
(s/def ::subject ::non-blank-string)
(s/def ::reason ::non-blank-string)
(s/def ::reviewer ::non-blank-string)
(s/def ::sha
  (s/and ::non-blank-string
         #(boolean (re-matches #"(?i)[0-9a-f]{40}" %))))
(s/def ::base ::sha)
(s/def ::head ::sha)
(s/def ::summary ::non-blank-string)
(s/def ::p1-p2 #{"none" "resolved"})
(s/def ::pr-number pos-int?)

(s/def ::review-params
  (s/keys :req-un [::feature ::branch ::worktree]
          :opt-un [::card ::pr-number ::reviewer]))
(s/def ::land-params ::review-params)
(s/def ::land-merge-params
  (s/keys :req-un [::feature ::branch ::worktree ::subject ::body ::pr-number]
          :opt-un [::card ::reviewer]))
(s/def ::land-abort-params
  (s/keys :req-un [::branch ::reason] :opt-un [::card]))
(s/def ::land-abort-input
  (s/and (s/keys :req-un [::reason])
         #(every? #{:reason} (keys %))))
(s/def ::land-merge-input
  (s/and (s/keys :req-un [::pr-number ::subject ::body])
         #(every? #{:pr-number :subject :body} (keys %))))
(s/def ::review-resolution-input
  (s/and (s/keys :req-un [::reviewer ::base ::head ::p1-p2 ::summary])
         #(every? #{:reviewer :base :head :p1-p2 :summary} (keys %))))

(def ^:private review-resolution-input
  "Describe the coordinator's mandatory review resolution evidence."
  {:spec ::review-resolution-input
   :doc "The one reviewer, immutable range, summary, and resolved P1/P2 state."})

(def ^:private land-abort-reason-input
  "Describe the sign-off abort input."
  {:spec ::land-abort-input
   :doc "Why landing is being aborted."})

(def ^:private land-merge-input
  "Describe the sign-off approval input."
  {:spec ::land-merge-input
   :doc "The exact pull request and squash commit message approved for landing."})

(defn- stage [name]
  {:attributes {"workflow/family" "land"
                "land/version" 4
                "land/stage" name
                "land/abort-definition" "millstrand-ui.land/land-abort"}})

(def ^:private retry-instruction
  (format-alpha/prose
   "
     Inspect the failed gate's output, repair the cause, then clear `gate/error`
     to retry. Keep the FIFO turn and merge lock; do not requeue at the back.
     Obtain focused review for material repairs. Request a user decision only
     when repair changes the authorized scope or ownership. Before a merge has
     been submitted, withdraw safely if that decision requires changing the plan.
   " {}))

(defn- review-prompt
  [{:keys [branch worktree reviewer]}]
  (format-alpha/prose
   "
     Act as the single `{reviewer}` review seat for branch `{branch}` in
     `{worktree}`. Review only; do not modify the worktree.

     Verify the checkout is clean and on `{branch}`. Resolve `HEAD`,
     `origin/{branch}`, `origin/main`, and the quality marker at
     `$(git rev-parse --git-path millstrand-land-quality-head)`. Require HEAD,
     origin/{branch}, and the marker to be the same full commit SHA. Set the
     immutable review base to `git merge-base origin/main HEAD`, then inspect
     that exact base..HEAD range.

     Report concrete correctness, data-loss, concurrency, and cleanup findings,
     prioritizing P1/P2 issues with paths and lines. Say explicitly when there
     are no P1/P2 findings. A successful reviewer run supplies findings; it does
     not approve landing. The following coordinator checkpoint adjudicates and
     records the result.
   " {:reviewer reviewer :branch branch :worktree worktree}))

(workflow/defworkflow! review
  "Run one configured review agent, then require coordinator P1/P2 resolution."
  {:entrypoints #{:start :call}
   :param-spec ::review-params
   :defaults {:reviewer "reviewer"}
   :param-docs {:feature "Work identity under review."
                :branch "Pushed feature branch reviewed against origin/main."
                :worktree "Absolute path to the clean feature worktree."
                :card "Optional kanban card to keep in progress during agent review."
                :pr-number "Optional pull request identity carried with the work."
                :reviewer "Single configured agent seat; defaults to reviewer."}}
  (workflow/workflow
   (fn [{:keys [branch]}] (str "Review: " branch))
   {:attributes {"workflow/family" "review"}}
   (support/card-gate :progress-card "Keep the optional card in progress during agent review" []
                      "millhouse.land.card-actions/rework-card!")
   (support/shell-gate
    :review-quality "Validate the pushed HEAD before review" [:progress-card]
    (fn [{:keys [branch]}]
      (support/sh-gate support/land-quality-gate-script "review-quality" branch))
    5400
    "Commit and push the clean branch. Fix failed checks, then clear gate/error to retry.")
   (workflow/gate
    :review-agent "Run the one-seat code review" :agent
    :depends-on [:review-quality]
    :attributes {"harness/alias" (fn [{:keys [reviewer]}] reviewer)
                 "harness/cwd" (fn [{:keys [worktree]}] worktree)
                 "harness/prompt" review-prompt
                 "review/role" "reviewer"}
    (format-alpha/prose
     "
       The configured agent reviews one frozen range. Provider success advances
       to coordinator triage; it does not imply that findings are accepted.
       Repair provider failures and retry this gate without inventing evidence.
     " {}))
   (workflow/checkpoint
    :resolve-review "Resolve and record the review findings"
    :depends-on [:review-agent]
    :kind :agent
    :choices [{:key :accepted
               :label "Accept the resolved review"
               :input review-resolution-input}]
    :attributes
    {"workflow/instruction"
     (format-alpha/prose
      "
        Read the review-agent gate's `harness/result`. Adjudicate every finding;
        reviewer process success is not approval. Resolve all P1/P2 findings and
        compare the recorded base and head with the immutable reviewed range.
        Choose `accepted` only with the reviewer seat, full base and head SHAs,
        `p1-p2` equal to `none` or `resolved`, and a concise resolution summary.
        The checkpoint retains that evidence. If repairs change HEAD, obtain
        focused follow-up review before accepting.

        A supplemental review needs a live, dedicated review target. Do not resume
        a reviewer whose executor gate has already closed: native continuation
        retains that closed target and cannot launch. Keep the completed gate's
        evidence; run follow-up review on a separate active task and record its
        exact range and findings here. Do not reopen or repour the original gate.
      " {})})))

(workflow/defworkflow! land-abort
  "Record an aborted landing and leave the work available for follow-up."
  {:entrypoints #{:start :continue} :param-spec ::land-abort-params :defaults {}}
  (workflow/workflow
   (fn [{:keys [branch]}] (str "Abort land: " branch))
   (update (stage "abort") :attributes assoc
           "land/abort-reason" (fn [{:keys [reason]}] reason))
   (support/card-gate :return-card "Pause unfinished work" []
                      "millhouse.land.card-actions/pause-card!")
   (workflow/step :record-abort "Record the abort and hand over the work" :self
                  :depends-on [:return-card]
                  :attributes {"land/abort-reason" (fn [{:keys [reason]}] reason)}
                  (format-alpha/prose
                   "
                     Record the abort reason on the work task. Leave the PR, branch,
                     and worktree available for follow-up. Discuss major changes
                     with the user.
                     Before ending, reconcile the card lane: pending without an
                     active successor, in_review only for a recorded human action,
                     claimed only while an agent is actively repairing the work.
                   " {}))))

(workflow/defworkflow! land-merge
  "Land approved work in FIFO order."
  {:entrypoints #{:continue} :param-spec ::land-merge-params :defaults {}}
  (workflow/workflow
   (fn [{:keys [branch]}] (str "Merge land: " branch))
   (stage "merge")
   (workflow/gate :take-turn "Join the queue and await the merge turn" :merge-turn
                  (fn [{:keys [worktree]}]
                    (format-alpha/prose
                     "
                       Queue admission and acquisition are automatic. Await this run:

                       ```text
                       strand --workspace \"{workspace}\" workflow await <run-id>
                       ```

                       Inspect its place:

                       ```text
                       strand --workspace \"{workspace}\" merge-queue status
                       ```

                       Failures and timeouts retain the turn. A predecessor's failed
                       gate is not a failure of this run. Notify its recovery owner and
                       keep awaiting this same run; do not end landing custody or mark
                       your card as needing review solely because the predecessor is
                       blocked. Re-read the current frontier after each wait and
                       continue through housekeeping.

                       Any trusted agent may withdraw with:

                       ```text
                       strand --workspace \"{workspace}\" merge-queue withdraw <entry-id> --reason <reason>
                       ```

                       Withdrawal stops shell work first; a possibly submitted merge
                       requires reconciliation instead.
                     " {:workspace (landing-workspace worktree)})))
   (support/shell-gate :prepare-merge "Update the branch and validate its final HEAD"
                       [:take-turn]
                       (fn [{:keys [branch]}]
                         (support/sh-gate (support/script "land-prepare.sh")
                                          "land-prepare" branch "rebase"
                                          support/land-quality-gate-script))
                       5400 retry-instruction)
   (update (support/shell-gate
            :merge-pr "Squash-merge the validated PR" [:prepare-merge]
            (fn [{:keys [pr-number subject body branch]}]
              (support/sh-gate support/land-merge-script
                               "land-merge" (str pr-number) subject body branch
                               "squash"))
            300 retry-instruction)
           :attributes assoc "land/irreversible" true)
   (support/shell-gate :pull-main "Fast-forward canonical main" [:merge-pr]
                       ["sh" "-c" support/land-pull-main-script]
                       300 retry-instruction)
   (workflow/gate :release-turn "Release the merge turn before housekeeping" :merge-release
                  :depends-on [:pull-main]
                  "Release is automatic. On failure, repair the cause and clear gate/error to retry.")
   (workflow/gate :remove-branch-worktree "Remove the landed branch and worktree" :shell
                  :depends-on [:release-turn]
                  :attributes {"shell/argv"
                               (fn [{:keys [branch worktree pr-number]}]
                                 (support/land-cleanup-argv branch worktree pr-number))
                               "shell/cwd" (fn [{:keys [worktree]}]
                                             (support/canonical-worktree worktree))
                               "shell/timeout-secs" 600}
                  (format-alpha/prose
                   "
                     Cleanup is automatic and repeatable after worktree removal.
                     On failure, repair the cause and clear `gate/error` to retry.
                     The next landing may be running; leave its resources alone.
                   " {}))
   (support/card-gate :finish-card "Finish the optional kanban card" [:remove-branch-worktree]
                      "millhouse.land.card-actions/finish-card!")))

(workflow/defworkflow! land
  "Review and squash-merge Millstrand UI work through a durable FIFO turn."
  {:entrypoints #{:start}
   :param-spec ::land-params
   :defaults {:reviewer "reviewer"}
   :param-docs {:feature "Work identity being landed."
                :branch "Branch containing the change."
                :worktree "Absolute path to the branch's worktree."
                :card "Optional kanban card in the canonical workspace to finish after landing."
                :pr-number "Existing draft or ready PR; omit to resolve from the branch."
                :reviewer "Single configured review agent seat; defaults to reviewer."}}
  (workflow/workflow
   (fn [{:keys [branch]}] (str "Land: " branch))
   (stage "ready")
   (workflow/step :resolve-pr "Resolve and verify the pull request" :self
                  (fn [{:keys [pr-number branch worktree]}]
                    (require-landing-workspace! worktree)
                    (format-alpha/prose
                     "
                       {pr}Push the clean `{branch}` branch. Reuse its open PR,
                       draft or ready; create one only if absent. Confirm the PR
                       head is `{branch}` and its base is `main`.
                     " {:pr (if pr-number (str "Use PR #" pr-number ". ") "")
                        :branch branch})))
   (workflow/call :review #'review {} :depends-on [:resolve-pr]
                  :title "Complete required one-seat review")
   (workflow/checkpoint :signoff "Authorize this work to land" :depends-on [:review]
                        :kind :agent
                        :choices [{:key :approved :label "Approve and join the queue"
                                   :next :land-merge :input land-merge-input}
                                  {:key :abort :label "Abort landing"
                                   :next :land-abort :input land-abort-reason-input}]
                        :attributes
                        {"workflow/instruction"
                         (fn [{:keys [worktree]}]
                           (format-alpha/prose
                            "
                              Read the choice inputs with:

                              ```text
                              strand --workspace \"{workspace}\" workflow choices <run-id>
                              ```

                              Submit approval or abort through `land-signoff`, which
                              retires the completed managed root before choosing its route:

                              ```text
                              strand --workspace \"{workspace}\" land-signoff <run-id> approved --step <signoff-id> --by-identity <actor> --input '<choice-input-json>'
                              ```

                              Before approval, remove owned scratch files and stop owned
                              processes by exact PID or session name. Record retained
                              resources and their owners on the work card. Resources
                              required through merge must be handled by the tracked
                              executable `.millstrand/land-cleanup.sh`. Its failure
                              stops cleanup and card completion.

                              Act on the user's existing authorization to land; no
                              repeat approval is needed. Approval covers the FIFO turn,
                              rebase, repairs, focused review, final validation,
                              automatic merge, and cleanup. Request a user decision
                              when the required repair changes the authorized scope or
                              ownership; abort before merge if that decision changes the
                              plan.
                            " {:workspace (landing-workspace worktree)}))})))

(defn signoff!
  "Retire a ready landing root before its explicit approved/abort route.

  Unknown settlement leaves the same signoff frozen and inspectable; repeat this
  command after resolving custody. Only Workflow owns the retirement evidence."
  [{:keys [run-id step choice input by-identity]}]
  (require-valid! ::non-blank-string by-identity "Signoff requires an actor")
  (require-valid! #{"approved" "abort"} choice "Choose approved or abort")
  (require-valid! (if (= "approved" choice) ::land-merge-input ::land-abort-input)
                  input "Invalid landing choice input")
  (let [rt (current/runtime)]
    ;; The public quiesce API resolves a run's current root. Serialize signoffs
    ;; through validation AND routing so a second caller cannot freeze its successor.
    ;; Runtime state preserves the monitor across module refreshes.
    #_{:clj-kondo/ignore [:locking-suspicious-lock]}
    (locking (:monitor (runtime/spool-state rt ::signoff-lock {:version 1}
                                            (fn [] {:monitor (Object.)})))
      (let [root (workflow/current-root run-id)
            frontier (workflow/ready run-id)]
        (when-not (and (= "land" (attr-get root :workflow/family))
                       (= "ready" (attr-get root :land/stage))
                       (= 1 (count frontier))
                       (= step (:id (first frontier)))
                       (= "signoff" (:checkpoint (first frontier))))
          (fail! "Expected the sole ready landing signoff; no work was retired"
                 {:run-id run-id :step step}))
        (let [freeze (execution/quiesce-run! rt run-id "Explicit landing signoff")
              receipt (execution/retire! rt freeze)]
          (if (= :settled (:status receipt))
            (workflow/choose! run-id choice input
                              {:step step :by-identity by-identity :retirement receipt})
            {:run-id run-id :status "waiting-for-settlement" :retirement receipt}))))))

(millstrand/defop! land-signoff
  "Retire the ready landing root, then approve or abort through its declared route."
  {:arg-spec {:op "land-signoff"
              :hook-class :mutating
              :deadline-class :standard
              :positionals [{:name :run-id :type :string :required? true}
                            {:name :choice :type :string :required? true}]
              :flags {:step {:type :string :required? true
                             :doc "Exact ready signoff checkpoint ID."}
                      :by-identity {:type :string :required? true
                                    :doc "Friendly identity authorizing the route."}
                      :input {:type :string :parse :json :required? true
                              :doc "Choice input from workflow choices, as JSON."}}}
   :returns {:type :map :extra :json}}
  [{:op/keys [args]}]
  (assoc (signoff! (update args :input workflow/json->params))
         :operation "land-signoff"))


(defn abort-misplaced!
  "Abandon a misplaced pre-signoff root whose reviewer has positively failed.

  This recovery-only route never approves a review or merge. Exact reviewer row
  comparison fences a concurrent retry; Workflow owns managed gate retirement."
  [{:keys [run-id root step expected-run by-identity reason]}]
  (require-valid! ::non-blank-string by-identity "Recovery requires an actor")
  (require-valid! ::non-blank-string reason "Recovery requires an authorized reason")
  (let [rt (current/runtime)
        current-root (workflow/current-root run-id)
        {:keys [card branch worktree]} (workflow/json->params
                                       (attr-get current-root :workflow/context))
        actual (.getCanonicalPath (io/file (get-in rt [:metadata :config-dir])))
        frontier (workflow/ready run-id)
        gates (filter #(attr-get % :workflow/gate)
                      (:strands (graph/subgraph rt [(:id current-root)])))
        run (weaver/show rt expected-run)
        servers (graph/incoming-edges rt [step] "serves")]
    (when-not (and (= root (:id current-root))
                   (= "land" (attr-get current-root :workflow/family))
                   (= "ready" (attr-get current-root :land/stage))
                   (every? support/non-blank-string? [card branch worktree])
                   (= actual (.getCanonicalPath (io/file worktree ".millstrand")))
                   (not= actual (landing-workspace worktree))
                   (nil? (weaver/show rt card))
                   (= [step] (mapv :id frontier))
                   (= "agent" (:gate (first frontier)))
                   (= [expected-run] (mapv :from_strand_id servers))
                   (= "true" (attr-get run :harness/run))
                   (= "failed" (attr-get run :harness/status))
                   (= "true" (attr-get run :harness/settled))
                   (every? (fn [gate]
                             (and (contains? #{"code" "shell" "agent"}
                                             (attr-get gate :workflow/gate))
                                  (or (= step (:id gate)) (= "closed" (:state gate)))
                                  (not-any? #(some? (attr-get gate %))
                                            [:shell/running :shell/attempt-id
                                             :shell/custody-handle]))) gates))
      (fail! "Expected exact misplaced pre-signoff Land with a settled failed reviewer; nothing retired"
             {:run-id run-id :root root :step step :expected-run expected-run}))
    (let [freeze (execution/quiesce-run! rt run-id reason)
          receipt (execution/retire! rt freeze)]
      (if (= :settled (:status receipt))
        (assoc (execution/abandon-run!
                rt {:run-id run-id :root-id root :reason reason :by-identity by-identity
                    :retirement receipt :workflow :land-abort
                    ;; The canonical card is deliberately NOT passed to the foreign
                    ;; Weaver. Recovery owns its lane; this root only records abort.
                    :params {:branch branch :reason reason}
                    :domain-patches [{:before run
                                      :update {:attributes {:land/abandoned-with-root root}}}]})
               :status "abort-routed" :retirement receipt)
        {:status "waiting-for-settlement" :retirement receipt}))))

(millstrand/defop! land-abort-misplaced
  "Retire a misplaced Land after settled reviewer failure; never approve or merge."
  {:arg-spec {:op "land-abort-misplaced" :hook-class :mutating :deadline-class :standard
              :positionals [{:name :run-id :type :string :required? true}]
              :flags {:root {:type :string :required? true :doc "Exact pre-signoff Land root."}
                      :step {:type :string :required? true :doc "Exact failed reviewer gate."}
                      :expected-run {:type :string :required? true :doc "Positively settled failed reviewer run."}
                      :by-identity {:type :string :required? true :doc "Authorized recovery actor."}
                      :reason {:type :string :required? true :doc "Recovery authorization and evidence."}}}
   :returns {:type :map :extra :json}}
  [{:op/keys [args]}]
  (assoc (abort-misplaced! args) :operation "land-abort-misplaced"))
