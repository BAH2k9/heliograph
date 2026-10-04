#!/bin/sh
# Deploy the Heliograph stack on the deploy host.
#
# Prereqs on the host: <checkout> is a clone of this repo tracking origin/main,
# git + docker + the compose plugin are installed, and <checkout>/infra/.env holds
# the values from .env.example (never in git). Then, from any machine:
#
#   ssh <app-host> 'cd <checkout>/infra && ./deploy.sh'
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
