#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
evidence_path="${1:-}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

if [ ! -x "$root_dir/node_modules/.bin/expo" ]; then
  echo "Expo is not installed; run the lockfile-enforced npm ci first." >&2
  exit 1
fi

export CI=1
export EXPO_NO_DOTENV=1
export NODE_ENV=production
export TZ=UTC

build_export() {
  output_dir="$1"
  (
    cd "$root_dir"
    npm exec --offline -- expo export \
      --platform android \
      --no-bytecode \
      --output-dir "$output_dir"
  )
}

build_export "$work_dir/first"
build_export "$work_dir/second"

compare_args=("$work_dir/first" "$work_dir/second")
if [ -n "$evidence_path" ]; then
  compare_args+=(--evidence "$root_dir/$evidence_path")
fi
python3 "$root_dir/scripts/compare-build-trees.py" "${compare_args[@]}"
