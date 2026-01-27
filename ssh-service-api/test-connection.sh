#!/bin/bash
# Diagnostic script to test SSH Service API connectivity
# Usage: ./test-connection.sh [API_URL] [API_KEY]

set -e

API_URL="${1:-https://supagraph.ai/api/ssh}"
API_KEY="${2:-sk-1234}"

echo "=========================================="
echo "SSH Service API Connection Diagnostics"
echo "=========================================="
echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:10}..."
echo "=========================================="
echo ""

# Normalize API URL
API_URL=$(echo "$API_URL" | sed 's|/*$||')
if [[ "$API_URL" != *"/api/ssh" ]]; then
  API_URL="${API_URL%/}/api/ssh"
fi

# Test 1: Health endpoint (no auth required)
echo "Test 1: Health endpoint (GET)"
HEALTH_URL="${API_URL%/}/health"
echo "URL: $HEALTH_URL"
HEALTH_RESPONSE=$(curl -k -s --max-time 10 -w "\n%{http_code}" "$HEALTH_URL" 2>&1)
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

echo "HTTP Code: $HEALTH_HTTP_CODE"
if [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
  echo "❌ Health check failed"
  echo "Response: $HEALTH_BODY"
fi
echo ""
