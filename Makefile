.PHONY: build format lint typecheck

build:
	cd packages/sdlc-ship-changes && npm run build

format:
	npm run format

lint:
	npm run lint

typecheck:
	npm run typecheck
