(ns millstrand-ui.auto-run-test
  "Exercise real workspace activation in disposable, unlabelled Weaver worlds."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]
            [clojure.test :refer [deftest is run-tests testing]]
            [ct.spools.codethread.auto-run :as auto-run]
            [ct.spools.codethread.auto-run-worktree :as auto-run-worktree]
            [ct.spools.harnesses :as harnesses]
            [ct.spools.harnesses.assignment :as assignment]
            [millhouse.spools.land.autonomous :as autonomous]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.spool.alpha :refer [attr-get]]
            [millstrand.api.weaver.alpha :as weaver]
            [millstrand.test.alpha :as t])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]))

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
      (is (= ["auto-full-land" "auto-human-review" "auto-inspect"]
             (get-in status [:config :workflows])))
      (is (= "millstrand-ui.auto-run/start-params!"
             (get-in status [:config :start-params])))
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

(defn- inspect-params [ctx on-change]
  {:card "fixture-card" :feature "Disposable feature"
   :branch "auto/fixture-card" :worktree (:config-dir ctx)
   :on-change on-change})

(def ^:private inspection-summary
  {:summary "Completed the requested bounded inspection."
   :evidence "Recorded command output and inspected the requested scope."
   :findings "The selected disposition captures the observed result."
   :next-action "Follow the selected disposition."})

(defn- run-views [rt run-id]
  (let [root (workflow/current-root run-id)]
    (map workflow/step-view (:strands (graph/subgraph rt [(:id root)])))))

(defn- prepare-inspection! [ctx run-id on-change]
  (workflow/start! run-id :auto-inspect (inspect-params ctx on-change))
  (workflow/complete! run-id))

(defn- command-exit [dir argv]
  (:exit (apply shell/sh (concat argv [:dir (.getAbsolutePath dir)]))))

(defn- git! [dir & argv]
  (let [result (apply shell/sh (concat argv [:dir (.getAbsolutePath dir)]))]
    (when-not (zero? (:exit result))
      (throw (ex-info "Git fixture setup failed" (assoc result :argv argv))))
    result))

(defn- temporary-git-worktree! []
  (let [dir (.toFile (Files/createTempDirectory "auto-inspect-"
                                                (make-array FileAttribute 0)))]
    (git! dir "git" "init" "--quiet")
    (git! dir "git" "config" "user.email" "fixture@example.test")
    (git! dir "git" "config" "user.name" "Fixture")
    (spit (io/file dir "evidence.txt") "base\n")
    (git! dir "git" "add" "evidence.txt")
    (git! dir "git" "commit" "--quiet" "-m" "base")
    (git! dir "git" "branch" "-M" "main")
    (git! dir "git" "update-ref" "refs/remotes/origin/main" "HEAD")
    (git! dir "git" "checkout" "--quiet" "-b" "auto/fixture")
    dir))

