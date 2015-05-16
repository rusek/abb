test:
	@./node_modules/.bin/nodeunit tests.js

lint:
	@./node_modules/.bin/jshint abb.js

install:
	npm install nodeunit amdefine jshint
