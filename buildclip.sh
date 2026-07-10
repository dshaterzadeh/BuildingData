#!/bin/bash

# BuildClip - One-Command Deployment Script
# Builds and serves the frontend (the app is fully client-side; building data
# is fetched directly from the Overpass API in the browser).

set -e

echo "BuildClip - Building Data Explorer"
echo "=================================="

if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

echo "Building and starting the frontend container..."
docker compose up -d --build

echo ""
echo "Done. The app is running at http://localhost:8081"
echo "Stop it with: docker compose down"
