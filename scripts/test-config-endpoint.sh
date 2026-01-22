#!/bin/bash

# Test script to verify Worker's /api/config/public endpoint
# This helps verify that configuration is accessible via the Worker

echo "Testing Worker config endpoint..."
echo ""

# Get Worker URL from _redirects or use default
WORKER_URL="https://patchx-service.angersax.workers.dev"

echo "Worker URL: $WORKER_URL"
echo "Testing endpoint: $WORKER_URL/api/config/public"
echo ""

# Test the endpoint
response=$(curl -s "$WORKER_URL/api/config/public" 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ Endpoint is accessible!"
  echo ""
  echo "Response:"
  echo "$response" | jq '.' 2>/dev/null || echo "$response"
  echo ""

  # Check if publicSiteUrl is present
  if echo "$response" | grep -q "publicSiteUrl"; then
    site_url=$(echo "$response" | jq -r '.data.publicSiteUrl' 2>/dev/null)
    if [ -n "$site_url" ] && [ "$site_url" != "null" ] && [ "$site_url" != "" ]; then
      echo "✅ Public site URL is configured: $site_url"
    else
      echo "⚠️  Public site URL is missing or empty"
    fi
  else
    echo "⚠️  Response doesn't contain publicSiteUrl"
  fi
else
  echo "❌ Failed to access endpoint"
  echo "Error: $response"
  echo ""
  echo "Possible issues:"
  echo "1. Worker not deployed yet - run 'npm run deploy'"
  echo "2. Worker URL incorrect - check _redirects file"
  echo "3. Network issue - check your internet connection"
fi
