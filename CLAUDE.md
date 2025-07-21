# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

One MCP is a centralized management platform for Model Context Protocol (MCP) services. It provides a web interface to discover, install, configure, and monitor MCP services with enterprise features like multi-tenancy, health monitoring, and analytics.

## Development Commands

### Quick Start

```bash
# Start development environment (frontend + backend)
./run.sh

# Access the application
# Backend: http://localhost:3000
# Frontend dev server: http://localhost:5173
# Default login: root / 123456
```

### Building

```bash
# Production build
./deploy/build.sh

# Docker build
docker build -t toWers .
docker-compose up -d
```

### Testing

```bash
# Backend tests
go test -v ./backend/api/handler/... | grep FAIL
go test -v ./... -run ^TestSpecificFunction$  # Test specific function

# Frontend tests
cd frontend
npm run test          # Run tests
npm run test:coverage # With coverage
```

### Common Tasks

```bash
# Monitor logs
tail -f backend.log
grep "ERROR\|WARN\|Failed" backend.log

# Service management
pkill -f toWers      # Stop service
ps aux | grep toWers # Check status
curl "http://localhost:3000/api/status"  # API health check

# Database reset (complete flow)
pkill -f toWers
cp data/toWers.db data/toWers.db.backup.$(date +%Y%m%d_%H%M%S)
rm -f data/toWers.db
redis-cli flushdb  # IMPORTANT: Must clear Redis cache
bash ./run.sh
```

## Architecture Overview

### Backend (Go + Gin)

- **API Structure**: RESTful endpoints organized by functionality (auth, services, market, analytics)
- **Layered Architecture**:

  - Router Layer: `/backend/api/route/` - API and web routing
  - Handler Layer: `/backend/api/handler/` - Request handling logic
  - Service Layer: `/backend/library/` - Business logic and external integrations
  - Model Layer: `/backend/model/` - Data models using Thing ORM

- **Key Services**:
  - **Proxy Service**: Manages MCP service lifecycle, health checks, and request proxying
  - **Market Service**: NPM/PyPI package discovery and installation
  - **Auth Service**: JWT-based authentication with OAuth support

### Frontend (React + TypeScript)

- **Tech Stack**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State Management**: Zustand for global state
- **Key Features**: Real-time SSE for installation progress, health monitoring, i18n support

### MCP Service Integration

- **Service Types**: stdio (process-based), SSE (streaming), streamable_http
- **Proxy Flow**: Client → Auth Middleware → Proxy Handler → MCP Service
- **Health Management**: Automatic health checks, recovery, and status caching

## Important Development Notes

### Thing ORM Usage

The project uses Thing ORM (github.com/burugo/thing) for database operations:

- Models embed `thing.BaseModel` and use `db` tags for columns
- Automatic caching with Redis or in-memory
- Soft delete support
- Example: `userThing.Save(&user)`, `userThing.ByID(id)`, `userThing.Query(params).Fetch(0, 10)`

### API Development

When using `frontend/src/utils/api.ts`:

- DO NOT add `/api` prefix to request paths (it's already in baseURL)
- Correct: `api.get('/user/self')`
- Wrong: `api.get('/api/user/self')`

### Database Schema

Key tables:

- `users`: Authentication, roles (regular=0, admin>=10, root=100)
- `mcp_services`: Service definitions and configurations
- `proxy_request_stats`: Analytics data
- `user_configs` & `config_services`: User-specific service configurations

### Authentication & Authorization

- JWT tokens with refresh token support
- Role-based access: Regular users, Admin (role >= 10), Root (role = 100)
- OAuth providers: GitHub, Google, WeChat

### Environment Configuration

Create `.env` file with:

```bash
PORT=3000
JWT_SECRET=your-secret-key
GITHUB_TOKEN=your-github-token  # For NPM package star counts
SQLITE_PATH=/data/toWers.db   # Or use SQL_DSN for MySQL/PostgreSQL
REDIS_CONN_STRING=redis://localhost:6379  # Optional
```

## Code Conventions

- Use existing patterns and libraries - don't introduce new dependencies without checking
- Follow Go and TypeScript best practices
- Thing ORM for all database operations
- Use the existing middleware for auth, rate limiting, and CORS
- Frontend components should use shadcn/ui components where possible
- All user-facing strings should support i18n
