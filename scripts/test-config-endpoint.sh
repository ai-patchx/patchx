#!/bin/bash

# Test script to verify Worker's /api/config/public endpoint
# This helps verify that Supabase config is accessible via the Worker

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

  # Check if Supabase URL is present
  if echo "$response" | grep -q "supabaseUrl"; then
    supabase_url=$(echo "$response" | jq -r '.data.supabaseUrl' 2>/dev/null)
    if [ -n "$supabase_url" ] && [ "$supabase_url" != "null" ] && [ "$supabase_url" != "" ]; then
      echo "✅ Supabase URL is configured: $supabase_url"
    else
      echo "❌ Supabase URL is missing or empty"
    fi
  else
    echo "❌ Response doesn't contain supabaseUrl"
  fi

  # Check if Supabase key is present
  if echo "$response" | grep -q "supabaseAnonKey"; then
    supabase_key=$(echo "$response" | jq -r '.data.supabaseAnonKey' 2>/dev/null)
    if [ -n "$supabase_key" ] && [ "$supabase_key" != "null" ] && [ "$supabase_key" != "" ]; then
      echo "✅ Supabase Anon Key is configured (length: ${#supabase_key})"
    else
      echo "❌ Supabase Anon Key is missing or empty"
    fi
  else
    echo "❌ Response doesn't contain supabaseAnonKey"
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
