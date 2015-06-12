.PHONY: test
test:
	@./node_modules/.bin/nodeunit tests.js

.PHONY: coverage
coverage:
	@./node_modules/.bin/istanbul cover -x tests.js ./node_modules/.bin/nodeunit -- --reporter minimal tests.js

.PHONY: clean
clean:
	@rm -Rf coverage

.PHONY: lint
lint:
	@./node_modules/.bin/jshint --config jshint.abb.json abb.js
	@./node_modules/.bin/jshint --config jshint.tests.json tests.js

# Old lolex version that does not contain this ridiculous "fix":
# https://github.com/cjohansen/Sinon.JS/issues/593
.PHONY: install
install:
	npm install nodeunit amdefine jshint lolex@1.0.0 istanbul
