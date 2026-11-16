SHELL := /bin/sh
COMPOSE ?= docker compose

.PHONY: init check build test e2e up down restart ps logs

init:
	@test -f .env || cp .env.example .env
	@mkdir -p data
	@printf '%s\n' 'Fill in the required block of .env, then run: make test && make up'

check:
	@npm run --silent typecheck
	@node scripts/validate-docs.mjs
	@node scripts/check-repository-safety.mjs
	@if [ -f .env ]; then $(COMPOSE) config --quiet; else cp .env.example .env && $(COMPOSE) config --quiet; rc=$$?; rm -f .env; exit $$rc; fi

build:
	@$(COMPOSE) build

test: check
	@npm test --silent

e2e:
	@npm run --silent test:e2e

up:
	@$(COMPOSE) up -d --build

down:
	@$(COMPOSE) down

restart:
	@$(COMPOSE) restart

ps:
	@$(COMPOSE) ps

logs:
	@$(COMPOSE) logs -f --tail=100
