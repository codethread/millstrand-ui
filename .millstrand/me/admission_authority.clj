(ns millstrand-ui.admission-authority
  "Canonical-checkout authority for repository-owned admission."
  (:require [clojure.java.io :as io]
            [millhouse.land.support :as land-support]))

(defn inspect
  "Identify whether a runtime belongs to the canonical Git checkout.

  Linked worktrees are identified from Git's absolute common directory, never
  from their branch name. Unsupported workspace layouts fail closed so they
  cannot create or dispatch repository-owned work."
  [runtime]
  (let [config-dir (get-in runtime [:metadata :config-dir])]
    (if-not (string? config-dir)
      {:kind :unsupported
       :reason :missing-config-dir}
      (let [workspace (.getCanonicalPath (io/file config-dir))]
        (if-not (= ".millstrand" (.getName (io/file workspace)))
          {:kind :unsupported
           :reason :workspace-is-not-dot-millstrand
           :workspace workspace}
          (let [checkout (.getCanonicalPath (.getParentFile (io/file workspace)))]
            (try
              (let [canonical-checkout
                    (.getCanonicalPath
                     (io/file (land-support/canonical-worktree checkout)))]
                {:kind (if (= checkout canonical-checkout)
                         :canonical
                         :linked-worktree)
                 :workspace workspace
                 :checkout checkout
                 :canonical-checkout canonical-checkout})
              (catch Exception error
                {:kind :unsupported
                 :reason :git-common-root-unavailable
                 :workspace workspace
                 :checkout checkout
                 :error (ex-message error)}))))))))