(deftest auto-inspect-contract-routes-evidence-and-changed-work
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/reviewers.clj" "me/auto_run_workflows.clj" "me/auto_run.clj"]]
                            [path (slurp path)]))}]
    (let [rt (:runtime ctx)]
      (current/with-runtime rt
        (testing "the dispatcher admits only declared on-change policies"
          (let [callback (requiring-resolve 'millstrand-ui.auto-run/start-params!)]
            (doseq [on-change ["human-review" "full-land" "stop"]]
              (let [card (weaver/add! rt {:title on-change
                                           :attributes {:auto-run/on-change on-change}})]
                (is (= {:on-change on-change}
                       (callback rt {:card card :settings {:workflow "auto-inspect"}})))))
            (is (= {:on-change "stop"}
                   (callback rt {:card (weaver/add! rt {:title "default policy"})
                                 :settings {:workflow "auto-inspect"}})))
            (doseq [value ["merge-now" false]]
              (is (= :invalid-policy
                     (try
                       (callback rt {:card (weaver/add! rt {:title "invalid policy"
                                                             :attributes {:auto-run/on-change value}})
                                     :settings {:workflow "auto-inspect"}})
                       :accepted
                       (catch clojure.lang.ExceptionInfo _ :invalid-policy)))))
            (is (= :changed-after-admission
                   (try
                     (callback rt {:card (weaver/add! rt {:title "changed after admission"
                                                           :attributes {:auto-run/on-change "full-land"
                                                                        :auto-run/effective-on-change "stop"}})
                                   :settings {:workflow "auto-inspect"}})
                     :accepted
                     (catch clojure.lang.ExceptionInfo _ :changed-after-admission))))
            (let [prepare (requiring-resolve 'millstrand-ui.auto-run/prepare!)
                  admitted (weaver/add! rt {:title "admitted inspection"
                                             :attributes {:auto-run/workflow "auto-inspect"
                                                          :auto-run/effective-workflow "auto-inspect"
                                                          :auto-run/on-change "stop"}})]
              (weaver/update! rt (:id admitted)
                              {:attributes {:auto-run/on-change "full-land"}})
              (with-redefs [auto-run-worktree/prepare! (fn [_ _] {:cwd "fixture" :branch "auto/fixture"})]
                (prepare rt {:card admitted}))
              (is (= "stop"
                     (attr-get (weaver/show rt (:id admitted)) :auto-run/effective-on-change)))
              (doseq [attributes [{:auto-run/on-change "human-review"}
                                  {:auto-run/effective-on-change nil}]]
                (is (= :frozen-after-admission
                       (try
                         (weaver/update! rt (:id admitted) {:attributes attributes})
                         :updated
                         (catch clojure.lang.ExceptionInfo _ :frozen-after-admission)))))
              (is (= :changed-after-admission
                     (try
                       (callback rt {:card (weaver/show rt (:id admitted))
                                     :settings {:workflow "auto-inspect"}})
                       :accepted
                       (catch clojure.lang.ExceptionInfo _ :changed-after-admission)))))
            (is (= {}
                   (callback rt {:card (weaver/add! rt {:title "unrelated policy"
                                                         :attributes {:auto-run/on-change "merge-now"}})
                                 :settings {:workflow "auto-human-review"}})))
            (let [clean-card (weaver/add! rt {:title "reserved clean inspection"
                                               :attributes {:kanban/card "true"
                                                            :kanban/type "feature"
                                                            :kanban/lane "claimed"}})]
              (weaver/update! rt (:id clean-card)
                              {:attributes {:auto-inspect/clean-finishing "true"}})
              (is (= :lane-change-rejected
                     (try
                       (weaver/update! rt (:id clean-card)
                                       {:attributes {:kanban/lane "in_review"}})
                       :updated
                       (catch clojure.lang.ExceptionInfo _ :lane-change-rejected))))
              (is (= "closed"
                     (:state (weaver/update! rt (:id clean-card)
                                             {:state "closed"
                                              :attributes {:kanban/lane nil
                                                           :kanban/outcome "done"}})))))
        (testing "clean evidence-only work is mechanically gated and finished without a PR"
          (prepare-inspection! ctx "inspect-clean" "stop")
          (let [result (workflow/choose! "inspect-clean" :clean inspection-summary)
                gate (first (:ready result))
                argv (attr-get (weaver/show rt (:id gate)) :shell/argv)
                views (run-views rt "inspect-clean")]
            (is (= "Verify no dirty files or commits ahead" (:title gate)))
            (is (= "shell" (:gate gate)))
            (is (str/includes? (nth argv 2) "git status --porcelain"))
            (is (not (str/includes? (nth argv 2) "--ignored")))
            (is (str/includes? (nth argv 2) "origin/main..HEAD"))
            (is (some #(= "Finish the clean evidence-only card" (:title %)) views))
            (let [root (workflow/current-root "inspect-clean")
                  strands (:strands (graph/subgraph rt [(:id root)]))
                  finish-step (first (filter #(= "Finish the clean evidence-only card" (:title %))
                                             strands))
                  cleanup-step (first (filter #(= "Remove the clean inspection worktree and branch" (:title %))
                                               strands))
                  cleanup-argv (attr-get cleanup-step :shell/argv)]
              (is (some #(= "Reserve the claimed card for clean completion" (:title %)) strands))
              (is (some #(= "Remove the clean inspection worktree and branch" (:title %)) strands))
              (is (str/includes? (nth cleanup-argv 2) "rm -rf \"$worktree/node_modules\""))
              (is (str/includes? (nth cleanup-argv 2) "git -C \"$worktree\" status --porcelain --ignored --untracked-files=all"))
              (is (= "millhouse.spools.land.card-actions/finish-card!"
                     (attr-get finish-step :code/fn))))
            (is (not-any? #(= "Publish the exact change with its review package" (:title %)) views))))
        (testing "fixed work follows each admitted delivery policy"
          (doseq [[on-change expected forbidden]
                  [["human-review" "Human review: return the passing PR and stop"
                    "Review and hand off autonomous landing"]
                   ["full-land" "Review and hand off autonomous landing"
                    "Human review: return the passing PR and stop"]
                   ["stop" "Leave the fixed card open for a human delivery decision"
                    "Publish the exact change with its review package"]]]
            (let [run-id (str "inspect-fixed-" on-change)]
              (prepare-inspection! ctx run-id on-change)
              (let [fixed-result (workflow/choose! run-id :fixed inspection-summary)
                    selector (first (filter :choices (:ready fixed-result)))]
                (is (= ["continue"] (:choices selector)))
                (workflow/choose! run-id :continue)
                (let [views (run-views rt run-id)]
                  (is (some #(= "Pass repository quality checks" (:title %)) views))
                  (is (some #(= expected (:title %)) views))
                  (is (not-any? #(= forbidden (:title %)) views)))))))
        (testing "needs-review and blocked preserve product findings without delivery failure"
          (prepare-inspection! ctx "inspect-review" "stop")
          (workflow/choose! "inspect-review" :needs-review inspection-summary)
          (let [views (run-views rt "inspect-review")]
            (is (some #(and (= "Verify findings left no dirty files or commits ahead" (:title %))
                            (= "shell" (:gate %))) views))
            (is (some #(= "Remove the clean inspection worktree and branch" (:title %)) views))
            (is (some #(and (= "Move the finding card into review" (:title %))
                            (= "code" (:gate %))) views))
            (is (some #(= "Stop with findings and a recommended next action" (:title %)) views))
            (is (not-any? #(str/includes? (or (:instruction %) "") "`auto-run-failure` to card") views)))
          (prepare-inspection! ctx "inspect-blocked" "stop")
          (workflow/choose! "inspect-blocked" :blocked inspection-summary)
          (let [views (run-views rt "inspect-blocked")]
            (is (some #(and (= "Verify blocker evidence left no dirty files or commits ahead" (:title %))
                            (= "shell" (:gate %))) views))
            (is (some #(= "Remove the clean inspection worktree and branch" (:title %)) views))
            (is (some #(= "Leave the blocked card open with trustworthy evidence" (:title %)) views))))))))))

(deftest clean-inspection-gate-accepts-ignored-artifacts-and-rejects-dirty-or-ahead-worktrees
  (let [dir (temporary-git-worktree!)
        argv ["sh" "-ceu"
              "test -z \"$(git status --porcelain)\"\ntest \"$(git rev-list --count origin/main..HEAD)\" -eq 0"]]
    (try
      (is (zero? (command-exit dir argv)) "clean evidence-only work passes")
      (spit (io/file dir ".gitignore") "ignored.txt\n")
      (git! dir "git" "add" ".gitignore")
      (git! dir "git" "commit" "--quiet" "-m" "ignore")
      (git! dir "git" "update-ref" "refs/remotes/origin/main" "HEAD")
      (spit (io/file dir "ignored.txt") "ignored\n")
      (is (zero? (command-exit dir argv)) "ignored artifacts allow a clean disposition")
      (spit (io/file dir "untracked.txt") "untracked\n")
      (is (pos? (command-exit dir argv)) "ordinary untracked files reject a clean disposition")
      (io/delete-file (io/file dir "untracked.txt"))
      (spit (io/file dir "evidence.txt") "modified\n")
      (is (pos? (command-exit dir argv)) "tracked changes reject a clean disposition")
      (git! dir "git" "checkout" "--" "evidence.txt")
      (spit (io/file dir "ahead.txt") "ahead\n")
      (git! dir "git" "add" "ahead.txt")
      (git! dir "git" "commit" "--quiet" "-m" "ahead")
      (is (pos? (command-exit dir argv)) "commits ahead reject a clean disposition")
      (finally
        (shell/sh "rm" "-rf" (.getAbsolutePath dir))))))

(deftest clean-inspection-cleanup-removes-disposable-artifacts-and-refuses-local-files
  (let [dir (temporary-git-worktree!)
        argv ["sh" "-ceu"
              "rm -rf node_modules dist coverage\nfind . -type f \\( -name '*.tsbuildinfo' -o -name '.DS_Store' \\) -delete\ntest -z \"$(git status --porcelain --ignored --untracked-files=all)\""]]
    (try
      (spit (io/file dir ".gitignore") "dist/\n.env\n")
      (git! dir "git" "add" ".gitignore")
      (git! dir "git" "commit" "--quiet" "-m" "ignore cleanup inputs")
      (git! dir "git" "update-ref" "refs/remotes/origin/main" "HEAD")
      (.mkdirs (io/file dir "dist"))
      (spit (io/file dir "dist" "bundle.js") "generated\n")
      (is (zero? (command-exit dir argv)) "disposable build artifacts are removed before cleanup")
      (spit (io/file dir ".env") "SECRET=fixture\n")
      (is (pos? (command-exit dir argv)) "local ignored configuration prevents destructive cleanup")
      (finally
        (shell/sh "rm" "-rf" (.getAbsolutePath dir))))))

(defn -main
  "Run disposable workspace tests without touching the repository's live Weaver."
  [& _]
  (let [{:keys [fail error]} (run-tests 'millstrand-ui.auto-run-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ fail error)) 0 1))))
