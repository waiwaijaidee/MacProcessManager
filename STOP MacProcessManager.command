#!/bin/bash
# Double-click to STOP Mac Process Manager
echo "Stopping Mac Process Manager..."
pkill -f "MacProcessManager/node_modules/electron" 2>/dev/null
pkill -f "Mac Process Manager" 2>/dev/null

sleep 1
if pgrep -f "MacProcessManager/node_modules/electron" > /dev/null 2>&1; then
  echo "Still running, forcing quit..."
  pkill -9 -f "MacProcessManager/node_modules/electron" 2>/dev/null
fi

echo "Stopped."
sleep 1
