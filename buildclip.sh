#!/bin/bash

# BuildClip - One-Command Deployment Script
# This script builds and runs the entire BuildClip application
# Supports both development (with hot reloading) and production modes

set -e  # Exit on any error

# Default to development mode
MODE=${1:-dev}

echo "🏗️  BuildClip - Urban Building Intelligence Platform"
echo "=================================================="
echo "Mode: $MODE"

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

# Function to run development mode
run_development() {
    echo "🚀 Starting Development Mode (with hot reloading)..."
    
    # Stop and remove existing containers
    echo "🧹 Cleaning up existing containers..."
    docker-compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
    
    # Build and start the development environment
    echo "🔨 Building and starting development containers..."
    docker-compose -f docker-compose.dev.yml up --build
    
    echo ""
    echo "✅ Development environment started!"
    echo "📱 Frontend: http://localhost:5173"
    echo "🔧 Backend: http://localhost:8000"
    echo "📚 API Docs: http://localhost:8000/docs"
    echo ""
    echo "💡 Changes to your code will automatically reload!"
    echo "🛑 Press Ctrl+C to stop the services"
}

# Function to run production mode
run_production() {
    echo "🚀 Starting Production Mode..."
    
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
}

# Function to show help
show_help() {
    echo "Usage: $0 [dev|prod|help]"
    echo ""
    echo "Modes:"
    echo "  dev   - Development mode with hot reloading (default)"
    echo "  prod  - Production mode with optimized build"
    echo "  help  - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0        # Run in development mode"
    echo "  $0 dev    # Run in development mode"
    echo "  $0 prod   # Run in production mode"
    echo ""
    echo "Development Mode Features:"
    echo "  • Hot reloading for frontend changes"
    echo "  • Live backend reloading"
    echo "  • Volume mounting for real-time file sync"
    echo "  • Development server on port 5173"
    echo ""
    echo "Production Mode Features:"
    echo "  • Optimized builds"
    echo "  • Nginx serving"
    echo "  • Production-ready configuration"
    echo "  • Frontend on port 80"
}

# Main script logic
case $MODE in
    "dev"|"development")
        run_development
        ;;
    "prod"|"production")
        run_production
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo "❌ Invalid mode: $MODE"
        echo ""
        show_help
        exit 1
        ;;
esac
