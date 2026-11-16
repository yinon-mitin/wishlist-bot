SHELL := /bin/sh
COMPOSE ?= docker compose

.PHONY: init check build test up down restart ps logs

init:
	@test -f .env || cp .env.example .env
	@mkdir -p data
	@printf '%s\n' 'Fill in the required block of .env, then run: make test && make up'

check:
	@npm run --silent typecheck
	@$(COMPOSE) config --quiet

build:
	@$(COMPOSE) build

test: check
	@npm test --silent

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
