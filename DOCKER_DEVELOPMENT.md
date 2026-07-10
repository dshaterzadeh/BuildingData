# Docker Development Setup

This document explains how to run the Building Data Analysis application in Docker with hot reloading for development.

## Why Use Docker for Development?

- **Consistent Environment**: Same setup across all team members
- **Isolation**: No conflicts with local system dependencies
- **Easy Setup**: No need to install Node.js, Python, or other dependencies locally
- **Hot Reloading**: Changes to your code are automatically reflected in the browser

## Quick Start

### Option 1: Using the Script (Recommended)
```bash
./run-dev.sh
```

### Option 2: Manual Docker Commands
```bash
# Build and start development environment
docker-compose -f docker-compose.dev.yml up --build

# Stop the environment
docker-compose -f docker-compose.dev.yml down
```

## Development URLs

Once running, access the application at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## How Hot Reloading Works

### Frontend Changes
- Changes to files in `src/` directory are automatically detected
- Browser automatically refreshes with new changes
- No need to rebuild or restart containers

### Backend Changes
- Changes to Python files in `backend/` are automatically detected
- FastAPI server automatically restarts with new changes

## Volume Mounting

The development setup uses Docker volumes to sync your local files with the containers:

```yaml
volumes:
  - ./src:/app/src                    # Frontend source code
  - ./public:/app/public              # Frontend public assets
  - ./index.html:/app/index.html      # Frontend entry point
  - ./vite.config.js:/app/vite.config.js  # Vite configuration
  - ./backend:/app                    # Backend source code
  - /app/node_modules                 # Exclude node_modules from sync
```

## Environment Variables

### Frontend
- `CHOKIDAR_USEPOLLING=true`: Enables file watching in Docker
- `WATCHPACK_POLLING=true`: Enables webpack polling for changes

### Backend
- `PYTHONUNBUFFERED=1`: Ensures Python output is not buffered

## Troubleshooting

### Changes Not Reflecting
1. Check if containers are running: `docker-compose -f docker-compose.dev.yml ps`
2. Restart containers: `docker-compose -f docker-compose.dev.yml restart`
3. Rebuild containers: `docker-compose -f docker-compose.dev.yml up --build`

### Port Already in Use
If you get "Address already in use" errors:
```bash
# Stop all containers
docker-compose -f docker-compose.dev.yml down

# Kill any processes using the ports
sudo lsof -ti:5173 | xargs kill -9
sudo lsof -ti:8000 | xargs kill -9

# Restart
./run-dev.sh
```

### Performance Issues
If file watching is slow:
1. Increase polling interval in `vite.config.js`
2. Consider using Docker Desktop's file sharing optimizations
3. Exclude unnecessary directories from volume mounting

## Production vs Development

- **Development** (`docker-compose.dev.yml`): Hot reloading, volume mounting, development server
- **Production** (`docker-compose.yml`): Optimized build, nginx serving, no source code mounting

## File Structure

```
├── docker-compose.yml          # Production setup
├── docker-compose.dev.yml      # Development setup
├── Dockerfile.frontend         # Production frontend
├── Dockerfile.frontend.dev     # Development frontend
├── run-dev.sh                  # Development startup script
└── vite.config.js              # Vite configuration (updated for Docker)
```
