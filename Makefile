NODE=`which node`
THIS_DIR=$(shell pwd)

default: test

FAIL=echo FAIL
PASS=echo PASS

test:
	node test/run.js

benchmark:
	@for i in test/benchmark-*.js; do \
		$(NODE) $$i; \
	done

.PHONY: test benchmark
