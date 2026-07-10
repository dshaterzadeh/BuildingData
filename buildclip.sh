#!/bin/bash

# BuildClip - One-Command Deployment Script
# This script builds and runs the entire BuildClip application

set -e  # Exit on any error

echo "🏗️  BuildClip - Urban Building Intelligence Platform"
echo "=================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker environment check passed"

# Stop and remove existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start the application
echo "🔨 Building and starting BuildClip..."
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are healthy
echo "🏥 Checking service health..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker-compose ps | grep -q "healthy"; then
        echo "✅ All services are healthy!"
        break
    fi
    
    echo "⏳ Waiting for services to be healthy... (attempt $((attempt + 1))/$max_attempts)"
    sleep 5
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "⚠️  Services may still be starting up. Please wait a moment and try accessing the application."
fi

# Display access information
echo ""
echo "🎉 BuildClip is now running!"
echo "=================================================="
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:8000"
echo "🏥 Health Check: http://localhost:8000/health"
echo ""
echo "🔧 Useful commands:"
echo "  • View logs: docker-compose logs -f"
echo "  • Stop app: docker-compose down"
echo "  • Restart app: docker-compose restart"
echo "  • Rebuild app: docker-compose up --build -d"
echo ""
echo "🚀 Open your browser and navigate to: http://localhost"
echo ""

# Optional: Open browser (works on macOS and Linux)
if command -v open &> /dev/null; then
    echo "🌐 Opening browser..."
    open http://localhost
elif command -v xdg-open &> /dev/null; then
    echo "🌐 Opening browser..."
    xdg-open http://localhost
fi
