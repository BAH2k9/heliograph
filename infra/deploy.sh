#!/bin/sh
# Deploy the Heliograph stack on the server (LXC 107).
#
# Prereqs on the box: /opt/heliograph is a checkout of this repo tracking origin/main,
# git + docker + the compose plugin are installed, and /opt/heliograph/infra/.env holds
# POSTGRES_PASSWORD (never in git). Then, from any machine:
#
#   ssh heliograph 'cd /opt/heliograph/infra && ./deploy.sh'
#
# (with a `Host heliograph` entry in ~/.ssh/config pointing at 192.168.0.20).
#
# IP-09/IP-10 note: the compose rename (`name: heliograph`, POSTGRES_DB/USER: heliograph)
# points this stack at a brand-new, empty `heliograph_db-data` volume. Do NOT run this
# script as a plain redeploy of the rebrand - the DB and the /opt path move first, per
# IP-10's runbook (vault: Remediation/IP-10-infra-and-vault-identifiers.md).
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
