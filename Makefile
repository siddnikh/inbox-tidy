.PHONY: install infra-up infra-down infra-reset dev test test-integration lint format typecheck check build install-app qa

install:
	bun install

infra-up:
	docker compose up -d
	bun scripts/wait-for-port.ts 127.0.0.1 3025 3143

infra-down:
	docker compose down

infra-reset:
	docker compose down
	$(MAKE) infra-up

dev:
	bun run dev

test:
	bun run test

test-integration: infra-up
	bun run test:integration

lint:
	bun run lint

format:
	bun run format

typecheck:
	bun run typecheck

check: lint typecheck test

build:
	bun run build

install-app: build
	bun run install-app

qa: check test-integration build
