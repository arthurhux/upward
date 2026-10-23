#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h}"
if [[ ! -x "$project_dir/dist/Upward.app/Contents/MacOS/Upward" ]]; then
    /bin/zsh "$project_dir/scripts/build.sh"
fi
open "$project_dir/dist/Upward.app"
