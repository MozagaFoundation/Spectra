#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command deno
cd "${SUPABASE_DIR}"

case "${1:-offline}" in
  offline)
    deno task test
    ;;
  --integration|integration)
    if [[ -z "${SUPABASE_CONTRACT_BASE_URL:-}" ]]; then
      printf 'SUPABASE_CONTRACT_BASE_URL is required for integration tests.\n' >&2
      exit 2
    fi
    deno task test
    deno task test:integration
    ;;
  --all|all)
    deno task test:all
    ;;
  *)
    printf 'Usage: %s [offline|--integration|--all]\n' "$0" >&2
    exit 2
    ;;
esac
