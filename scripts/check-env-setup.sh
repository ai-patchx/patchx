#!/bin/bash

# Script to check if D1 database and LiteLLM environment variables are properly configured

echo "🔍 Checking Environment Variables Setup"
echo ""

# Check .env.local
echo "1. Checking .env.local file..."
if [ -f .env.local ]; then
  if grep -q "VITE_PUBLIC_SITE_URL" .env.local; then
    SITE_URL=$(grep "VITE_PUBLIC_SITE_URL" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo "   ✅ VITE_PUBLIC_SITE_URL: ${SITE_URL:-'(empty)'}"
  else
    echo "   ⚠️  VITE_PUBLIC_SITE_URL not set in .env.local (will fall back to window.origin)"
  fi
  if grep -q "LITELLM_BASE_URL" .env.local && grep -q "LITELLM_API_KEY" .env.local; then
    echo "   ✅ .env.local has LiteLLM variables"
    LITELLM_URL=$(grep "LITELLM_BASE_URL" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo "   LITELLM_BASE_URL: ${LITELLM_URL:0:30}..."
  else
    echo "   ⚠️  .env.local missing LiteLLM variables (model selection feature will not be available)"
  fi
else
  echo "   ⚠️  .env.local file not found"
fi

echo ""

# Check wrangler.toml
echo "2. Checking wrangler.toml..."
if grep -q "d1_databases" wrangler.toml; then
  echo "   ✅ wrangler.toml has D1 database configuration"
  if grep -q 'database_id = "production_db_id"' wrangler.toml; then
    echo "   ⚠️  D1 database_id appears to be a placeholder - update with actual database ID"
  else
    echo "   ✅ D1 database_id is configured"
  fi
else
  echo "   ❌ wrangler.toml missing D1 database configuration"
  echo "   Add d1_databases section with DB binding"
fi

if grep -q "VITE_PUBLIC_SITE_URL" wrangler.toml; then
  CURRENT_SITE=$(grep -m1 "VITE_PUBLIC_SITE_URL" wrangler.toml | cut -d '=' -f2 | tr -d '"' | tr -d "'")
  echo "   ✅ VITE_PUBLIC_SITE_URL in wrangler.toml: ${CURRENT_SITE:0:40}..."
else
  echo "   ⚠️  VITE_PUBLIC_SITE_URL missing from wrangler.toml"
fi

if grep -q "LITELLM_BASE_URL" wrangler.toml && grep -q "LITELLM_API_KEY" wrangler.toml; then
  echo "   ✅ wrangler.toml has LiteLLM variables"
else
  echo "   ⚠️  wrangler.toml missing LiteLLM variables (can be configured in app_settings table)"
fi

echo ""

# Check Worker endpoint
echo "3. Testing Worker endpoint..."
WORKER_URL="https://patchx-service.angersax.workers.dev"
response=$(curl -s "$WORKER_URL/api/config/public" 2>&1)
if echo "$response" | grep -q "publicSiteUrl"; then
  site_url=$(echo "$response" | jq -r '.data.publicSiteUrl' 2>/dev/null)
  if [ -n "$site_url" ] && [ "$site_url" != "null" ] && [ "$site_url" != "" ]; then
    echo "   ✅ Worker endpoint returns public site URL: ${site_url:0:40}..."
  else
    echo "   ⚠️  Worker endpoint public site URL empty"
  fi
else
  echo "   ❌ Worker endpoint not accessible or invalid response"
  echo "   Response: $response"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "To initialize D1 database:"
echo "  1. Create D1 database: wrangler d1 create patchx-db"
echo "  2. Update wrangler.toml with the database_id from step 1"
echo "  3. Initialize schema: ./scripts/init-d1-db.sh --confirm"
echo ""
echo "To sync from .env.local to wrangler.toml:"
echo "   npm run sync:env"
echo ""
echo "To test the Worker endpoint:"
echo "   npm run test:config"
