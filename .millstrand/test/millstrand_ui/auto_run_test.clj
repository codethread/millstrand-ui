(ns millstrand-ui.auto-run-test
  "Exercise real workspace activation in disposable Weaver worlds, without paid workers."
  (:require [clojure.data.json :as json]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]
            [clojure.test :refer [deftest is run-tests testing]]
            [millhouse.auto-run :as auto-run]
            [millhouse.auto-run-worktree :as auto-run-worktree]
            [millhouse.cron :as cron]
            [millhouse.kanban :as kanban]
            [millhouse.workflow :as workflow]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.graph.alpha :as graph]
            [millstrand.api.runtime.alpha :as runtime]
            [millstrand.api.runtime.help-transform.alpha :as help-transform]
            [millstrand.api.spool.alpha :refer [attr-get]]
            [millstrand.api.weaver.alpha :as weaver]
            [millstrand.test.alpha :as t])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]
           [java.time Duration Instant]
           [java.time.temporal ChronoUnit]))

(defn- role-step [strands role]
  (first (filter #(= role (attr-get % :auto-run/role)) strands)))

(deftest repository-activation-and-delivery-contracts
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"
                                      "me/hourly_slow_query.clj"]]
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
      (testing "the repository owns its squash landing policy"
        (let [{:keys [prepare-policy merge-tail abort-definition
                      queue-instruction signoff-instruction]}
              (t/repl!
               ctx
               '(with-redefs [millhouse.land.support/canonical-worktree
                             (constantly "/tmp/canonical-checkout")]
                  (let [merge-definition
                        @(requiring-resolve 'millstrand-ui.land/land-merge)
                        land-definition @(requiring-resolve 'millstrand-ui.land/land)
                        merge-steps (into {} (map (juxt :id identity))
                                          (:steps merge-definition))
                        land-steps (into {} (map (juxt :id identity))
                                         (:steps land-definition))
                        prepare-argv
                        ((get-in merge-steps [:prepare-merge :attributes "shell/argv"])
                         {:branch "feature/fixture"})
                        merge-argv
                        ((get-in merge-steps [:merge-pr :attributes "shell/argv"])
                         {:pr-number 42 :subject "Subject" :body "Body"
                          :branch "feature/fixture"})
                        params {:worktree "/tmp/feature-worktree"}]
                    {:prepare-policy (nth prepare-argv (- (count prepare-argv) 2))
                     :merge-tail (subvec merge-argv (- (count merge-argv) 2))
                     :abort-definition
                     (get-in merge-definition [:attributes "land/abort-definition"])
                     :queue-instruction
                     ((get-in merge-steps [:take-turn :attributes "workflow/instruction"])
                      params)
                     :signoff-instruction
                     ((get-in land-steps [:signoff :attributes "workflow/instruction"])
                      params)})))]
          (is (= "rebase" prepare-policy))
          (is (= ["feature/fixture" "squash"] merge-tail))
          (is (= "millstrand-ui.land/land-abort" abort-definition))
          (doseq [instruction [queue-instruction signoff-instruction]]
            (is (str/includes?
                 instruction
                 (str "strand --workspace \""
                      (.getCanonicalPath (io/file "/tmp/canonical-checkout/.millstrand")) "\""))))))
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
                   (count (filter #(= "millhouse.land.card-actions/review-card!"
                                      (attr-get % :code/fn)) strands))))
            (is (contains? gates "shell"))
            (when (= name :auto-human-review)
              (is (contains? gates "code")))
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
                  (is (= [(:id (role-step strands "worker-review"))]
                         (mapv :id (:ready result)))))))
            (if (= name :auto-human-review)
              (testing "human review remains a structured stop boundary"
                (let [checkpoint (first (filter #(= "human" (:checkpoint-kind %)) views))]
                  (is (= ["reviewed"] (:choices checkpoint)))
                  (is (nil? (role-step strands "handoff-worker")))
                  (is (nil? (role-step strands "finisher")))))
              (testing "full landing delegates to separate custody roles"
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
  (let [dir (.toFile (Files/createTempDirectory (.toPath (io/file "/tmp")) "ui-"
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

(defn- temporary-cleanup-fixture! []
  (let [canonical (.toFile (Files/createTempDirectory (.toPath (io/file "/tmp")) "ui-clean-"
                                                       (make-array FileAttribute 0)))
        worktree (io/file canonical "inspection")]
    (git! canonical "git" "init" "--quiet")
    (git! canonical "git" "config" "user.email" "fixture@example.test")
    (git! canonical "git" "config" "user.name" "Fixture")
    (spit (io/file canonical ".gitignore")
          ".env\nnode_modules/\ndist/\ncoverage/\n*.tsbuildinfo\n.DS_Store\n")
    (spit (io/file canonical "evidence.txt") "base\n")
    (git! canonical "git" "add" ".gitignore" "evidence.txt")
    (git! canonical "git" "commit" "--quiet" "-m" "base")
    (git! canonical "git" "branch" "-M" "main")
    (git! canonical "git" "update-ref" "refs/remotes/origin/main" "HEAD")
    (git! canonical "git" "worktree" "add" "--quiet" "-b" "auto/clean" (.getPath worktree))
    {:canonical canonical :worktree worktree}))

(deftest clean-inspection-finish-is-safe-and-replayable
  (let [{:keys [canonical worktree]} (temporary-cleanup-fixture!)
        config (io/file canonical ".millstrand")
        files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                  "me/auto_run_workflows.clj" "me/auto_run.clj"
                                  "me/hourly_slow_query.clj"
                                  "clean-inspection-cleanup.sh"]]
                        [path (slurp path)]))]
    (try
      (t/with-weaver-world
        [ctx {:root (.getPath config)
              :storage :sqlite-memory
              :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
              :init-clj (slurp "init.clj")
              :files files}]
        (let [rt (:runtime ctx)
              canonical-root (.getCanonicalPath canonical)
              worktree-path (.getCanonicalPath worktree)]
          (auto-run/stop! rt)
          (current/with-runtime rt
            (let [card (weaver/add! rt {:title "Clean retained inspection"
                                        :attributes {:kanban/card "true"
                                                     :kanban/type "feature"
                                                     :kanban/lane "claimed"}})
                  worker (weaver/add! rt {:title "Inspection worker"
                                          :attributes {:harness/run "true"
                                                       :harness/status "running"
                                                       :harness/settled "false"
                                                       :harness/cwd worktree-path
                                                       :harness/published "true"
                                                       :harness/publication-outcome "committed"}})
                  finisher (weaver/add! rt {:title "Canonical clean finisher"
                                            :attributes {:harness/run "true"
                                                         :harness/status "running"
                                                         :harness/settled "false"
                                                         :harness/cwd canonical-root
                                                         :harness/published "true"
                                                         :harness/publication-outcome "committed"}})
                  run-id "clean-finish-fixture"]
              (workflow/start! run-id :auto-inspect
                               {:card (:id card) :feature "Clean fixture"
                                :branch "auto/clean" :worktree worktree-path
                                :on-change "stop"})
              (workflow/complete! run-id)
              (let [disposition-step (:id (first (workflow/ready run-id)))]
                (workflow/choose! run-id :clean inspection-summary)
                (let [gate (first (workflow/ready run-id))]
                  (is (zero? (command-exit worktree
                                           (attr-get (weaver/show rt (:id gate))
                                                     :shell/argv))))
                  (workflow/complete! run-id {:executor "fixture-shell"}))
                (let [retention-step (:id (first (workflow/ready run-id)))
                      note (weaver/op! rt 'kanban
                                       ["note" (:id card) "Clean evidence and custody handoff"
                                        "--by-identity" "fixture-worker"])
                      note-id (get-in note [:strand :id])
                      receipt {:worker-run-id (:id worker)
                               :canonical-root canonical-root
                               :resource-inventory "auto/clean and inspection worktree"
                               :handoff-note note-id
                               :branch "auto/clean"
                               :worktree worktree-path
                               :worktree-head (str/trim
                                               (:out (git! worktree "git" "rev-parse" "HEAD")))}
                      request {:card (:id card)
                               :disposition-step disposition-step
                               :retention-step retention-step
                               :worker-run-id (:id worker)
                               :finisher-run-id (:id finisher)
                               :branch "auto/clean"
                               :worktree worktree-path
                               :expected-head (:worktree-head receipt)
                               :canonical-root canonical-root
                               :handoff-note note-id
                               :reconciliation "Legacy handoff note and live Git identity verified."
                               :request-id (str "auto-clean-finish/" (:id card))
                               :by-identity "fixture-finisher"}]
                  (workflow/choose! run-id :retained receipt)
                  ;; Model an already-poured receipt from before resource identity
                  ;; fields became mandatory; the supported op requires an explicit
                  ;; reconciliation statement for this bounded legacy path.
                  (weaver/update! rt retention-step
                                  {:attributes
                                   {:workflow/outcome-input
                                    (assoc (select-keys receipt
                                                        [:worker-run-id :canonical-root
                                                         :resource-inventory :handoff-note])
                                           :branch nil :worktree nil
                                           :worktree-head nil)}})
                  (testing "legacy receipts require explicit reconciliation"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"explicit reconciliation"
                                          ((requiring-resolve
                                            'millstrand-ui.auto-run/finish-clean-inspection!)
                                           (dissoc request :reconciliation)))))
                  (testing "resource identity mismatch refuses cleanup"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"worktree HEAD"
                                          ((requiring-resolve
                                            'millstrand-ui.auto-run/finish-clean-inspection!)
                                           (assoc request :expected-head
                                                  "0000000000000000000000000000000000000000")))))
                  (testing "unsettled worker custody refuses cleanup"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"not successfully settled"
                                          ((requiring-resolve
                                            'millstrand-ui.auto-run/finish-clean-inspection!)
                                           request))))
                  (weaver/update! rt (:id worker)
                                  {:attributes {:harness/status "stopped"
                                                :harness/substatus "completed"
                                                :harness/settled "true"
                                                :harness/exit-code 0}})
                  (.mkdirs (io/file worktree "node_modules" "fixture"))
                  (spit (io/file worktree "node_modules" "fixture" "artifact.js") "ignored")
                  (spit (io/file worktree ".env") "SECRET=unknown")
                  (testing "unknown ignored files fail visibly and freeze the request"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"cleanup failed"
                                          ((requiring-resolve
                                            'millstrand-ui.auto-run/finish-clean-inspection!)
                                           request)))
                    (is (= (:request-id request)
                           (get (attr-get (weaver/show rt (:id card))
                                         :auto-inspect/clean-finish-request)
                                :request-id)))
                    (is (thrown? clojure.lang.ExceptionInfo
                                 (weaver/update! rt (:id card)
                                                 {:attributes
                                                  {:kanban/lane "in_review"}})))
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"conflicts with its durable receipt"
                                          ((requiring-resolve
                                            'millstrand-ui.auto-run/finish-clean-inspection!)
                                           (assoc request :request-id "different-request")))))
                  (io/delete-file (io/file worktree ".env"))
                  (testing "the supported op discards documented artifacts and completes"
                    (let [result (weaver/op!
                                  rt 'clean-inspection-finish
                                  [(:card request)
                                   "--disposition-step" (:disposition-step request)
                                   "--retention-step" (:retention-step request)
                                   "--worker-run-id" (:worker-run-id request)
                                   "--finisher-run-id" (:finisher-run-id request)
                                   "--branch" (:branch request)
                                   "--worktree" (:worktree request)
                                   "--expected-head" (:expected-head request)
                                   "--canonical-root" (:canonical-root request)
                                   "--handoff-note" (:handoff-note request)
                                   "--reconciliation" (:reconciliation request)
                                   "--request-id" (:request-id request)
                                   "--by-identity" (:by-identity request)])]
                      (is (= :finished (:outcome result)))
                      (is (= "clean-inspection-finish" (:operation result))))
                    (is (not (.exists worktree)))
                    (is (not (zero? (:exit (shell/sh "git" "-C" canonical-root
                                                    "show-ref" "--verify" "--quiet"
                                                    "refs/heads/auto/clean")))))
                    (let [finished (weaver/show rt (:id card))]
                      (is (= "closed" (:state finished)))
                      (is (= "done" (attr-get finished :kanban/outcome)))
                      (is (= "true" (attr-get finished :auto-inspect/clean-finishing)))
                      (is (= (:request-id request)
                             (get (attr-get finished :auto-inspect/cleanup-receipt)
                                  :request-id))))
                    (is (= :finished
                           (:outcome
                            ((requiring-resolve
                              'millstrand-ui.auto-run/finish-clean-inspection!)
                             request))))
                    (weaver/update! rt (:id finisher)
                                    {:attributes {:harness/status "stopped"
                                                  :harness/substatus "completed"
                                                  :harness/settled "true"
                                                  :harness/exit-code 0}})
                    (is (= :finished
                           (:outcome
                            ((requiring-resolve
                              'millstrand-ui.auto-run/finish-clean-inspection!)
                             request)))))))))))
      (finally (shell/sh "rm" "-rf" (.getPath canonical))))))

(deftest land-uses-canonical-workspace
  (let [repo (temporary-git-worktree!)
        feature (io/file repo "feature")
        canonical (io/file repo ".millstrand")
        files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                  "me/auto_run_workflows.clj" "me/auto_run.clj"
                                  "me/hourly_slow_query.clj"]]
                        [path (slurp path)]))
        options {:storage :sqlite-memory
                 :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
                 :init-clj (slurp "init.clj") :files files}
        params {:feature "Canonical landing" :branch "feature/landing"
                :worktree (.getCanonicalPath feature)}]
    (try
      (git! repo "git" "worktree" "add" "--quiet" "-b" "feature/landing" (.getPath feature))
      (t/with-weaver-world [ctx (assoc options :root (.getPath canonical))]
        (current/with-runtime (:runtime ctx)
          (let [card (weaver/add! (:runtime ctx)
                                  {:title "Canonical card"
                                   :attributes {:kanban/card "true" :kanban/type "feature"
                                                :kanban/lane "pending"}})
                result (workflow/start! "canonical-land" :land (assoc params :card (:id card)))
                strands (:strands (graph/subgraph (:runtime ctx)
                                                  [(:id (workflow/current-root "canonical-land"))]))
                progress (first (filter #(= "millhouse.land.card-actions/rework-card!"
                                           (attr-get % :code/fn)) strands))]
            (is (= ["Resolve and verify the pull request"] (mapv :title (:ready result))))
            ;; Run the actual card action at the same runtime as Land. Do not
            ;; advance into quality/review or any real external side effects.
            ((requiring-resolve (symbol (attr-get progress :code/fn)))
             (workflow/json->params (attr-get progress :code/params)))
            (is (= "claimed" (attr-get (weaver/show (:runtime ctx) (:id card)) :kanban/lane)))
            (let [definition @(requiring-resolve 'millstrand-ui.land/land)
                  signoff (first (filter #(= :signoff (:id %)) (:steps definition)))
                  instruction ((get-in signoff [:attributes "workflow/instruction"]) params)]
              (is (str/includes? instruction (str "strand --workspace \""
                                                  (.getCanonicalPath canonical) "\"")))))))
      (t/with-weaver-world [ctx (assoc options :root (.getPath (io/file feature ".millstrand")))]
        (current/with-runtime (:runtime ctx)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"canonical workspace"
                               (workflow/start! "wrong-workspace" :land params)))
          (is (empty? (weaver/list (:runtime ctx) [:= [:attr "workflow/run-id"] "wrong-workspace"] {})))))
      (finally (shell/sh "rm" "-rf" (.getPath repo))))))

