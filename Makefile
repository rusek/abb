test:
	@./node_modules/.bin/nodeunit tests.js

lint:
	@./node_modules/.bin/jshint abb.js

# Old lolex version that does not contain this ridiculous "fix":
# https://github.com/cjohansen/Sinon.JS/issues/593
install:
	npm install nodeunit amdefine jshint lolex@1.0.0
