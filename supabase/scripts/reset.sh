#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command supabase
require_local_project

cd "${SUPABASE_DIR}"
supabase db reset --local
printf 'Local Supabase database reset completed.\n'
