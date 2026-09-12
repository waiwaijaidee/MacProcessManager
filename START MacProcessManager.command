#!/bin/bash
# Double-click to START Mac Process Manager
cd "$(dirname "$0")"

echo "Starting Mac Process Manager..."

# Build if dist is missing
if [ ! -f "dist/index.html" ]; then
  echo "Building app (first run)..."
  npm run build
fi

echo "Running app... (close this window or use STOP file to quit)"
NODE_ENV=production npx electron .
