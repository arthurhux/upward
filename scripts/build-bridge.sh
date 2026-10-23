#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
cd "$project_dir"
mkdir -p .build/module-cache browser/.bridge
export CLANG_MODULE_CACHE_PATH="$project_dir/.build/module-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$project_dir/.build/module-cache"
swift build -c release --disable-sandbox -Xswiftc -module-cache-path -Xswiftc "$project_dir/.build/module-cache"
cp .build/release/Upward browser/.bridge/UpwardMotion
xattr -c browser/.bridge/UpwardMotion
codesign --force --sign - browser/.bridge/UpwardMotion
print "Browser motion bridge ready."
