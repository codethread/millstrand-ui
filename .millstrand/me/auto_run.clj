(ns millstrand-ui.auto-run
  "Activate bounded automatic pickup using this repository's delivery workflows."
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]
            [millhouse.auto-run :as auto-run]
            [millhouse.auto-run-reporting :as reporting]
            [millhouse.auto-run-worktree :as auto-run-worktree]
            [millhouse.land.card-actions :as card-actions]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.lifecycle.alpha :as lifecycle]
            [millstrand.api.millstrand.alpha :as millstrand]
            [millstrand.api.runtime.alpha :as runtime]
            [millstrand.api.spool.alpha :refer [attr-get fail!]]
            [millstrand.api.weaver.alpha :as weaver]))

(millstrand/use-op! auto-run/auto-run)
(millstrand/use-pattern! reporting/auto-run-needs-decision
                         reporting/auto-run-unknown-failure
                         reporting/auto-run-unblock)
(millstrand/use-hook! reporting/derive-labels)

(def ^:private on-change-policies #{"human-review" "full-land" "stop"})
(def ^:private default-on-change "stop")

(defn- on-change! [card]
  (let [configured (attr-get card :auto-run/on-change)
        on-change (if (nil? configured) default-on-change configured)]
    (when-not (contains? on-change-policies on-change)
      (fail! "Invalid auto-run on-change policy"
             {:card (:id card)
              :value on-change
              :allowed (sort on-change-policies)}))
    on-change))

(millstrand/defhook! protect-inspection-admission!
  "Freeze admitted inspection policy and its clean-completion reservation."
  {:types #{:strand/update-before-commit}}
  [{:keys [strand/before strand/after]}]
  (let [admitted (attr-get before :auto-run/effective-on-change)
        request (attr-get before :auto-inspect/clean-finish-request)
        finishing? (= "true" (attr-get before :auto-inspect/clean-finishing))]
    (when (and (= "auto-inspect" (attr-get before :auto-run/effective-workflow))
               (some? admitted)
               (or (not= admitted (attr-get after :auto-run/effective-on-change))
                   (not= (attr-get before :auto-run/on-change)
                         (attr-get after :auto-run/on-change))))
      (fail! "Auto-run on-change policy changed after admission"
             {:card (:id before)
              :admitted admitted
              :value (attr-get after :auto-run/on-change)}))
    (when (and (not finishing?)
               (= "true" (attr-get after :auto-inspect/clean-finishing))
               (not= "claimed" (attr-get after :kanban/lane)))
      (fail! "Clean inspection completion requires a claimed card"
             {:card (:id before) :lane (attr-get after :kanban/lane)}))
    (when (and (nil? request)
               (some? (attr-get after :auto-inspect/clean-finish-request))
               (or (not= "active" (:state after))
                   (not= "claimed" (attr-get after :kanban/lane))))
      (fail! "Clean inspection finish request requires a claimed card"
             {:card (:id before) :state (:state after)
              :lane (attr-get after :kanban/lane)}))
    (when request
      (when-not (= request (attr-get after :auto-inspect/clean-finish-request))
        (fail! "Clean inspection finish request is immutable"
               {:card (:id before)}))
      (when (and (= "closed" (:state after)) (not finishing?))
        (fail! "Clean inspection finish request forbids closure before cleanup"
               {:card (:id before)}))
      (when (and (not= "closed" (:state after))
                 (not= (attr-get before :kanban/lane)
                       (attr-get after :kanban/lane)))
        (fail! "Clean inspection finish request forbids a lane transition"
               {:card (:id before)
                :before (attr-get before :kanban/lane)
                :after (attr-get after :kanban/lane)})))
    (when finishing?
      (when-not (= "true" (attr-get after :auto-inspect/clean-finishing))
        (fail! "Clean inspection completion reservation cannot be removed"
               {:card (:id before)}))
      (if (= "closed" (:state after))
        (when-not (= "claimed" (attr-get before :kanban/lane))
          (fail! "Clean inspection completion requires a claimed card"
                 {:card (:id before) :lane (attr-get before :kanban/lane)}))
        (when-not (= (attr-get before :kanban/lane)
                     (attr-get after :kanban/lane))
          (fail! "Clean inspection completion forbids a lane transition"
                 {:card (:id before)
                  :before (attr-get before :kanban/lane)
                  :after (attr-get after :kanban/lane)}))))
  nil))

(defn mark-clean-finishing!
  "Reserve a claimed card for completion after separately owned clean cleanup.

  The cleanup owner must first establish worker settlement and cleanup evidence;
  this reservation protects the card lane, not resource custody."
  [{:keys [card]}]
  (weaver/update! (current/runtime) card
                  {:attributes {:auto-inspect/clean-finishing "true"}}))

(defn- receipt-value [receipt key]
  (or (get receipt key) (get receipt (name key))))

(defn- require-clean-step! [rt id checkpoint outcome]
  (let [step (weaver/show rt id)]
    (when-not (and (= "closed" (:state step))
                   (= checkpoint (attr-get step :workflow/checkpoint))
                   (= outcome (attr-get step :workflow/outcome)))
      (fail! "Clean inspection evidence step does not match"
             {:step id :checkpoint checkpoint :outcome outcome}))
    step))

(defn- step-run-id [rt step]
  (let [parents (graph/incoming-edges rt [(:id step)] "parent-of")]
    (when-not (= 1 (count parents))
      (fail! "Workflow evidence step must have one root"
             {:step (:id step) :roots (mapv :from_strand_id parents)}))
    (attr-get (weaver/show rt (:from_strand_id (first parents))) :workflow/run-id)))

(defn- require-successful-worker! [run context]
  (when-not (and (= "true" (attr-get run :harness/run))
                 (= "stopped" (attr-get run :harness/status))
                 (= "completed" (attr-get run :harness/substatus))
                 (= "true" (attr-get run :harness/settled))
                 (zero? (or (attr-get run :harness/exit-code) -1)))
    (fail! "Clean inspection worker is not successfully settled"
           (assoc context :run (:id run))))
  run)

(defn- require-clean-finish-evidence!
  [rt {:keys [card disposition-step retention-step worker-run-id finisher-run-id
              branch worktree expected-head canonical-root handoff-note reconciliation]
       :as request}]
  (let [card-view (weaver/show rt card)
        disposition (require-clean-step! rt disposition-step "disposition" "clean")
        retention (require-clean-step! rt retention-step "retain-worktree" "retained")
        receipt (attr-get retention :workflow/outcome-input)
        note-id (receipt-value receipt :handoff-note)
        note (weaver/show rt note-id)
        worker (weaver/show rt worker-run-id)
        finisher (weaver/show rt finisher-run-id)
        worktree-path (.getCanonicalPath (io/file worktree))
        worktree-runs (filterv
                       (fn [run]
                         (let [cwd (attr-get run :harness/cwd)]
                           (and (not (str/blank? cwd))
                                (= worktree-path
                                   (.getCanonicalPath (io/file cwd))))))
                       (weaver/list rt [:= [:attr "harness/run"] "true"] {}))
        note-ids (set (map :from_strand_id
                           (graph/incoming-edges rt [card] "notes")))]
    (when-not (and (= "true" (attr-get card-view :kanban/card))
                   (or (and (= "active" (:state card-view))
                            (= "claimed" (attr-get card-view :kanban/lane)))
                       (and (= "closed" (:state card-view))
                            (= "done" (attr-get card-view :kanban/outcome))
                            (some? (attr-get card-view
                                             :auto-inspect/clean-finish-request)))))
      (fail! "Clean inspection card must be claimed, or done with a finish receipt"
             {:card card :state (:state card-view)
              :lane (attr-get card-view :kanban/lane)}))
    (when-not (= (step-run-id rt disposition) (step-run-id rt retention))
      (fail! "Clean disposition and retention belong to different workflow runs"
             {:disposition-step disposition-step :retention-step retention-step}))
    (when-not (and (= worker-run-id (receipt-value receipt :worker-run-id))
                   (= canonical-root (receipt-value receipt :canonical-root))
                   (= handoff-note note-id)
                   (contains? note-ids note-id)
                   (not (str/blank? (attr-get note :note/text))))
      (fail! "Retained inspection receipt does not match cleanup request"
             {:card card :retention-step retention-step}))
    (let [resources [[:branch branch] [:worktree worktree]
                     [:worktree-head expected-head]]
          missing (mapv first (remove #(some? (receipt-value receipt (first %)))
                                      resources))]
      (when (and (seq missing) (str/blank? reconciliation))
        (fail! "Legacy retained receipt requires explicit reconciliation evidence"
               {:card card :missing missing}))
      (doseq [[key requested] resources]
        (when-let [retained (receipt-value receipt key)]
          (when-not (= retained requested)
            (fail! "Retained resource identity does not match cleanup request"
                   {:card card :field key :retained retained :requested requested})))))
    (when-not (boolean (re-matches #"(?i)[0-9a-f]{40}" (or expected-head "")))
      (fail! "Clean inspection expected HEAD must be a full Git SHA"
             {:card card :expected-head expected-head}))
    (when (.exists (io/file worktree))
      (let [head (shell/sh "git" "-C" worktree "rev-parse" "HEAD")]
        (when-not (and (zero? (:exit head))
                       (= (str/lower-case expected-head)
                          (str/lower-case (str/trim (:out head)))))
          (fail! "Retained worktree HEAD does not match cleanup request"
                 {:card card :expected-head expected-head
                  :actual (str/trim (:out head)) :error (:err head)}))))
    (require-successful-worker! worker {:role :recorded-worker :card card})
    (when-not (= worktree (attr-get worker :harness/cwd))
      (fail! "Recorded worker cwd does not match retained worktree"
             {:worker worker-run-id :worktree worktree
              :cwd (attr-get worker :harness/cwd)}))
    (doseq [run worktree-runs]
      (require-successful-worker! run {:role :worktree-custodian :card card}))
    (when (= worker-run-id finisher-run-id)
      (fail! "Clean inspection finisher must be independent from the worker"
             {:run worker-run-id}))
    (when-not (and (= "true" (attr-get finisher :harness/run))
                   (= "true" (attr-get finisher :harness/published))
                   (= "committed" (attr-get finisher :harness/publication-outcome))
                   (or (contains? #{"ready" "running"}
                                  (attr-get finisher :harness/status))
                       (and (= "closed" (:state card-view))
                            (= "done" (attr-get card-view :kanban/outcome))
                            (= "stopped" (attr-get finisher :harness/status))
                            (= "completed" (attr-get finisher :harness/substatus))
                            (= "true" (attr-get finisher :harness/settled))
                            (zero? (or (attr-get finisher :harness/exit-code) -1))))
                   (= (.getCanonicalPath (io/file canonical-root))
                      (.getCanonicalPath (io/file (attr-get finisher :harness/cwd)))))
      (fail! "Clean inspection finisher is not an accepted canonical-root run"
             {:run finisher-run-id :canonical-root canonical-root}))
    (when (or (str/blank? branch) (= branch "main"))
      (fail! "Clean inspection branch must be non-main" {:branch branch}))
    (when-not (= (.getCanonicalPath (io/file canonical-root ".millstrand"))
                 (.getCanonicalPath
                  (io/file (get-in rt [:metadata :config-dir]))))
      (fail! "Clean inspection finish must run in the canonical Weaver"
             {:canonical-root canonical-root
              :workspace (get-in rt [:metadata :config-dir])}))
    (assoc request :workflow-run-id (step-run-id rt disposition))))

(defn- cleanup-complete? [canonical-root branch worktree]
  (and (not (.exists (io/file worktree)))
       (not (zero? (:exit (shell/sh "git" "-C" canonical-root "show-ref"
                                    "--verify" "--quiet"
                                    (str "refs/heads/" branch)))))))

(defn- run-cleanup! [canonical-root branch worktree expected-head]
  (let [script (io/file canonical-root ".millstrand" "clean-inspection-cleanup.sh")]
    (when-not (.isFile script)
      (fail! "Clean inspection cleanup script is missing"
             {:script (.getAbsolutePath script)}))
    (let [result (shell/sh "bash" (.getAbsolutePath script)
                           branch worktree canonical-root expected-head
                           :dir canonical-root)]
      (when-not (zero? (:exit result))
        (fail! "Clean inspection cleanup failed"
               {:branch branch :worktree worktree
                :exit (:exit result) :out (:out result) :err (:err result)}))
      result)))

(defn finish-clean-inspection!
  "Verify a retained clean result, remove only its safe settled resources, and finish.

  The immutable request survives a lost response. A retry with the same request
  observes completed cleanup; a different request or any uncertain evidence is
  rejected loudly."
  [request]
  (let [rt (current/runtime)
        lock (:monitor (runtime/spool-state
                        rt ::clean-finish-lock {:version 1}
                        (fn [] {:monitor (Object.)})))]
    (locking lock
      (let [{:keys [card branch worktree canonical-root request-id by-identity]
             :as verified} (require-clean-finish-evidence! rt request)
            request-receipt (select-keys
                             verified
                             [:card :disposition-step :retention-step
                              :worker-run-id :finisher-run-id :branch
                              :worktree :expected-head :canonical-root :handoff-note
                              :reconciliation :request-id :by-identity :workflow-run-id])
            card-view (weaver/show rt card)
            recorded (attr-get card-view :auto-inspect/clean-finish-request)]
        (when (and recorded (not= recorded request-receipt))
          (fail! "Clean inspection finish request conflicts with its durable receipt"
                 {:card card :request-id request-id
                  :recorded recorded :requested request-receipt}))
        (if (= "closed" (:state card-view))
          (do
            (when-not (and (= "true" (attr-get card-view
                                                :auto-inspect/clean-finishing))
                           (cleanup-complete? canonical-root branch worktree))
              (fail! "Closed clean inspection is missing completed cleanup evidence"
                     {:card card :branch branch :worktree worktree}))
            {:outcome :finished
             :card card
             :request-id request-id
             :worker-run-id (:worker-run-id verified)
             :finisher-run-id (:finisher-run-id verified)
             :branch branch
             :worktree worktree})
          (do
            (when-not recorded
              (weaver/update! rt card
                              {:attributes {:auto-inspect/clean-finish-request
                                            request-receipt}}))
            (let [cleanup (if (cleanup-complete? canonical-root branch worktree)
                            {:out "cleanup already complete" :err "" :exit 0}
                            (run-cleanup! canonical-root branch worktree
                                          (:expected-head verified)))]
              (when-not (cleanup-complete? canonical-root branch worktree)
                (fail! "Clean inspection cleanup did not remove the recorded resources"
                       {:card card :branch branch :worktree worktree}))
              (weaver/update! rt card
                              {:attributes
                               {:auto-inspect/cleanup-receipt
                                {:request-id request-id
                                 :worker-run-id (:worker-run-id verified)
                                 :finisher-run-id (:finisher-run-id verified)
                                 :branch branch
                                 :worktree worktree
                                 :completed-at (str (runtime/now rt))
                                 :output (str/trim (:out cleanup))
                                 :by-identity by-identity}}})
              (mark-clean-finishing! {:card card})
              (card-actions/finish-card! {:card card})
              {:outcome :finished
               :card card
               :request-id request-id
               :worker-run-id (:worker-run-id verified)
               :finisher-run-id (:finisher-run-id verified)
               :branch branch
               :worktree worktree})))))))

(millstrand/defop! clean-inspection-finish
  "Safely clean and finish one retained evidence-only clean inspection."
  {:arg-spec
   {:op "clean-inspection-finish"
    :hook-class :mutating
    :deadline-class :standard
    :positionals [{:name :card :type :string :required? true}]
    :flags {:disposition-step {:type :string :required? true}
            :retention-step {:type :string :required? true}
            :worker-run-id {:type :string :required? true}
            :finisher-run-id {:type :string :required? true}
            :branch {:type :string :required? true}
            :worktree {:type :string :required? true}
            :expected-head {:type :string :required? true}
            :canonical-root {:type :string :required? true}
            :handoff-note {:type :string :required? true}
            :reconciliation {:type :string
                             :doc "Required evidence only for a legacy receipt missing resource fields."}
            :request-id {:type :string :required? true}
            :by-identity {:type :string :required? true}}}
   :returns {:type :map :extra :json}}
  [{:op/keys [args]}]
  (assoc (finish-clean-inspection! args)
         :operation "clean-inspection-finish"))

(defn prepare!
  "Snapshot the dispatcher's original admitted inspection policy before preparation."
  [runtime {:keys [card] :as request}]
  ;; `card` is the dispatcher snapshot selected before it writes its preparing
  ;; receipt. Do not re-read it here: a later board edit must be caught when
  ;; start-params compares the live card with this recorded admitted value.
  (when (= "auto-inspect" (attr-get card :auto-run/workflow))
    (weaver/update! runtime (:id card)
                    {:attributes {:auto-run/effective-on-change (on-change! card)}}))
  (auto-run-worktree/prepare! runtime request))

(defn start-params!
  "Project an admitted inspection card's immutable changed-work policy into its workflow."
  [_runtime {:keys [card settings]}]
  (if (= "auto-inspect" (:workflow settings))
    (let [on-change (on-change! card)
          admitted (attr-get card :auto-run/effective-on-change)]
      (when (and admitted (not= admitted on-change))
        (fail! "Auto-run on-change policy changed after admission"
               {:card (:id card) :admitted admitted :value on-change}))
      {:on-change (or admitted on-change)})
    {}))

(defn open!
  "Configure two worker slots, defaulting to a human-reviewed delivery."
  [{:keys [runtime]}]
  (auto-run/configure!
   runtime
   {:repo (.getCanonicalPath (.getParentFile (io/file (get-in runtime [:metadata :config-dir]))))
    :seat "sol"
    :effort "high"
    :workflow "auto-human-review"
    :workflows #{"auto-human-review" "auto-full-land" "auto-inspect"}
    :prepare 'millstrand-ui.auto-run/prepare!
    :start-params 'millstrand-ui.auto-run/start-params!
    :enabled? true
    :max-running 2
    :interval-ms 15000}))

(defn close!
  "Stop new admissions without stopping any accepted worker."
  [{:keys [runtime]}]
  (auto-run/stop! runtime))

(lifecycle/defresource! auto-run-dispatcher
  "Own repository automatic pickup for the module lifetime."
  {:open 'millstrand-ui.auto-run/open!
   :close 'millstrand-ui.auto-run/close!})