(deftest auto-inspect-contract-routes-evidence-and-changed-work
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"
                                      "me/hourly_slow_query.clj"]]
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
            (is (thrown? clojure.lang.ExceptionInfo
                         (weaver/update! rt (:id card)
                                         {:attributes
                                          {:auto-inspect/clean-finish-request
                                           {:request-id "too-late"}}})))
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
                                   :handoff-note (get-in note [:strand :id])
                                   :branch "auto/fixture"
                                   :worktree (.getAbsolutePath dir)
                                   :worktree-head (str/trim (:out (git! dir "git" "rev-parse" "HEAD")))}]
                      (doseq [field (keys receipt)]
                        (is (thrown? clojure.lang.ExceptionInfo
                                     (workflow/choose! run-id :retained (dissoc receipt field)))))
                      (let [result (workflow/choose! run-id :retained receipt)]
                        (is (= receipt
                               (attr-get (weaver/show rt (:id retention))
                                         :workflow/outcome-input)))
                        (case outcome
                          :clean
                          (do
                            (is (= ["Freeze the clean finisher request"]
                                   (mapv :title (:ready result))))
                            (let [root (workflow/current-root run-id)
                                  strands (:strands (graph/subgraph rt [(:id root)]))
                                  worker (role-step strands "clean-handoff-worker")
                                  finisher (role-step strands "clean-finisher")
                                  wait-step (role-step strands "clean-finisher-wait")]
                              (is (some? worker))
                              (is (some? finisher))
                              (is (some? wait-step))
                              (is (not= (:id worker) (:id finisher)))
                              (is (= [(:id worker)]
                                     (mapv :to_strand_id
                                           (graph/outgoing-edges rt [(:id finisher)]
                                                                 "depends-on"))))))
                          :needs-review
                          (do
                            (is (= ["Move the finding card into review"]
                                   (mapv :title (:ready result))))
                            (let [awaited (workflow/await! run-id {:timeout-secs 10})
                                  stop-step (first (:ready awaited))]
                              (is (= :step (:reason awaited)))
                              (is (= ["Stop with findings and a recommended next action"]
                                     (mapv :title (:ready awaited))))
                              (is (= "in_review"
                                     (attr-get (weaver/show rt (:id card)) :kanban/lane)))
                              (is (= "closed"
                                     (:state (weaver/show rt (:id (first (:ready result)))))))
                              (is (:done (workflow/complete! run-id {:step (:id stop-step)})))))
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

(deftest land-signoff-retires-before-routing
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"
                                      "me/hourly_slow_query.clj"]]
                            [path (slurp path)]))}]
    ;; The real Code executor supplies settlement. The continuation is deliberately
    ;; inert: this fixture must never run GitHub, queue, or cleanup side effects.
    (t/repl! ctx
             '(do
                (millhouse.workflow/defworkflow! signoff-fixture-next
                  "Inert signoff continuation"
                  {:entrypoints #{:continue}}
                  (millhouse.workflow/workflow
                   "Continued" (millhouse.workflow/step :stop "Stop" :self)))
                true))
    (let [rt (:runtime ctx)]
      (current/with-runtime rt
        (doseq [[choice input] [["approved" {:pr-number 42 :subject "Subject" :body "Body"}]
                               ["abort" {:reason "Not landing"}]]]
          (let [run-id (str "signoff-" choice)
                next-definition 'user/signoff-fixture-next
                definition (workflow/workflow
                            "Signoff fixture"
                            {:attributes {"land/stage" "ready"}}
                            (workflow/step :prepare "Prepare" :self)
                            (workflow/gate :code "Managed no-op" :code
                                           :depends-on [:prepare]
                                           :attributes {"code/fn" "millhouse.land.card-actions/rework-card!"
                                                        "code/params" {}})
                            (workflow/checkpoint :signoff "Sign off" :depends-on [:code]
                                                 :choices [{:key :approved :next next-definition}
                                                           {:key :abort :next next-definition}]))
                _ (workflow/start! run-id definition {} {:family "land"})
                root-id (:id (workflow/current-root run-id))
                invoke (fn [step payload]
                         (weaver/op! rt 'land-signoff
                                     [run-id choice "--step" step "--by-identity" "fixture-reviewer"
                                      "--input" (json/write-str payload)]))]
            (is (thrown? clojure.lang.ExceptionInfo (invoke "not-ready" input)))
            (is (nil? (attr-get (weaver/show rt root-id) :execution/freeze)))
            (workflow/complete! run-id)
            (let [awaited (workflow/await! run-id {:timeout-secs 10})
                  step (:id (first (:ready awaited)))]
              (is (= :checkpoint (:reason awaited)))
              (is (thrown? clojure.lang.ExceptionInfo
                           (workflow/choose! run-id choice input {:step step})))
              (is (thrown? clojure.lang.ExceptionInfo (invoke step {})))
              (is (nil? (attr-get (weaver/show rt root-id) :execution/freeze)))
              (is (= ["Stop"] (mapv :title (:ready (invoke step input)))))
              (is (= choice (attr-get (weaver/show rt step) :workflow/outcome)))
              (is (= "fixture-reviewer" (attr-get (weaver/show rt step) :identity/by-identity)))
              (is (some? (attr-get (weaver/show rt root-id) :execution/retirement)))
              (let [next-root (workflow/current-root run-id)]
                (is (not= root-id (:id next-root)))
                (is (thrown? clojure.lang.ExceptionInfo (invoke step input)))
                (is (= next-root (workflow/current-root run-id)))))))))))

