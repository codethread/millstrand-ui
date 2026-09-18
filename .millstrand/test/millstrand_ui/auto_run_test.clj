(ns millstrand-ui.auto-run-test
  "Exercise real workspace activation in disposable, unlabelled Weaver worlds."
  (:require [clojure.edn :as edn]
            [clojure.string :as str]
            [clojure.test :refer [deftest is run-tests testing]]
            [ct.spools.codethread.auto-run :as auto-run]
            [ct.spools.harnesses :as harnesses]
            [ct.spools.harnesses.assignment :as assignment]
            [millhouse.spools.land.autonomous :as autonomous]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.spool.alpha :refer [attr-get]]
            [millstrand.api.weaver.alpha :as weaver]
            [millstrand.test.alpha :as t]))

(defn- role-step [strands role]
  (first (filter #(= role (attr-get % :auto-run/role)) strands)))

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
            (is (not (contains? gates "agent")) "The finisher is an explicit handoff, not an eager agent gate")
            (if (= name :auto-human-review)
              (testing "Human review still stops without any landing delegation"
                (let [checkpoint (first (filter #(= "human" (:checkpoint-kind %)) views))]
                  (is (= ["reviewed"] (:choices checkpoint)))
                  (is (str/includes? (:instruction checkpoint) "Do not choose this checkpoint"))
                  (is (not-any? #(str/includes? (or (:instruction %) "") "auto-land-finisher/") views))
                  (is (every? #(str/includes? (:instruction %) "clear gate/error to retry")
                              (filter #(= "shell" (:gate %)) views)))))
              (testing "Worker and finisher have distinct instructions and targets"
                (let [worker-step (role-step strands "handoff-worker")
                      finisher-step (role-step strands "finisher")
                      handoff (workflow/step-view worker-step)
                      finisher (workflow/step-view finisher-step)
                      instruction (:instruction handoff)]
                  (is (= "fixture-card" (attr-get worker-step :auto-run/card)))
                  (is (= "fixture-card" (attr-get finisher-step :auto-run/card)))
                  (is (= "step" (:role handoff) (:role finisher)))
                  (is (not= (:id handoff) (:id finisher)))
                  (is (not (:done result)))
                  (doseq [required ["land-auto-fixture-card"
                                    "STOP at land's signoff checkpoint BEFORE choosing approved"
                                    "FINISHER STEP ID (never this worker step)"
                                    "auto-land-finisher/FINISHER_STEP_ID"
                                    "auto-run/worker-run-id"
                                    "auto-run/finisher-run-id"
                                    "complete THIS"
                                    "Return immediately without waiting"
                                    "An accepted but blocked"
                                    "stop for explicit recovery"
                                    "stop BEFORE accepting"
                                    "before this handoff proceeds"
                                    "When a finisher WAS accepted, do not launch another worker"]]
                    (is (str/includes? instruction required) required))
                  (doseq [required ["This step is finisher-only"
                                    "Do not claim card fixture-card, implement new scope or launch another finisher"
                                    "--query agent-run-settled"
                                    "--param run-id=ORIGINAL_WORKER_RUN_ID --min-count 1"
                                    "require settled=true, completed"
                                    "Do not finish the card early"
                                    "Verify land is done and the card is closed with outcome done"]]
                    (is (str/includes? (:instruction finisher) required) required))
                  (is (not (str/includes? (:instruction finisher) "agent run grunt")))
                  (testing "Failed autonomous gates preserve work for manual intervention"
                    (doseq [view (concat [handoff finisher] (filter :gate views))]
                      (is (str/includes? (:instruction view) "`auto-run-failure` to card fixture-card"))
                      (is (str/includes? (:instruction view) "Stop and leave the card open"))
                      (is (str/includes? (:instruction view) "withdraw the merge turn")))))))))))))


(deftest autonomous-finisher-target-remains-blocked-until-worker-settles
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/reviewers.clj" "me/auto_run_workflows.clj" "me/auto_run.clj"]]
                            [path (slurp path)]))}]
    (let [rt (:runtime ctx)
          request {:harness :handoff-fixture :mode :interactive
                   :cwd (:config-dir ctx) :prompt "Disposable handoff run"}]
      (harnesses/register-harness! rt :handoff-fixture
                                   {:modes #{:interactive}
                                    :prepare 'ct.spools.harnesses/create!
                                    :finish 'ct.spools.harnesses/finish!})
      (current/with-runtime rt
        (let [card (weaver/add! rt {:title "Recovery card"})
              result (workflow/start! "separate-target-handoff"
                                      (workflow/workflow
                                       "Delivery handoff"
                                       (workflow/call :land #'autonomous/autonomous-land {}))
                                      {:card (:id card) :feature "Recovery fixture"
                                       :branch "auto/recovery-card" :worktree (:config-dir ctx)})
              root (workflow/current-root "separate-target-handoff")
              strands (:strands (graph/subgraph rt [(:id root)]))
              worker-step (role-step strands "handoff-worker")
              finisher-step (role-step strands "finisher")
              worker (harnesses/create! rt (assoc request :target (:id worker-step)))
              finisher-request (assoc request :target (:id finisher-step)
                                      :request-id (str "auto-land-finisher/" (:id finisher-step)))
              finisher (harnesses/create! rt finisher-request)]
          (is (= [(:id worker-step)] (mapv :id (:ready result))))
          (is (not= (:id worker-step) (:id finisher-step)))
          (is (not= (:id worker) (:id finisher)))
          (is (false? (boolean (assignment/launch-ready? rt finisher))))
          (weaver/update! rt (:id finisher-step)
                          {:attributes {:auto-run/worker-run-id (:id worker)
                                        :auto-run/finisher-run-id (:id finisher)}})
          (is (= [(:id finisher-step)]
                 (mapv :id (:ready (workflow/complete! "separate-target-handoff"
                                                       {:by "fixture-worker"})))))
          (is (assignment/launch-ready? rt finisher))
          (is (= (:id worker)
                 (attr-get (weaver/show rt (:id finisher-step)) :auto-run/worker-run-id)))
          (is (= (:id finisher)
                 (attr-get (weaver/show rt (:id finisher-step)) :auto-run/finisher-run-id))))))))

(defn -main
  "Run disposable workspace tests without touching the repository's live Weaver."
  [& _]
  (let [{:keys [fail error]} (run-tests 'millstrand-ui.auto-run-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ fail error)) 0 1))))
