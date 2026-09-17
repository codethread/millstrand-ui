(require '[ct.spools.codethread.bootstrap :as codethread]
         '[millstrand.api.current.alpha :as current]
         '[millstrand.api.runtime.alpha :as runtime])

(def runtime (current/runtime))

(runtime/module! runtime :millstrand/spools-batteries
                 {:ns 'millstrand.spools.batteries
                  :required? true})

(codethread/register! runtime)

(runtime/module! runtime :millhouse/spools-workflow-providers
                 {:ns 'millhouse.spools.workflow.spool
                  :after [:millhouse/spools-workflow]
                  :required? true})

(runtime/module! runtime :millstrand-ui/reviewers
                 {:file "me/reviewers.clj"
                  :after [:codethread/config-reviewers]
                  :required? true})

(codethread/register-executor!
 runtime [:millhouse/spools-workflow-providers
          :millstrand-ui/reviewers])
