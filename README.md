# toWers - Self-Hosted MCP Admin

Self-hosted PluggedIn MCP administration interface for managing Model Context Protocol servers.

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone git@github.com:delorenj/toWers.git
cd toWers

# Run setup script to generate secrets
./setup.sh
```

### 2. Configure Environment
Edit `.env` file and set your configuration:

```bash
# Required: Set your database URL
DATABASE_URL=postgresql://username:password@host:5432/database_name

# Required: Add your AI API keys
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
GOOGLE_API_KEY=your-google-api-key

# Optional: OAuth providers
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret
```

### 3. Run the Application
```bash
# Using pre-built image (recommended)
docker compose up -d

# Or build locally
# Edit docker-compose.yml to uncomment build section
docker compose up -d --build
```

## 📡 Access

- **Web Interface**: http://localhost:12005
- **API Endpoint**: http://localhost:12005/api/mcp-servers

## ⚙️ Configuration

### Environment Variables

All configuration is done via the `.env` file:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `NEXTAUTH_SECRET` | Authentication secret (auto-generated) | ✅ |
| `ANTHROPIC_API_KEY` | Anthropic API key | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | ✅ |
| `GOOGLE_API_KEY` | Google API key | ✅ |
| `GITHUB_ID` | GitHub OAuth client ID | ❌ |
| `GITHUB_SECRET` | GitHub OAuth client secret | ❌ |

### Database Setup

The application requires a PostgreSQL database. It will automatically run migrations on startup.

```sql
-- Create database (if needed)
CREATE DATABASE pluggedin;
```

## 🐳 Container Registry

- **Image**: `ghcr.io/delorenj/mcp-admin:latest`
- **Platforms**: linux/amd64, linux/arm64
- **Auto-built**: On push to main branch via GitHub Actions

## 🛠️ Development

### Local Development
```bash
# Install dependencies
pnpm install

# Set up environment
./setup.sh

# Run development server
pnpm dev
```

### Building Container
```bash
# Build locally
./build.sh

# Build with custom tag
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

## 🔒 Security

- **Environment Variables**: All secrets are stored in `.env` (not committed to git)
- **Auto-generated Secrets**: Setup script generates secure random secrets
- **Non-root Container**: Application runs as non-root user
- **Health Checks**: Built-in container health monitoring

## 🎯 Why toWers?

✅ **Portability**: Run anywhere Docker runs  
✅ **Consistency**: Same environment everywhere  
✅ **Simplicity**: Single `docker compose up -d` command  
✅ **Security**: Proper secret management  
✅ **Scalability**: Easy to deploy multiple instances  
✅ **Version Control**: Tagged releases via GHCR  
✅ **CI/CD Ready**: Automated builds on GitHub

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
