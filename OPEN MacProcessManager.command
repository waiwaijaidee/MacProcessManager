#!/bin/bash
# Double-click to OPEN the built Mac Process Manager app
APP="/Applications/Mac Process Manager.app"

# Prefer the installed app; otherwise use the one built in release/
if [ ! -d "$APP" ]; then
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    APP="$(dirname "$0")/release/mac-arm64/Mac Process Manager.app"
  else
    APP="$(dirname "$0")/release/mac/Mac Process Manager.app"
  fi
fi

if [ -d "$APP" ]; then
  echo "Opening: $APP"
  open "$APP"
else
  echo "Built app not found — falling back to running from source..."
  cd "$(dirname "$0")"
  [ -f "dist/index.html" ] || npm run build
  NODE_ENV=production npx electron .
fi
