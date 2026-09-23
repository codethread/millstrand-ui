(ns millstrand-ui.auto-run-test
  "Exercise real workspace activation in disposable, unlabelled Weaver worlds."
  (:require [clojure.data.json :as json]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]
            [clojure.test :refer [deftest is run-tests testing]]
            [millhouse.spools.auto-run :as auto-run]
            [millhouse.spools.auto-run-worktree :as auto-run-worktree]
            [millhouse.spools.workflow :as workflow]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.runtime.help-transform.alpha :as help-transform]
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
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"]]
                            [path (slurp path)]))}]
    (let [rt (:runtime ctx)
          status (auto-run/status rt)]
      (is (= 'millstrand.spools.batteries
             (:owner (help-transform/default-help-transform rt))))
      (is (= {:enabled true
              :max-running 2
              :workflow "auto-human-review"
              :workflows ["auto-full-land" "auto-human-review" "auto-inspect"]
              :start-params "millstrand-ui.auto-run/start-params!"}
             (select-keys (assoc (:config status) :enabled (:enabled status))
                          [:enabled :max-running :workflow :workflows :start-params])))
      (is (empty? (:dispatched (auto-run/scan! rt))))
      (let [card (weaver/add! rt {:title "Blocked work"})
            evidence (weaver/add! rt {:title "Decision evidence"})]
        (weaver/op! rt 'weave
                    ["--pattern" "auto-run-needs-decision" "--input"
                     (json/write-str {:strand (:id card) :evidence (:id evidence)})])
        (let [reported (weaver/show rt (:id card))]
          (is (= (:id evidence) (attr-get reported :auto-run/agent-evidence)))
          (is (= "true" (attr-get reported :kanban.label/agent-blocked)))
          (is (= "true" (attr-get reported :kanban.label/needs-decision)))))
      (current/with-runtime rt
        (doseq [name [:auto-human-review :auto-full-land]]
          (let [run-id (str "test-" (clojure.core/name name))
                result (workflow/start! run-id name
                                        {:card "fixture-card" :feature "Disposable feature"
                                         :branch "auto/fixture-card" :worktree (:config-dir ctx)})
                root (workflow/current-root run-id)
                strands (:strands (graph/subgraph rt [(:id root)]))
                views (map workflow/step-view strands)
                ci-step (first (filter #(= "Wait for the PR checks" (:title %)) strands))
                verify-step (first (filter #(= "Verify the passing PR and review package" (:title %)) strands))
                ci-argv (attr-get ci-step :shell/argv)
                gates (set (keep #(attr-get % :workflow/gate) strands))]
            (is (= 1 (count (:ready result))))
            (is (= ["sh" ".millstrand/land-quality.sh"]
                   (attr-get (first (filter #(= "Pass repository quality checks" (:title %))
                                            strands)) :shell/argv)))
            (is (= (if (= name :auto-human-review) 1 0)
                   (count (filter #(= "millhouse.spools.land.card-actions/review-card!"
                                      (attr-get % :code/fn)) strands))))
            (is (contains? gates "shell"))
            (is (= (= name :auto-human-review) (contains? gates "code")))
            (is (not (contains? gates "agent")))
            (testing "PR checks require registered CI before the stricter review-package verifier"
              (is (= ["pr-checks" "required" "auto/fixture-card" "120" "5"]
                     (subvec ci-argv (- (count ci-argv) 5))))
              (is (= ["node" "--experimental-transform-types"
                      "scripts/auto-run-review.ts" "auto/fixture-card"]
                     (attr-get verify-step :shell/argv)))
              (is (= [(:id ci-step)]
                     (mapv :to_strand_id
                           (graph/outgoing-edges rt [(:id verify-step)] "depends-on")))))
            (testing "the verified handoff exposes only its actual next owner"
              ;; Isolate routing from external CI: these receipts stand for the
              ;; shell executor, not evidence that a real PR passed its checks.
              (workflow/complete! run-id)
              (workflow/complete! run-id {:executor "fixture-quality"})
              (workflow/complete! run-id)
              (workflow/complete! run-id {:executor "fixture-ci"})
              (let [result (workflow/complete! run-id {:executor "fixture-pr-verifier"})]
                (is (= 1 (count (:ready result))))
                (if (= name :auto-human-review)
                  (is (= ["Move the verified feature into review"]
                         (mapv :title (:ready result))))
                  (is (= [(:id (role-step strands "handoff-worker"))]
                         (mapv :id (:ready result)))))))
            (if (= name :auto-human-review)
              (testing "human review remains a structured stop boundary"
                (let [checkpoint (first (filter #(= "human" (:checkpoint-kind %)) views))]
                  (is (= ["reviewed"] (:choices checkpoint)))
                  (is (nil? (role-step strands "handoff-worker")))
                  (is (nil? (role-step strands "finisher")))))
              (testing "full landing delegates to separate shared roles"
                (let [worker-step (role-step strands "handoff-worker")
                      finisher-step (role-step strands "finisher")]
                  (is (some? worker-step))
                  (is (some? finisher-step))
                  (is (= "fixture-card" (attr-get worker-step :auto-run/card)))
                  (is (= "fixture-card" (attr-get finisher-step :auto-run/card)))
                  (is (not= (:id worker-step) (:id finisher-step))))))))))))

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
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"]]
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
              ((requiring-resolve 'millstrand-ui.auto-run/mark-clean-finishing!)
               {:card (:id clean-card)})
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
                                                           :kanban/outcome "done"}})))))))
        (testing "review wins the race against a late clean reservation"
          (let [card (weaver/add! rt {:title "Review before clean reservation"
                                      :attributes {:kanban/card "true"
                                                   :kanban/type "feature"
                                                   :kanban/lane "in_review"}})]
            (is (thrown? clojure.lang.ExceptionInfo
                         ((requiring-resolve 'millstrand-ui.auto-run/mark-clean-finishing!)
                          {:card (:id card)})))
            (is (= "active" (:state (weaver/show rt (:id card)))))))
        (testing "evidence-only routes retain custody and require durable handoff input"
          (doseq [outcome [:clean :needs-review :blocked]]
            (let [run-id (str "retain-" (name outcome))
                  card (weaver/add! rt {:title "Inspection custody"
                                        :attributes {:kanban/card "true"
                                                     :kanban/type "feature"
                                                     :kanban/lane "claimed"}})
                  dir (temporary-git-worktree!)]
              (try
                (workflow/start! run-id :auto-inspect
                                 (assoc (inspect-params ctx "stop")
                                        :card (:id card) :branch "auto/fixture"
                                        :worktree (.getAbsolutePath dir)))
                (workflow/complete! run-id)
                (doseq [field (keys inspection-summary)]
                  (is (thrown? clojure.lang.ExceptionInfo
                               (workflow/choose! run-id outcome
                                                 (dissoc inspection-summary field)))))
                (is (= ["Record evidence and choose the inspection disposition"]
                       (mapv :title (workflow/ready run-id))))
                (let [result (workflow/choose! run-id outcome inspection-summary)
                      gate (first (:ready result))
                      argv (attr-get (weaver/show rt (:id gate)) :shell/argv)]
                  (is (= 1 (count (:ready result))))
                  (is (zero? (command-exit dir argv)))
                  (is (pos? (command-exit dir (assoc argv 4 "wrong-branch"))))
                  (git! dir "git" "checkout" "--quiet" "main")
                  (is (pos? (command-exit dir (assoc argv 4 "main"))))
                  (git! dir "git" "checkout" "--quiet" "auto/fixture")
                  (spit (io/file dir "untracked.txt") "local evidence")
                  (is (pos? (command-exit dir argv)))
                  (io/delete-file (io/file dir "untracked.txt"))
                  (spit (io/file dir "evidence.txt") "modified")
                  (is (pos? (command-exit dir argv)))
                  (git! dir "git" "checkout" "--" "evidence.txt")
                  (spit (io/file dir ".gitignore") ".env\n")
                  (git! dir "git" "add" ".gitignore")
                  (git! dir "git" "commit" "--quiet" "-m" "ahead")
                  (is (pos? (command-exit dir argv)))
                  (git! dir "git" "update-ref" "refs/remotes/origin/main" "HEAD")
                  (spit (io/file dir ".env") "SECRET=retained")
                  (is (zero? (command-exit dir argv)))
                  ;; Execute the real rendered shell contract above, then record
                  ;; its executor receipt without starting a background provider.
                  (let [result (workflow/complete! run-id {:executor "fixture-shell"})
                        retention (first (:ready result))]
                    (is (= ["retained"] (:choices retention)))
                    (is (str/includes? (:instruction retention) (:evidence inspection-summary)))
                    (is (thrown? clojure.lang.ExceptionInfo
                                 (workflow/choose! run-id :retained {})))
                    (is (= [(:id retention)] (mapv :id (workflow/ready run-id))))
                    (let [note (weaver/op! rt 'kanban
                                           ["note" (:id card) (pr-str inspection-summary)
                                            "--by-identity" "fixture-worker"])
                          receipt {:worker-run-id "fixture-worker"
                                   :canonical-root (.getAbsolutePath dir)
                                   :resource-inventory "Branch and worktree retained"
                                   :handoff-note (get-in note [:strand :id])}]
                      (doseq [field (keys receipt)]
                        (is (thrown? clojure.lang.ExceptionInfo
                                     (workflow/choose! run-id :retained (dissoc receipt field)))))
                      (let [result (workflow/choose! run-id :retained receipt)]
                        (is (= receipt
                               (attr-get (weaver/show rt (:id retention))
                                         :workflow/outcome-input)))
                        (case outcome
                          :clean (is (:done result))
                          :needs-review
                          (do
                            (is (= ["Move the finding card into review"]
                                   (mapv :title (:ready result))))
                            ((requiring-resolve 'millhouse.spools.land.card-actions/review-card!)
                             {:card (:id card)})
                            (workflow/complete! run-id {:executor "fixture-code"})
                            (is (:done (workflow/complete! run-id))))
                          :blocked (is (:done (workflow/complete! run-id))))))))
                (is (.exists dir) "workflow completion retains the worker cwd")
                (is (= "SECRET=retained" (slurp (io/file dir ".env"))))
                (is (= "auto/fixture" (str/trim (:out (git! dir "git" "branch" "--show-current")))))
                (is (= "active" (:state (weaver/show rt (:id card)))))
                (is (= (if (= :needs-review outcome) "in_review" "claimed")
                       (attr-get (weaver/show rt (:id card)) :kanban/lane)))
                (is (nil? (attr-get (weaver/show rt (:id card))
                                    :auto-inspect/clean-finishing)))
                (finally (shell/sh "rm" "-rf" (.getAbsolutePath dir)))))))
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
                (let [result (workflow/choose! run-id :continue)
                      gate (first (:ready result))]
                  (is (= ["Pass repository quality checks"] (mapv :title (:ready result))))
                  (is (= ["sh" ".millstrand/land-quality.sh"]
                         (attr-get (weaver/show rt (:id gate)) :shell/argv))))
                (let [views (run-views rt run-id)]
                  (is (some #(= "Pass repository quality checks" (:title %)) views))
                  (is (some #(= expected (:title %)) views))
                  (is (not-any? #(= forbidden (:title %)) views)))))))))))

(defn -main
  "Run disposable workspace tests without touching the repository's live Weaver."
  [& _]
  (let [{:keys [fail error]} (run-tests 'millstrand-ui.auto-run-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ fail error)) 0 1))))
