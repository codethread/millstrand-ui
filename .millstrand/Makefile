.PHONY: quality lint test

quality: lint test

lint:
	@mkdir -p .clj-kondo
	@classpath="$$(clojure -Srepro -Spath -M:test)"; \
	clj-kondo --repro --lint "$$classpath" --copy-configs --skip-lint
	clj-kondo --repro --lint init.clj me test

test:
	clojure -M:test
