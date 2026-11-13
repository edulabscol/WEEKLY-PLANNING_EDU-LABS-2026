#!/usr/bin/env bash
# Solo para entornos SIN acceso a red (sandbox de desarrollo):
# enlaza las dependencias preinstaladas en /opt/npm-tools en lugar de `npm install`.
# En un equipo normal use `npm ci` / `npm install`.
set -euo pipefail
SRC="${OFFLINE_NODE_MODULES:-/opt/npm-tools/node_modules}"
cd "$(dirname "$0")/.."
mkdir -p node_modules/@types node_modules/.bin
for p in react react-dom scheduler esbuild @esbuild typescript playwright playwright-core undici-types; do
  [ -e "node_modules/$p" ] || ln -s "$SRC/$p" "node_modules/$p"
done
[ -e node_modules/@types/node ] || ln -s "$SRC/@types/node" node_modules/@types/node
ln -sf ../typescript/bin/tsc node_modules/.bin/tsc
ln -sf ../playwright/cli.js node_modules/.bin/playwright
ln -sf ../esbuild/bin/esbuild node_modules/.bin/esbuild
echo "Dependencias enlazadas desde $SRC"
