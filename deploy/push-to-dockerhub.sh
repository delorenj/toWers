#!/bin/bash
set -e

VERSION=$(cat ../VERSION)
DOCKER_REPO="buru2020/toWers"

echo "Setting up Docker Buildx for multi-architecture builds..."

# Check Docker login status
echo "Checking Docker login status..."
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker daemon is not running or not accessible"
    exit 1
fi

# Verify Docker Hub login
echo "Verifying Docker Hub authentication..."
if ! docker system info | grep -q "Username:"; then
    echo "Warning: Not logged in to Docker Hub"
    echo "Please run: docker login"
    read -p "Do you want to login now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker login
    else
        echo "Exiting..."
        exit 1
    fi
fi

# Clean up possible cache issues
# echo "Cleaning up Docker buildx cache..."
# docker buildx prune -f || true

# Create and use multi-architecture builder (if not exists)
if ! docker buildx ls | grep -q multiarch; then
    echo "Creating multiarch builder..."
    docker buildx create --use --name multiarch --driver docker-container
else
    echo "Using existing multiarch builder..."
    docker buildx use multiarch
fi

# Ensure builder is running
echo "Inspecting and starting builder..."
docker buildx inspect --bootstrap

echo "Building and pushing multi-architecture images..."
echo "Building version: $VERSION"

# Build and push multi-architecture images (push both latest and version tags)
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t $DOCKER_REPO:latest \
    -t $DOCKER_REPO:$VERSION \
    --push \
    ../

echo "Successfully pushed multi-architecture images to Docker Hub!"
echo "Latest: https://hub.docker.com/r/$DOCKER_REPO/tags"
echo "Supported platforms: linux/amd64, linux/arm64"
echo ""
echo "You can now pull the image with:"
echo "  docker pull $DOCKER_REPO:latest"
echo "  docker pull $DOCKER_REPO:$VERSION"
echo ""
echo "Verifying multi-architecture manifest:"
docker buildx imagetools inspect $DOCKER_REPO:latest 