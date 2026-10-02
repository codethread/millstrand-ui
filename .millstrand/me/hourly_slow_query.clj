(ns millstrand-ui.hourly-slow-query
  "Hourly inspection cards; Auto-run owns worker admission and delivery."
  (:require [millhouse.cron :as cron]
            [millstrand.api.runtime.alpha :as runtime]
            [millstrand.api.weaver.alpha :as weaver])
  (:import [java.time Instant]
           [java.time.temporal ChronoUnit]))

(def ^:private body
  "Inspect the current Millstrand UI performance log (~/.local/state/millstrand-ui/perf.log, its rotations, or the running server's MILLSTRAND_UI_PERF_LOG override) and relevant Weaver logs discovered via `mill weaver list`. Address at most one genuine SLOW query that still needs attention. Record the log paths/time range, sample, workspace/op/route, cause, and before/after verification evidence. Check previous hourly maintenance findings and active work before selecting the query; do not duplicate an existing fix or interfere with another worker.

Prefer loading less data in the UI, then a behaviour-preserving downstream op refactor, then a bounded direct SQL read under the repository's read contracts. Preserve spool domain semantics and keep all mutations through Strand. Do not turn this inspection into a general performance rewrite.

Read docs/auto-run.md and drive the exact dispatcher-supplied auto-inspect run. Record its structured summary and select the evidence-supported disposition. No actionable SLOW query is a clean inspection, not a reason to manufacture a change or PR; record what was inspected. Missing or unreadable required logs are a blocker, not a clean result. Evidence-only outcomes retain the worktree and leave card completion to the separately assigned cleanup owner.

A bounded fix follows the admitted on-change=full-land policy: use the workflow's quality, verification, review and canonical-root finisher handoff, not a new delivery run or self-cleanup. Necessary Weaver restarts are authorised via the supported mill lifecycle commands, including dependency-basis changes; record any restart and its verification.")

(def ^:private job "hourly-slow-query")

(defn create-ticket!
  "Publish one complete admission only when no prior job card remains open.

  A persisted hourly source wins before open-card admission checks, including
  after closure or a lost response. Repeated delivery never edits, rearms or
  claims an existing card. The runtime lock serializes both reads with creation;
  card policy, job identity and source receipt commit together."
  [rt]
  (let [lock (runtime/spool-state rt ::admission-lock (fn [] (Object.)))]
    (locking lock
      (let [hour (str (.truncatedTo ^Instant (runtime/now rt) ChronoUnit/HOURS))
            source (str "cron/hourly-slow-query/" hour)
            existing (first (weaver/list rt [:= [:attr "kanban/source"] source] {}))]
        (if existing
          {:outcome :reused
           :card (:id existing)
           :hour hour}
          (let [open-cards (weaver/list
                            rt
                            [:and [:= :state "active"]
                             [:= [:attr "maintenance/job"] job]]
                            {})]
            (if (seq open-cards)
              {:outcome :skipped-open
               :open-cards (mapv :id open-cards)
               :hour hour}
              (let [card
                    (weaver/add!
                     rt {:title (str "Hourly maintenance: address 1 SLOW query (" hour ")")
                         ;; Publish complete policy atomically so dispatch cannot
                         ;; observe a partially configured maintenance card.
                         ;; A scheduled job has no actor to attribute.
                         :attributes {:body body
                                      :kanban/card "true"
                                      :kanban/type "feature"
                                      :kanban/priority "p3"
                                      :kanban/lane "pending"
                                      :kanban/source source
                                      :maintenance/job job
                                      :kanban.label/auto-run "true"
                                      :auto-run/seat "sol"
                                      :auto-run/effort "high"
                                      :auto-run/workflow "auto-inspect"
                                      :auto-run/on-change "full-land"}})]
                {:outcome :created
                 :card (:id card)
                 :hour hour}))))))))

(cron/defjob! hourly-slow-query
  "Offer one Sol/high SLOW-query inspection to Auto-run every hour."
  {:interval-ms 3600000
   :jitter-ms 0
   :handler 'millstrand-ui.hourly-slow-query/create-ticket!})
