#!/bin/bash

# Build script for toWers MCP Admin container

set -e

IMAGE_NAME="ghcr.io/delorenj/towers"
TAG="${1:-latest}"

echo "🔨 Building toWers MCP Admin container..."
echo "📦 Image: $IMAGE_NAME:$TAG"

# Build the image
docker build -t "$IMAGE_NAME:$TAG" .

echo "✅ Build complete!"
echo ""
echo "🚀 To run locally:"
echo "   docker compose up -d"
echo ""
echo "📤 To push to registry:"
echo "   docker push $IMAGE_NAME:$TAG"
echo ""
echo "🧪 To test the container:"
echo "   docker run --rm -p 12005:3000 --env-file .env $IMAGE_NAME:$TAG"
