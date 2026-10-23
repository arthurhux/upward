#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h}"
cd "$project_dir/browser"
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -x .bridge/UpwardMotion ]]; then /bin/zsh "$project_dir/scripts/build-bridge.sh"; fi
if [[ ! -f dist/index.html ]]; then npm run build; fi
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    open http://127.0.0.1:8787
    exit 0
fi
(sleep 1; open http://127.0.0.1:8787) &
exec node server/server.mjs