(deftest hourly-inspection-admission
  (t/with-weaver-world
    [ctx {:storage :sqlite-memory
          :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
          :init-clj (slurp "init.clj")
          :files (into {} (for [path ["me/help.clj" "me/reviewers.clj" "me/land.clj"
                                      "me/auto_run_workflows.clj" "me/auto_run.clj"
                                      "me/hourly_slow_query.clj"]]
                            [path (slurp path)]))}]
    (let [rt (:runtime ctx)
          create! (requiring-resolve 'millstrand-ui.hourly-slow-query/create-ticket!)]
      ;; Admission is inspected, never dispatched. The manual clock is before
      ;; activation's scheduled wake, so advancing it cannot run the cron job.
      (auto-run/stop! rt)
      (t/set-clock! rt (t/manual-clock (Instant/parse "2020-01-01T12:34:00Z")))
      (is (= [{:id :hourly-slow-query :interval-ms 3600000 :jitter-ms 0
               :handler 'millstrand-ui.hourly-slow-query/create-ticket!}]
             (cron/jobs rt)))
      (let [result (create! rt)
            card-id (:card result)
            card (weaver/show rt card-id)]
        (is (= :created (:outcome result)))
        (is (= "2020-01-01T12:00:00Z" (:hour result)))
        (is (= "hourly-slow-query" (attr-get card :maintenance/job)))
        (is (auto-run/eligible? rt card))
        (is (= ["sol" "high" "auto-inspect" "full-land"]
               (mapv #(attr-get card %) [:auto-run/seat :auto-run/effort
                                        :auto-run/workflow :auto-run/on-change])))
        (is (= {:on-change "full-land"}
               ((requiring-resolve 'millstrand-ui.auto-run/start-params!)
                rt {:card card :settings {:workflow "auto-inspect"}})))
        (is (nil? (kanban/current-ownership rt card-id)))
        (doseq [attribute [:identity/by-identity :kanban/reporter :auto-run/status
                           :auto-run/request-id :auto-run/run-id :auto-run/workflow-run-id]]
          (is (nil? (attr-get card attribute))))
        (is (= (assoc result :outcome :reused) (create! rt)))
        (testing "every open maintenance state suppresses later hours"
          (doseq [[lane attributes]
                  [["pending" {}]
                   ["claimed" {}]
                   ["in_review" {}]
                   ["claimed" {:kanban.label/agent-blocked "true"}]
                   ["claimed" {:auto-inspect/retained "true"}]]]
            (t/advance! rt (Duration/ofHours 1))
            (weaver/update! rt card-id
                            {:attributes (merge {:kanban/lane lane} attributes)})
            (is (= {:outcome :skipped-open
                    :open-cards [card-id]
                    :hour (str (.truncatedTo ^Instant (runtime/now rt)
                                             ChronoUnit/HOURS))}
                   (create! rt)))))
        (testing "closing the prior job admits exactly one later-hour receipt"
          (let [closed (weaver/update! rt card-id
                                       {:state "closed"
                                        :attributes {:kanban/lane nil
                                                     :kanban/outcome "done"
                                                     :kanban.label/auto-run nil}})
                add! weaver/add!]
            (with-redefs [weaver/add! (fn [runtime request & [options]]
                                       (add! runtime request options)
                                       (throw (ex-info "Lost response" {})))]
              (is (thrown-with-msg? Exception #"Lost response" (create! rt))))
            (let [later (create! rt)]
              (is (= :reused (:outcome later)))
              (is (not= card-id (:card later)))
              (is (= 2 (count (weaver/list rt [:= [:attr "kanban/card"] "true"] {}))))
              (testing "same-hour closed and edited receipts never rearm"
                (let [later-card (weaver/show rt (:card later))
                      edited (weaver/update! rt (:id later-card)
                                             {:state "closed"
                                              :attributes {:kanban/lane nil
                                                           :kanban/outcome "done"
                                                           :auto-run/status "error"}})
                      other-open (weaver/add! rt {:title "Backfilled open hourly job"
                                                  :attributes {:maintenance/job
                                                               "hourly-slow-query"}})]
                  (is (= later (create! rt)))
                  (is (= edited (weaver/show rt (:id later-card))))
                  (is (= "active" (:state (weaver/show rt (:id other-open)))))))
              (is (= "closed" (:state closed))))))))))

(defn -main
  "Run disposable workspace tests without touching the repository's live Weaver."
  [& _]
  (let [{:keys [fail error]} (run-tests 'millstrand-ui.auto-run-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ fail error)) 0 1))))
