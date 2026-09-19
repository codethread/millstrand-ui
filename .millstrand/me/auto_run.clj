(ns millstrand-ui.auto-run
  "Activate bounded automatic pickup using this repository's delivery workflows."
  (:require [clojure.java.io :as io]
            [ct.spools.codethread.auto-run :as auto-run]
            [ct.spools.codethread.auto-run-worktree :as auto-run-worktree]
            [millstrand.api.lifecycle.alpha :as lifecycle]
            [millstrand.api.millstrand.alpha :as millstrand]
            [millstrand.api.spool.alpha :refer [attr-get fail!]]
            [millstrand.api.weaver.alpha :as weaver]))

(millstrand/use-op! auto-run/auto-run)

(def ^:private on-change-policies #{"human-review" "full-land" "stop"})
(def ^:private default-on-change "stop")

(defn- on-change! [card]
  (let [on-change (or (attr-get card :auto-run/on-change) default-on-change)]
    (when-not (contains? on-change-policies on-change)
      (fail! "Invalid auto-run on-change policy"
             {:card (:id card)
              :value on-change
              :allowed (sort on-change-policies)}))
    on-change))

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
      {:on-change on-change})
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
