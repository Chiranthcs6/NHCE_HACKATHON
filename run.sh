#!/bin/bash
set -e

cd redis
podman-compose down
podman-compose up -d
cd ..

node backend/main.js &
NODE_PID=$!

trap 'echo "Stopping..."; kill $NODE_PID 2>/dev/null || true; cd redis && podman-compose down' EXIT INT TERM

source bin/activate
python3 main_system.py

