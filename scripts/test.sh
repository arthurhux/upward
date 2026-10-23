#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
cd "$project_dir"
# Keep test bundles outside Documents, where Finder metadata can prevent signing.
test_build_dir="$(mktemp -d "${TMPDIR:-/tmp}/upward-tests.XXXXXX")"
trap 'rm -rf -- "$test_build_dir"' EXIT
export CLANG_MODULE_CACHE_PATH="$test_build_dir/module-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$test_build_dir/module-cache"
swift test --disable-sandbox --scratch-path "$test_build_dir"
