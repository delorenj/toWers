# MCP Admin - Self-Hosted Container

Self-hosted PluggedIn MCP administration interface for the DeLoContainer ecosystem.

## 🚀 Quick Start

### Using Pre-built Image (Recommended)
```bash
# Pull and run from GitHub Container Registry
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f mcp-admin
```

### Building Locally
```bash
# Build the image
./build.sh

# Edit docker-compose.yml to use local build:
# Comment out: image: ghcr.io/delorenj/mcp-admin:latest
# Uncomment: build: context: .

# Run with local build
docker compose up -d
```

## 📡 Access

- **Web Interface**: http://localhost:12005
- **API Endpoint**: http://localhost:12005/api/mcp-servers

## ⚙️ Configuration

### Environment Variables
All configuration is done via environment variables in `docker-compose.yml`:

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Authentication secret
- `ANTHROPIC_API_KEY`: Anthropic API key
- `OPENAI_API_KEY`: OpenAI API key
- `GOOGLE_API_KEY`: Google API key

### Database
- Uses shared DeLoContainer PostgreSQL on port 5432
- Migrations run automatically on container startup
- Database: `pluggedin`

## 🔗 Integration

This service provides the MCP server registry for the MCP proxy at `../mcp-proxy`.

## 🐳 Container Registry

- **Image**: `ghcr.io/delorenj/mcp-admin:latest`
- **Platforms**: linux/amd64, linux/arm64
- **Auto-built**: On push to main branch via GitHub Actions

## 🛠️ Development

```bash
# Build locally
./build.sh

# Run with custom tag
./build.sh v1.0.0

# Push to registry (requires authentication)
docker push ghcr.io/delorenj/mcp-admin:latest
```

## 📦 Container Features

- **Multi-stage build** for optimized image size
- **Automatic database migrations** on startup
- **Health checks** built-in
- **Non-root user** for security
- **Production optimized** Next.js build

## 🔧 Management

```bash
# Start service
docker compose up -d

# Stop service
docker compose down

# View logs
docker compose logs -f

# Restart service
docker compose restart

# Update to latest image
docker compose pull && docker compose up -d
```

## 🎯 Why Containerized?

✅ **Portability**: Run anywhere Docker runs  
✅ **Consistency**: Same environment everywhere  
✅ **Simplicity**: Single image to manage  
✅ **Scalability**: Easy to deploy multiple instances  
✅ **Version Control**: Tagged releases via GHCR  
✅ **CI/CD Ready**: Automated builds on GitHub
