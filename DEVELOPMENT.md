# Development Guide

This guide provides comprehensive instructions for setting up and developing the One MCP application.

## Prerequisites

- **Go**: Version 1.19 or later
- **Node.js**: Version 16 or later
- **npm**: Version 7 or later
- **Git**: For version control
- **Docker**: Optional, for containerized development

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/burugo/one-mcp.git
cd one-mcp

# Copy environment configuration
cp .env_example .env

# Start development environment
./run.sh
```

The development script will:
- Start the Go backend on port 3000
- Start the React frontend dev server on port 5173 (with hot reload)
- Watch for file changes and restart services automatically

### 2. Access the Application

- **Frontend**: http://localhost:5173 (development)
- **Backend API**: http://localhost:3000/api
- **Production Build**: http://localhost:3000

## Development Environment

### Backend Development

The backend is built with Go and provides RESTful APIs for the frontend.

#### Directory Structure
