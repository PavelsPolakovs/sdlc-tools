.PHONY: build format lint typecheck inspect

build:
	cd packages/sdlc-ship-changes && npm run build

format:
	npm run format

lint:
	npm run lint

typecheck:
	npm run typecheck

inspect:
	cd packages/sdlc-ship-changes && npm run inspect
