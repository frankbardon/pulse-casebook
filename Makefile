# Pulse Casebook tasks. Run `make help` for the list.

# Pulse is built from a local checkout (committed PULSE_REF only; the working tree
# is left alone) while v1 is in flux. Once releases settle, use `make pulse-release`,
# which installs the pinned PULSE_VERSION from GitHub instead.
PULSE_SRC     ?= $(abspath ../pulse)
PULSE_REF     ?= main
PULSE_VERSION ?= v1.0.0-alpha.9

BIN     := bin
PULSE   := $(abspath $(BIN)/pulse)
OS      := $(shell uname -s | tr '[:upper:]' '[:lower:]')
ARCH    := $(shell uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')
ARCHIVE := pulse_$(PULSE_VERSION)_$(OS)_$(ARCH).tar.gz
RELEASE := https://github.com/frankbardon/pulse/releases/download/$(PULSE_VERSION)
SHA256  := $(shell command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo shasum -a 256)

.PHONY: help pulse pulse-release retail-bench data site site-dev

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

pulse: ## Build Pulse from PULSE_REF (main) of the local checkout into bin/
	@set -e; ver=$$(git -C "$(PULSE_SRC)" describe --tags --always $(PULSE_REF)); \
	if [ -x $(PULSE) ] && [ "$$(cat $(BIN)/.pulse-version 2>/dev/null)" = "$$ver" ]; then \
	  echo "pulse $$ver already in $(BIN)/"; exit 0; fi; \
	tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
	echo "· building $$ver from $(PULSE_SRC) ($(PULSE_REF))"; \
	git -C "$(PULSE_SRC)" archive $(PULSE_REF) | tar -x -C "$$tmp"; \
	mkdir -p $(BIN); (cd "$$tmp" && CGO_ENABLED=0 go build -trimpath \
	  -ldflags "-s -w -X github.com/frankbardon/pulse/internal/buildinfo.version=$$ver" -o $(PULSE) ./cmd/pulse); \
	echo "$$ver" > $(BIN)/.pulse-version; echo "· installed $(BIN)/pulse $$ver"

pulse-release: ## Install the pinned Pulse release (PULSE_VERSION) into bin/
	@if [ -x $(PULSE) ] && [ "$$(cat $(BIN)/.pulse-version 2>/dev/null)" = "$(PULSE_VERSION)" ]; then \
	  echo "pulse $(PULSE_VERSION) already in $(BIN)/"; exit 0; fi; \
	set -e; tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
	echo "· downloading $(ARCHIVE)"; \
	curl -fsSL -o "$$tmp/$(ARCHIVE)" "$(RELEASE)/$(ARCHIVE)"; \
	curl -fsSL -o "$$tmp/checksums.txt" "$(RELEASE)/checksums.txt"; \
	(cd "$$tmp" && grep "  $(ARCHIVE)$$" checksums.txt | $(SHA256) -c - >/dev/null) || { echo "checksum mismatch for $(ARCHIVE)" >&2; exit 1; }; \
	tar -xzf "$$tmp/$(ARCHIVE)" -C "$$tmp" pulse; \
	mkdir -p $(BIN); mv "$$tmp/pulse" $(PULSE); echo "$(PULSE_VERSION)" > $(BIN)/.pulse-version; \
	echo "· installed $(BIN)/pulse $(PULSE_VERSION)"

retail-bench: ## Build the retail-at-scale bench helper against PULSE_REF into bin/
	@set -e; ver=$$(git -C "$(PULSE_SRC)" describe --tags --always $(PULSE_REF)); \
	tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
	echo "· building retail-bench against pulse $$ver"; \
	git -C "$(PULSE_SRC)" archive $(PULSE_REF) | tar -x -C "$$tmp"; \
	mkdir -p "$$tmp/casebook-bench" $(BIN); cp showcase/retail-at-scale/bench/main.go "$$tmp/casebook-bench/"; \
	(cd "$$tmp" && CGO_ENABLED=0 go build -trimpath -o $(abspath $(BIN))/retail-bench ./casebook-bench/main.go); \
	echo "· installed $(BIN)/retail-bench"

data: pulse ## Rebuild film data with bin/pulse (FILM=overlays for one film)
	PULSE=$(PULSE) films/build/data.sh $(FILM)

site: ## Build the learning site into site/dist
	cd site && npm ci && npm run build

site-dev: ## Serve the learning site locally with live reload
	cd site && npm run dev
