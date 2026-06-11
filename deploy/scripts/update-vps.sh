#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/auth-service}"
IMAGE="${IMAGE:-ghcr.io/thomassloboda/auth}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
