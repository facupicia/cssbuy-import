#!/usr/bin/env bash
#
# Actualiza el server solo cuando hay commits nuevos en main.
#
# Lo corre cron cada 2 minutos en el server:
#
#   */2 * * * * bash /ruta/al/proyecto/scripts/auto-deploy.sh >> $HOME/auto-deploy.log 2>&1
#
# Si main no cambió desde el último deploy, no hace nada. Si cambió, baja los
# commits y reconstruye el contenedor. Se eligió revisar cada tanto en vez de
# un webhook o un runner de GitHub Actions: no hay que abrir ningún puerto del
# server a internet, y un runner propio en un repo público deja que un PR
# ajeno corra código en el server.

set -euo pipefail

# cron arranca con un PATH mínimo: sin esto no encuentra docker ni git.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

cd "$(dirname "$0")/.."

# Qué commit quedó andando y cuál falló. Se guarda aparte del repo: comparar
# solo contra HEAD haría que un build fallido no se reintente nunca, porque
# después del pull HEAD ya es el commit nuevo.
DESPLEGADO="$HOME/.calculadora-desplegado"
FALLIDO="$HOME/.calculadora-fallido"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Un build tarda más que el intervalo de cron: si el anterior sigue corriendo,
# este se va sin hacer nada en vez de pisarlo.
exec 9>/tmp/calculadora-auto-deploy.lock
if command -v flock > /dev/null; then
  flock -n 9 || exit 0
fi

git fetch --quiet origin main
remoto=$(git rev-parse origin/main)

[ "$remoto" = "$(cat "$DESPLEGADO" 2>/dev/null)" ] && exit 0
# Un commit que ya falló no se reintenta cada 2 minutos: se espera al próximo.
[ "$remoto" = "$(cat "$FALLIDO" 2>/dev/null)" ] && exit 0

log "Hay una versión nueva en main: ${remoto:0:7}"

if [ "$(git rev-parse HEAD)" != "$remoto" ]; then
  # --ff-only: si alguien tocó archivos a mano en el server, falla y avisa en
  # el log en vez de mezclar cosas raras.
  if ! git pull --ff-only --quiet origin main; then
    log "ERROR: git pull falló (¿hay cambios hechos a mano en el server?). Revisá con: git status"
    echo "$remoto" > "$FALLIDO"
    exit 1
  fi
fi

log "Reconstruyendo el contenedor…"
if docker compose up -d --build; then
  echo "$remoto" > "$DESPLEGADO"
  rm -f "$FALLIDO"
  # Cada build deja la imagen anterior sin uso; sin limpiar, el disco se llena.
  docker image prune -f > /dev/null
  log "Listo: $(git log --oneline -1)"
else
  echo "$remoto" > "$FALLIDO"
  log "ERROR: falló el build. El sitio sigue con la versión anterior; se reintenta con el próximo commit."
  exit 1
fi
