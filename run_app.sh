#!/usr/bin/env bash
# Nokta — Production-Ready Startup & Orchestration Script
# Usage:
#   ./run_app.sh              Start the daemon (default)
#   ./run_app.sh --dev        Start in development mode (with lint + tests)
#   ./run_app.sh --docker     Build and run via Docker Compose
#   ./run_app.sh --test       Run lint + tests only, then exit
#   ./run_app.sh --stop       Stop the running daemon
#   ./run_app.sh --status     Check if daemon is running
#   ./run_app.sh --help       Show this help

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[1;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────
info()  { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
error() { echo -e "${RED}✘${NC} $*"; }
step()  { echo -e "${CYAN}▸${NC} $*"; }
dim()   { echo -e "${DIM}  $*${NC}"; }

# ─── Banner ──────────────────────────────────────────────────────────────────
show_banner() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║         ⚡ Nokta — AI Operating System           ║${NC}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ─── Help ────────────────────────────────────────────────────────────────────
show_help() {
  show_banner
  echo "Usage: ./run_app.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  (none)       Start the Nokta daemon (default)"
  echo "  --dev        Start in dev mode (lint + tests before launch)"
  echo "  --docker     Build and run via Docker Compose"
  echo "  --test       Run lint + tests only, then exit"
  echo "  --stop       Stop the running daemon"
  echo "  --status     Check if daemon is running"
  echo "  --help       Show this help message"
  echo ""
  echo "Environment variables (set in .env or export):"
  echo "  PORT                    Server port (default: 4217)"
  echo "  HOST                    Bind address (default: 127.0.0.1)"
  echo "  NOKTA_JWT_SECRET        JWT secret (required in production)"
  echo "  NOKTA_ENCRYPTION_KEY    Encryption key for API keys"
  echo "  NOKTA_API_KEY           Server-to-server API key"
  echo "  NOKTA_LOG_LEVEL         Log level: debug, info, warn, error"
  echo "  NOKTA_DATA_DIR          Data directory (default: .nokta)"
  echo ""
}

# ─── Load .env ───────────────────────────────────────────────────────────────
load_env() {
  if [ -f ".env" ]; then
    step "Loading .env file..."
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
    info ".env loaded"
  elif [ -f ".env.example" ]; then
    warn "No .env file found. Copy .env.example to .env:"
    dim "  cp .env.example .env"
  fi
}

# ─── Prerequisite Checks ────────────────────────────────────────────────────
check_prereqs() {
  local failed=0

  # Node.js
  if command -v node &>/dev/null; then
    info "Node.js $(node -v)"
  else
    error "Node.js is not installed (v22+ required)"
    exit 1
  fi

  # npm
  if command -v npm &>/dev/null; then
    info "npm v$(npm -v)"
  else
    error "npm is not installed"
    exit 1
  fi

  # Python 3 (optional, for UI/UX Pro Max)
  if command -v python3 &>/dev/null; then
    info "Python 3 $(python3 --version 2>&1 | awk '{print $2}')"
  else
    warn "Python 3 not found — UI/UX Pro Max search will be unavailable"
  fi

  # .env check
  if [ ! -f ".env" ] && [ "${NODE_ENV:-}" = "production" ]; then
    error "Production mode requires .env file with NOKTA_JWT_SECRET"
    exit 1
  fi

  # Production JWT secret check
  if [ "${NODE_ENV:-}" = "production" ] && [ -z "${NOKTA_JWT_SECRET:-}" ]; then
    error "NOKTA_JWT_SECRET must be set in production"
    exit 1
  fi

  return $failed
}

# ─── Install Dependencies ────────────────────────────────────────────────────
install_deps() {
  if [ ! -d "node_modules" ]; then
    step "Installing dependencies..."
    npm install --no-audit --no-fund
    info "Dependencies installed"
  else
    info "Dependencies already installed"
  fi
}

# ─── Set Defaults ────────────────────────────────────────────────────────────
set_defaults() {
  export NOKTA_DATA_DIR="${NOKTA_DATA_DIR:-$PWD/.nokta}"
  export PORT="${PORT:-4217}"
  export HOST="${HOST:-127.0.0.1}"
  export NOKTA_LOG_LEVEL="${NOKTA_LOG_LEVEL:-info}"
  export NODE_ENV="${NODE_ENV:-development}"
}

# ─── Lint + Tests ────────────────────────────────────────────────────────────
run_lint() {
  step "Running linter..."
  if npm run lint 2>&1; then
    info "Lint passed (0 errors)"
  else
    error "Lint failed"
    return 1
  fi
}

run_tests() {
  step "Running test suite..."
  if npm run test:ci 2>&1; then
    info "All tests passed"
  else
    error "Tests failed"
    return 1
  fi
}

run_lint_and_tests() {
  run_lint && run_tests
}

# ─── Stop ────────────────────────────────────────────────────────────────────
stop_daemon() {
  local pid_file=".nokta/daemon.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      step "Stopping daemon (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 2
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      rm -f "$pid_file"
      info "Daemon stopped"
    else
      warn "Daemon PID $pid is not running"
      rm -f "$pid_file"
    fi
  else
    # Try to find by port
    local port="${PORT:-4217}"
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      step "Stopping processes on port $port..."
      echo "$pids" | xargs kill 2>/dev/null || true
      sleep 2
      info "Processes stopped"
    else
      warn "No running daemon found"
    fi
  fi
}

# ─── Status ──────────────────────────────────────────────────────────────────
check_status() {
  local port="${PORT:-4217}"
  local pid_file=".nokta/daemon.pid"

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      info "Daemon running (PID $pid) on http://${HOST:-127.0.0.1}:${port}"

      # Health check
      local health
      health=$(curl -s --max-time 3 "http://127.0.0.1:${port}/health" 2>/dev/null || echo "")
      if [ -n "$health" ]; then
        local version
        version=$(echo "$health" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        info "Health: OK (v${version})"
      else
        warn "Health check failed — daemon may be starting up"
      fi
      return 0
    fi
  fi

  # Check by port
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    info "Daemon found on port $port (PID: $pids)"
    return 0
  fi

  warn "No daemon running"
  return 1
}

# ─── Health Wait ─────────────────────────────────────────────────────────────
wait_for_health() {
  local port="${PORT:-4217}"
  local max_wait=30
  local waited=0

  step "Waiting for daemon to be ready..."
  while [ $waited -lt $max_wait ]; do
    if curl -s --max-time 2 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      local health
      health=$(curl -s --max-time 2 "http://127.0.0.1:${port}/health")
      local version
      version=$(echo "$health" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "?")
      echo ""
      info "Daemon ready! v${version}"
      info "Dashboard:  http://${HOST}:${port}"
      info "API docs:   http://${HOST}:${port}/api/v1/docs"
      info "Health:     http://${HOST}:${port}/health"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
    echo -ne "${DIM}.${NC}"
  done
  echo ""
  warn "Daemon started but health check timed out after ${max_wait}s"
  return 0
}

# ─── Docker Mode ─────────────────────────────────────────────────────────────
run_docker() {
  step "Building and starting via Docker Compose..."
  docker compose up --build -d
  info "Container started. Checking health..."
  sleep 5
  docker compose ps
  echo ""
  info "View logs: docker compose logs -f"
  info "Stop:      docker compose down"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  local mode="${1:-}"

  case "$mode" in
    --help|-h)
      show_help
      exit 0
      ;;
    --stop)
      show_banner
      stop_daemon
      exit 0
      ;;
    --status)
      check_status
      exit $?
      ;;
    --test)
      show_banner
      load_env
      check_prereqs
      install_deps
      set_defaults
      run_lint_and_tests
      exit $?
      ;;
    --docker)
      show_banner
      load_env
      run_docker
      exit 0
      ;;
    --dev)
      show_banner
      load_env
      check_prereqs
      install_deps
      set_defaults
      run_lint_and_tests
      echo ""
      step "Starting daemon in development mode..."
      ;;
    ""|"--start")
      show_banner
      load_env
      check_prereqs
      install_deps
      set_defaults
      step "Starting Nokta daemon..."
      ;;
    *)
      error "Unknown option: $mode"
      show_help
      exit 1
      ;;
  esac

  # Save PID for --stop support
  mkdir -p "$NOKTA_DATA_DIR"

  # Launch daemon (with health wait in background)
  wait_for_health &
  local health_pid=$!

  exec node daemon/index.mjs daemon --port "$PORT"
}

main "$@"
