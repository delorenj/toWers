#!/bin/bash

# Setup script for toWers MCP Admin
# Generates secure secrets and sets up environment

set -e

echo "🔧 Setting up toWers MCP Admin..."

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists. Creating backup..."
    cp .env .env.backup.$(date +%s)
fi

# Copy example file
cp .env.example .env

# Generate secrets
echo "🔐 Generating secure secrets..."

NEXTAUTH_SECRET=$(openssl rand -hex 32)
ADMIN_MIGRATION_SECRET=$(openssl rand -hex 16)
SERVER_ACTIONS_KEY=$(openssl rand -hex 32)

# Update .env with generated secrets
sed -i "s/generate-with-openssl-rand-hex-32/$NEXTAUTH_SECRET/g" .env
sed -i "s/generate-with-openssl-rand-hex-16/$ADMIN_MIGRATION_SECRET/g" .env
sed -i "s/generate-with-openssl-rand-hex-32/$SERVER_ACTIONS_KEY/g" .env

echo "✅ Secrets generated successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Edit .env and set your database URL"
echo "2. Add your API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)"
echo "3. Run: docker compose up -d"
echo ""
echo "🔒 Your .env file contains secrets - never commit it to git!"
echo "   (It's already in .gitignore for safety)"
echo ""
echo "🌐 Once running, access the admin interface at:"
echo "   http://localhost:12005"
