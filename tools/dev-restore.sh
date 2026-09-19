#!/usr/bin/env bash
#
# Ripristina e avvia l'ambiente di sviluppo.
#
# Serve perché in questa sandbox `node_modules` non viene conservato tra un
# riavvio e l'altro e la storia git locale può tornare al commit iniziale (il
# branch remoto `arena/monochrome-3d-jewelry` è invece sempre aggiornato).
#
#   bash tools/dev-restore.sh [porta]
#
set -euo pipefail

PORT="${1:-5173}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE_BRANCH="arena/monochrome-3d-jewelry"
LOCAL_BRANCH="arena/01a0b610-monochrome-3d-jewelry"

echo "==> repository: $ROOT"

# 1. allinea la storia locale al branch remoto senza toccare i file di lavoro
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> fetch di origin/$REMOTE_BRANCH"
  if git fetch origin "$REMOTE_BRANCH" >/dev/null 2>&1; then
    git reset --mixed FETCH_HEAD >/dev/null
    git checkout -q "$LOCAL_BRANCH" 2>/dev/null || true
    echo "    ora a: $(git log --oneline -1)"
    local_dirty="$(git status --short | wc -l | tr -d ' ')"
    echo "    file di lavoro non committati: $local_dirty"
  else
    echo "    (fetch non riuscito: continuo con la copia locale)"
  fi
fi

# 2. dipendenze
if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ]; then
  echo "==> npm install"
  npm install --no-audit --no-fund
else
  echo "==> node_modules presente, salto l'installazione"
fi

# 3. typecheck veloce prima di servire
echo "==> typecheck"
npx tsc --noEmit

# 4. via al server di sviluppo
echo "==> npm run dev (0.0.0.0:$PORT)"
exec npm run dev -- --host 0.0.0.0 --port "$PORT"
