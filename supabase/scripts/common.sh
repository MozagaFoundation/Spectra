#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 127
  fi
}

require_local_project() {
  if [[ ! -f "${SUPABASE_DIR}/config.toml" ]]; then
    printf 'Missing %s/config.toml; initialize local Supabase configuration first.\n' "${SUPABASE_DIR}" >&2
    exit 2
  fi
}
