#!/bin/bash

# Script to check if Supabase environment variables are properly configured

echo "🔍 Checking Supabase Environment Variables Setup"
echo ""

# Check .env.local
echo "1. Checking .env.local file..."
if [ -f .env.local ]; then
  if grep -q "SUPABASE_URL" .env.local && grep -q "SUPABASE_ANON_KEY" .env.local; then
    echo "   ✅ .env.local has Supabase variables"
    SUPABASE_URL=$(grep "SUPABASE_URL" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo "   SUPABASE_URL: ${SUPABASE_URL:0:30}..."
  else
    echo "   ❌ .env.local missing Supabase variables"
  fi
  if grep -q "VITE_PUBLIC_SITE_URL" .env.local; then
    SITE_URL=$(grep "VITE_PUBLIC_SITE_URL" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo "   ✅ VITE_PUBLIC_SITE_URL: ${SITE_URL:-'(empty)'}"
  else
    echo "   ⚠️  VITE_PUBLIC_SITE_URL not set in .env.local (will fall back to window.origin)"
  fi
else
  echo "   ⚠️  .env.local file not found"
fi

echo ""

# Check wrangler.toml
echo "2. Checking wrangler.toml..."
if grep -q "SUPABASE_URL" wrangler.toml && grep -q "SUPABASE_ANON_KEY" wrangler.toml; then
  echo "   ✅ wrangler.toml has Supabase variables"
  if grep -q 'SUPABASE_URL = "https://' wrangler.toml; then
    echo "   ✅ SUPABASE_URL is set (not placeholder)"
  else
    echo "   ⚠️  SUPABASE_URL might be a placeholder"
  fi
  if grep -q "VITE_PUBLIC_SITE_URL" wrangler.toml; then
    CURRENT_SITE=$(grep -m1 "VITE_PUBLIC_SITE_URL" wrangler.toml | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo "   ✅ VITE_PUBLIC_SITE_URL in wrangler.toml: ${CURRENT_SITE:0:40}..."
  else
    echo "   ⚠️  VITE_PUBLIC_SITE_URL missing from wrangler.toml"
  fi
else
  echo "   ❌ wrangler.toml missing Supabase variables"
fi

echo ""

# Check Worker endpoint
echo "3. Testing Worker endpoint..."
WORKER_URL="https://patchx-service.angersax.workers.dev"
response=$(curl -s "$WORKER_URL/api/config/public" 2>&1)
if echo "$response" | grep -q "supabaseUrl"; then
  supabase_url=$(echo "$response" | jq -r '.data.supabaseUrl' 2>/dev/null)
  if [ -n "$supabase_url" ] && [ "$supabase_url" != "null" ] && [ "$supabase_url" != "" ]; then
    echo "   ✅ Worker endpoint returns Supabase URL: ${supabase_url:0:30}..."
  else
    echo "   ❌ Worker endpoint returns empty Supabase URL"
    echo "   Response: $response"
  fi
  site_url=$(echo "$response" | jq -r '.data.publicSiteUrl' 2>/dev/null)
  if [ -n "$site_url" ] && [ "$site_url" != "null" ]; then
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
echo "If Worker endpoint works but frontend still fails:"
echo "1. Go to Cloudflare Dashboard → Pages → Your project → Settings → Environment Variables"
echo "2. Add for Production:"
echo "   - SUPABASE_URL = (your Supabase URL)"
echo "   - SUPABASE_ANON_KEY = (your Supabase anon key)"
echo "3. Save and trigger a new deployment"
echo ""
echo "To sync from .env.local to wrangler.toml:"
echo "   npm run sync:env"
echo ""
echo "To test the Worker endpoint:"
echo "   npm run test:config"
