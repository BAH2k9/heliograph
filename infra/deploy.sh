#!/bin/sh
# Deploy the Khet Web stack on the server (LXC 107).
#
# Prereqs on the box: /opt/khet is a checkout of this repo tracking origin/main,
# git + docker + the compose plugin are installed, and /opt/khet/infra/.env holds
# POSTGRES_PASSWORD (never in git). Then, from any machine:
#
#   ssh khet 'cd /opt/khet/infra && ./deploy.sh'
#
# (with a `Host khet` entry in ~/.ssh/config pointing at 192.168.0.20).
set -eu

cd "$(dirname "$0")"

echo "==> Pulling latest main"
git pull --ff-only

echo "==> Building and (re)starting the stack"
docker compose up -d --build

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Running containers:"
docker compose ps
