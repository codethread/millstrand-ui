(ns millstrand-ui.land-recovery-test
  "Exercise explicit misplaced-root abandonment without launching reviewers."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.test :refer [deftest is]]
            [millhouse.workflow :as workflow]
            [millhouse.workflow.execution :as execution]
            [millstrand.api.current.alpha :as current]
            [millstrand.api.spool.alpha :refer [attr-get]]
            [millstrand.api.weaver.alpha :as weaver]
            [millstrand.test.alpha :as t])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]))

(defn- git! [dir & args]
  (let [result (apply shell/sh "git" "-C" (.getPath dir) args)]
    (when-not (zero? (:exit result))
      (throw (ex-info "Git fixture failed" result)))
    result))

(def ^:private init
  "(require '[millstrand.api.current.alpha :as current]
            '[millstrand.api.runtime.alpha :as runtime])
   (runtime/module! (current/runtime) :workflow {:ns 'millhouse.workflow})
   (runtime/module! (current/runtime) :providers
                    {:ns 'millhouse.workflow.spool :after [:workflow]})
   (runtime/module! (current/runtime) :identity {:ns 'millhouse.identity})
   (runtime/module! (current/runtime) :kanban {:ns 'millhouse.kanban :after [:identity]})
   (runtime/module! (current/runtime) :land
                    {:file \"me/land.clj\" :after [:providers :kanban]})")

(deftest misplaced-land-abort-preserves-failure-and-retires-managed-work
  (let [repo (.toFile (Files/createTempDirectory (.toPath (io/file "/tmp")) "lr-"
                                                (make-array FileAttribute 0)))
        feature (io/file repo "feature")]
    (try
      (git! repo "init" "--quiet")
      (git! repo "config" "user.email" "fixture@example.test")
      (git! repo "config" "user.name" "Fixture")
      (git! repo "commit" "--quiet" "--allow-empty" "-m" "base")
      (git! repo "branch" "-M" "main")
      (git! repo "worktree" "add" "--quiet" "-b" "feature/recovery" (.getPath feature))
      (t/with-weaver-world
        [ctx {:root (.getPath (io/file feature ".millstrand"))
              :storage :sqlite-memory
              :deps-edn (pr-str (select-keys (edn/read-string (slurp "deps.edn")) [:deps]))
              :init-clj init :files {"me/land.clj" (slurp "me/land.clj")}}]
        (let [rt (:runtime ctx)]
          (current/with-runtime rt
            (let [definition
                  (workflow/workflow
                   "Misplaced Land fixture" {:attributes {"land/stage" "ready"}}
                   (workflow/gate :progress "Optional card" :code
                                  :attributes {"code/fn" "millhouse.land.card-actions/rework-card!"
                                               "code/params" {}})
                   ;; No Agent executor is activated in this world. The fixture
                   ;; represents a positively settled provider failure, not success.
                   (workflow/gate :review "Failed reviewer" :agent :depends-on [:progress]))
                  result (workflow/start! "misplaced" definition
                                          {:card "canonical-card" :branch "feature/recovery"
                                           :worktree (.getCanonicalPath feature)}
                                          {:family "land"})
                  old-root (:id (workflow/current-root "misplaced"))
                  progress (:id (first (:ready result)))
                  awaited (workflow/await! "misplaced" {:timeout-secs 10})
                  step (:id (first (:ready awaited)))
                  reviewer (weaver/add! rt {:title "Settled failed reviewer" :state "closed"
                                            :attributes {:harness/run "true" :harness/status "failed"
                                                         :harness/settled "true"
                                                         :harness/error "Native startup missing"}
                                            :edges [{:type "serves" :to step}]})
                  request {:run-id "misplaced" :root old-root :step step
                           :expected-run (:id reviewer) :by-identity "fixture-recovery"
                           :reason "Explicit user-authorized wrong-workspace recovery"}
                  abort! (requiring-resolve 'millstrand-ui.land/abort-misplaced!)]
              (is (= "closed" (:state (weaver/show rt progress))))
              (is (= "agent" (:gate (first (workflow/ready "misplaced")))))
              (is (thrown? clojure.lang.ExceptionInfo (abort! (assoc request :root "wrong"))))
              (weaver/update! rt (:id reviewer) {:attributes {:harness/settled "false"}})
              (is (thrown? clojure.lang.ExceptionInfo (abort! request)))
              (is (nil? (attr-get (weaver/show rt old-root) :execution/freeze)))
              (weaver/update! rt (:id reviewer) {:attributes {:harness/settled "true"}})
              (with-redefs [execution/retire! (fn [_ _] {:status :unknown})]
                (is (= "waiting-for-settlement" (:status (abort! request)))))
              (is (= "active" (:state (weaver/show rt old-root))))
              (let [abandon! execution/abandon-run!]
                (with-redefs [execution/abandon-run!
                              (fn [runtime recovery]
                                (weaver/update! runtime (:id reviewer)
                                                {:attributes {:harness/settled "false"}})
                                (abandon! runtime recovery))]
                  (is (thrown? clojure.lang.ExceptionInfo (abort! request)))))
              (is (= "active" (:state (weaver/show rt old-root))))
              (weaver/update! rt (:id reviewer) {:attributes {:harness/settled "true"}})
              (let [aborted (abort! request)
                    final (workflow/await! "misplaced" {:timeout-secs 10})]
                (is (= "abort-routed" (:status aborted)))
                (is (= "closed" (:state (weaver/show rt old-root))))
                (is (some? (attr-get (weaver/show rt old-root) :execution/retirement)))
                (is (= "Native startup missing"
                       (attr-get (weaver/show rt (:id reviewer)) :harness/error)))
                (is (= old-root (attr-get (weaver/show rt (:id reviewer)) :land/abandoned-with-root)))
                (is (= "failed" (attr-get (weaver/show rt (:id reviewer)) :harness/status)))
                (is (= "abort" (attr-get (workflow/current-root "misplaced") :land/stage)))
                (is (= ["Record the abort and hand over the work"] (mapv :title (:ready final))))
                (is (:done (workflow/complete! "misplaced")))
                (is (thrown? clojure.lang.ExceptionInfo (abort! request))))))))
      (finally (shell/sh "rm" "-rf" (.getPath repo))))))
