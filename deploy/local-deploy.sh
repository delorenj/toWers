#!/bin/bash
set -e

echo "Building One MCP Docker image..."
docker build -t toWers:$(cat VERSION) .
docker tag toWers:$(cat VERSION) toWers:latest

echo "Stopping existing container..."
docker stop toWers-prod 2>/dev/null || true
docker rm toWers-prod 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name toWers-prod \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  -e SQLITE_PATH=/data/toWers.db \
  toWers:latest

echo "Deployment completed!"
echo "Application is running at http://localhost:3000"