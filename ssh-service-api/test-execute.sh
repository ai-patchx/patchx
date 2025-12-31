#!/bin/bash
# Test script for execute endpoint (for patch merge and other commands)
# Usage: ./test-execute.sh [API_URL] [API_KEY] [HOST] [USERNAME] [PASSWORD] [COMMAND]

set -e

# Default values
API_URL="${1:-https://supagraph.ai:8443/api/ssh}"
API_KEY="${2:-sk-1234}"
HOST="${3:-localhost}"
USERNAME="${4:-$USER}"
PASSWORD="${5:-}"
COMMAND="${6:-echo 'Hello from SSH Service API'}"

echo "=========================================="
echo "Testing Execute Endpoint"
echo "=========================================="
echo "API URL: $API_URL"
echo "Host: $HOST"
echo "Username: $USERNAME"
echo "Command: $COMMAND"
echo "=========================================="
echo ""

# Prompt for password if not provided
if [ -z "$PASSWORD" ]; then
  read -sp "Enter SSH password: " PASSWORD
  echo ""
fi

# Prepare request body
REQUEST_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$COMMAND",
  "timeout": 300000
}
EOF
)

# Ensure API_URL ends with /api/ssh (with or without trailing slash)
API_URL=$(echo "$API_URL" | sed 's|/*$||')
if [[ "$API_URL" != *"/api/ssh" ]]; then
  # If API_URL doesn't end with /api/ssh, append it
  API_URL="${API_URL%/}/api/ssh"
fi

ENDPOINT_URL="${API_URL%/}/execute"
echo "Sending request to $ENDPOINT_URL..."
echo ""

# Make the request (using -k to skip SSL verification for testing)
RESPONSE=$(curl -k -s --max-time 300 -w "\n%{http_code}" -X POST "$ENDPOINT_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$REQUEST_BODY")

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status Code: $HTTP_CODE"
echo ""
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null || echo "unknown")
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Execute test PASSED"
    OUTPUT=$(echo "$BODY" | jq -r '.output' 2>/dev/null || echo "")
    if [ -n "$OUTPUT" ]; then
      echo "Output:"
      echo "$OUTPUT"
    fi
    exit 0
  else
    echo "❌ Execute test FAILED - success=false"
    ERROR=$(echo "$BODY" | jq -r '.error' 2>/dev/null || echo "Unknown error")
    echo "Error: $ERROR"
    exit 1
  fi
else
  echo "❌ Execute test FAILED - HTTP $HTTP_CODE"
  exit 1
fi

