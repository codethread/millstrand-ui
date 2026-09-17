(ns millstrand-ui.auto-run-test
  "Exercise real workspace activation in disposable, unlabelled Weaver worlds."
  (:require [clojure.edn :as edn]
            [clojure.test :refer [deftest is run-tests]]
            [ct.spools.codethread.auto-run :as auto-run]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.spool.alpha :refer [attr-get]]
            [millstrand.test.alpha :as t]))

(deftest repository-activation-and-delivery-contracts
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/reviewers.clj" "me/auto_run_workflows.clj" "me/auto_run.clj"]]
                            [path (slurp path)]))}]
    (let [rt (:runtime ctx)
          status (auto-run/status rt)]
      (is (:enabled status))
      (is (= 2 (get-in status [:config :max-running])))
      (is (= "auto-human-review" (get-in status [:config :workflow])))
      (is (empty? (:cards status)))
      (is (empty? (:dispatched (auto-run/scan! rt))))
      (current/with-runtime rt
        (doseq [name [:auto-human-review :auto-full-land]]
          (let [run-id (str "test-" (clojure.core/name name))
                result (workflow/start! run-id name
                                        {:card "fixture-card" :feature "Disposable feature"
                                         :branch "auto/fixture-card" :worktree (:config-dir ctx)})
                root (workflow/current-root run-id)
                strands (:strands (graph/subgraph rt [(:id root)]))
                views (map workflow/step-view strands)
                gates (set (keep #(attr-get % :workflow/gate) strands))]
            (is (= ["Implement and verify the assigned feature"] (mapv :title (:ready result))))
            (is (contains? gates "shell"))
            (is (contains? gates "code"))
            (is (not (contains? gates "agent")) "One assigned worker, not a second agent coordinator")
            (if (= name :auto-human-review)
              (is (some #(= "human" (:checkpoint-kind %)) views))
              (is (some #(= "Drive shared land through completion" (:title %)) views)))))))))

(defn -main
  "Run disposable workspace tests without touching the repository's live Weaver."
  [& _]
  (let [{:keys [fail error]} (run-tests 'millstrand-ui.auto-run-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ fail error)) 0 1))))
