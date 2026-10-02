(require '[millhouse.config.bootstrap :as codethread]
         '[millstrand.api.current.alpha :as current]
         '[millstrand.api.runtime.alpha :as runtime])

(def runtime (current/runtime))

(runtime/module! runtime :millstrand/spools-batteries
                 {:ns 'millstrand.spools.batteries
                  :required? true})

(runtime/module! runtime :millstrand-ui/help
                 {:file "me/help.clj"
                  :after [:millstrand/spools-batteries]
                  :required? true})

(codethread/register! runtime)

(runtime/module! runtime :millhouse/workflow-providers
                 {:ns 'millhouse.workflow.spool
                  :after [:millhouse/workflow]
                  :required? true})

(runtime/module! runtime :millstrand-ui/land
                 {:file "me/land.clj"
                  :after [:millhouse/land
                          :millhouse/workflow-providers]
                  :required? true})

(runtime/module! runtime :millstrand-ui/reviewers
                 {:file "me/reviewers.clj"
                  :after [:millhouse/config-reviewers]
                  :required? true})

(runtime/module! runtime :millstrand-ui/auto-run-workflows
                 {:file "me/auto_run_workflows.clj"
                  :after [:millhouse/workflow-providers
                          :millstrand-ui/land]
                  :required? true})

(runtime/module! runtime :millstrand-ui/admission-authority
                 {:file "me/admission_authority.clj"
                  :after [:millhouse/land]
                  :required? true})

(runtime/module! runtime :millstrand-ui/auto-run
                 {:file "me/auto_run.clj"
                  :after [:millstrand-ui/auto-run-workflows
                          :millstrand-ui/admission-authority
                          :millhouse/harnesses]
                  :required? true})

(runtime/module! runtime :millhouse/cron
                 {:ns 'millhouse.cron
                  :required? true})

(runtime/module! runtime :millstrand-ui/hourly-slow-query
                 {:file "me/hourly_slow_query.clj"
                  :after [:millhouse/cron :millstrand-ui/auto-run]
                  :required? true})

(codethread/register-executor!
 runtime [:millstrand-ui/help
          :millhouse/workflow-providers
          :millstrand-ui/land
          :millstrand-ui/reviewers
          :millstrand-ui/auto-run])
