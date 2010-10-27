NODE=`which node`
THIS_DIR=$(shell pwd)

default: test

FAIL=echo FAIL
PASS=echo PASS

test:
	@$(NODE) test/run.js test

benchmark:
	@$(NODE) test/run.js test --prefix=benchmark- --times

.PHONY: test benchmark
