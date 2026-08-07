.PHONY: setup format lint test build up down smoke failure-demo clean

setup:
	npm ci

format:
	npm run format

lint:
	npm run format:check
	npm run lint
	npm run typecheck

test:
	npm run test:coverage

build:
	npm run build
	docker build -t zero-trust-api-gateway:local .

up:
	docker compose up --build -d

down:
	docker compose down --remove-orphans

smoke:
	node scripts/smoke.mjs

failure-demo:
	node scripts/failure-demo.mjs

clean:
	docker compose down --volumes --remove-orphans
	rm -rf coverage dist node_modules

