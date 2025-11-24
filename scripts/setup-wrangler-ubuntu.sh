#!/bin/bash

# Setup script to install wrangler on Ubuntu/WSL2
# Run this script from within WSL/Ubuntu terminal

set -e

echo "Installing wrangler for Ubuntu/Linux..."

# Check if we're in the project directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Option 1: Install wrangler as dev dependency (recommended)
echo "Installing wrangler as a dev dependency..."
npm install --save-dev wrangler

# Verify installation
echo ""
echo "Verifying installation..."
npx wrangler --version

echo ""
echo "✅ Wrangler installed successfully!"
echo ""
echo "=== Authentication Options ==="
echo ""
echo "Option 1: OAuth Login (opens browser)"
echo "  npx wrangler login"
echo ""
echo "Option 2: API Token (recommended for Ubuntu/WSL)"
echo "  1. Get your API token from: https://dash.cloudflare.com/profile/api-tokens"
echo "  2. Set environment variable:"
echo "     export CLOUDFLARE_API_TOKEN='your-api-token-here'"
echo "  3. Add to ~/.bashrc or ~/.zshrc for persistence:"
echo "     echo 'export CLOUDFLARE_API_TOKEN=\"your-api-token-here\"' >> ~/.bashrc"
echo ""
echo "Option 3: Global API Key (legacy, not recommended)"
echo "  export CLOUDFLARE_EMAIL='your-email@example.com'"
echo "  export CLOUDFLARE_API_KEY='your-global-api-key'"
echo ""
echo "=== Usage ==="
echo "  - npm run deploy    (uses npx wrangler)"
echo "  - npx wrangler deploy"
echo "  - npx wrangler dev"
echo "  - npx wrangler login"

