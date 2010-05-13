NODE=`which node`
THIS_DIR=$(shell pwd)

default: test

FAIL=echo FAIL
PASS=echo PASS

test:
	@for i in test/test-*.js; do \
	  echo -n "$$i: "; \
	  $(NODE) $$i > /dev/null && $(PASS) || $(FAIL); \
	done

.PHONY: test
