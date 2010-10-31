NODE=`which node`
THIS_DIR=$(shell pwd)

default: test

FAIL=echo FAIL
PASS=echo PASS

test:
	@$(NODE) test/run.js

benchmark:
	@$(NODE) test/run.js --prefix=benchmark- --times

.PHONY: test benchmark
