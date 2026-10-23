#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
cd "$project_dir"
mkdir -p .build/module-cache dist/Upward.app/Contents/MacOS
export CLANG_MODULE_CACHE_PATH="$project_dir/.build/module-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$project_dir/.build/module-cache"
swift build -c release --disable-sandbox -Xswiftc -module-cache-path -Xswiftc "$project_dir/.build/module-cache"
cp .build/release/Upward dist/Upward.app/Contents/MacOS/Upward
cp scripts/Info.plist dist/Upward.app/Contents/Info.plist
xattr -cr dist/Upward.app
codesign --force --sign - dist/Upward.app
print "Built $project_dir/dist/Upward.app"
