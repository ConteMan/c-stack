PYTHON ?= python3

.PHONY: validate test
validate:
	$(PYTHON) scripts/validate.py

test:
	$(PYTHON) -m unittest discover -s tests -v
	node --test tests/*.test.mjs
