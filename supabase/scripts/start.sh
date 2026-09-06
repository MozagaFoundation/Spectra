#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command supabase
require_local_project

cd "${SUPABASE_DIR}"
# Supabase prints local credentials on stdout; suppress them.
if ! supabase start >/dev/null; then
  printf 'Local Supabase failed to start.\n' >&2
  exit 1
fi
printf 'Local Supabase started at http://127.0.0.1:54321\n'
