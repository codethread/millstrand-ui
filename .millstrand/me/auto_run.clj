(ns millstrand-ui.auto-run
  "Activate bounded automatic pickup using this repository's delivery workflows."
  (:require [clojure.java.io :as io]
            [millhouse.auto-run :as auto-run]
            [millhouse.auto-run-reporting :as reporting]
            [millhouse.auto-run-worktree :as auto-run-worktree]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.lifecycle.alpha :as lifecycle]
            [millstrand.api.millstrand.alpha :as millstrand]
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
