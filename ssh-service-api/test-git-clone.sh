#!/bin/bash
# Test script for git-clone endpoint
# Usage: ./test-git-clone.sh [API_URL] [API_KEY] [HOST] [USERNAME] [PASSWORD] [PROJECT] [BRANCH] [GERRIT_BASE_URL]

set -e

# Default values
API_URL="${1:-https://supagraph.ai/api/ssh}"
API_KEY="${2:-sk-1234}"
HOST="${3:-localhost}"
USERNAME="${4:-$USER}"
PASSWORD="${5:-}"
PROJECT="${6:-platform/build/soong}"
BRANCH="${7:-master}"
GERRIT_BASE_URL="${8:-https://android-review.googlesource.com}"

echo "=========================================="
echo "Testing Git Clone Endpoint"
echo "=========================================="
echo "API URL: $API_URL"
echo "Host: $HOST"
echo "Username: $USERNAME"
echo "Project: $PROJECT"
echo "Branch: $BRANCH"
echo "Gerrit Base URL: $GERRIT_BASE_URL"
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
  "project": "$PROJECT",
  "gerritBaseUrl": "$GERRIT_BASE_URL",
  "branch": "$BRANCH",
  "workingHome": "$HOME/git-work",
  "targetDir": ""
}
EOF
)

# Ensure API_URL ends with /api/ssh (with or without trailing slash)
API_URL=$(echo "$API_URL" | sed 's|/*$||')
if [[ "$API_URL" != *"/api/ssh" ]]; then
  # If API_URL doesn't end with /api/ssh, append it
  API_URL="${API_URL%/}/api/ssh"
fi

# Test health endpoint first
HEALTH_URL="${API_URL%/}/health"
echo "Testing health endpoint: $HEALTH_URL"
echo "Attempting connection (timeout: 10 seconds, connect timeout: 5 seconds)..."
HEALTH_START_TIME=$(date +%s)

# Use timeout command as a fallback in case curl's --max-time doesn't work
# Add -k flag to skip SSL verification for testing (remove in production)
echo "Note: Using -k flag to skip SSL certificate verification for testing"
if command -v timeout >/dev/null 2>&1; then
  HEALTH_RESPONSE=$(timeout 15 curl -k -s --max-time 10 --connect-timeout 5 -w "\n%{http_code}" "$HEALTH_URL" 2>&1)
  CURL_EXIT_CODE=$?
else
  HEALTH_RESPONSE=$(curl -k -s --max-time 10 --connect-timeout 5 -w "\n%{http_code}" "$HEALTH_URL" 2>&1)
  CURL_EXIT_CODE=$?
fi

HEALTH_END_TIME=$(date +%s)
HEALTH_DURATION=$((HEALTH_END_TIME - HEALTH_START_TIME))
echo "Connection attempt completed in ${HEALTH_DURATION} seconds (curl exit code: $CURL_EXIT_CODE)"

# Extract HTTP code (last line that is exactly 3 digits)
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep -E "^[0-9]{3}$" | tail -n1 || echo "")
# Extract body (everything except the HTTP code line)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/^[0-9]\{3\}$/d' || echo "$HEALTH_RESPONSE")

if [ -z "$HEALTH_HTTP_CODE" ]; then
  echo "⚠️  Health check failed - No HTTP status code received"
  echo "This usually means:"
  echo "  1. Connection timeout or refused"
  echo "  2. SSL/TLS handshake failed"
  echo "  3. Network connectivity issue"
  echo ""
  echo "Full curl output (first 500 chars):"
  echo "$HEALTH_RESPONSE" | head -c 500
  echo ""
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Test direct connection: curl -v https://supagraph.ai/api/ssh/health"
  echo "  2. Check if port 443 is accessible: telnet supagraph.ai 443"
  echo "  3. Verify SSL certificate: openssl s_client -connect supagraph.ai:443"
  echo "  4. Check nginx logs: docker logs ssh-service-nginx or journalctl -u nginx"
  echo ""
  echo "Continuing with git-clone test anyway..."
elif [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed - HTTP $HEALTH_HTTP_CODE"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
  echo "⚠️  Health check failed - HTTP $HEALTH_HTTP_CODE"
  echo "Response: $HEALTH_BODY"
  echo ""
  echo "This might indicate:"
  echo "  1. The SSH service API backend is not running"
  echo "  2. Nginx is not properly configured"
  echo "  3. The API URL is incorrect"
  echo ""
  echo "Continuing with git-clone test anyway..."
fi
echo ""

ENDPOINT_URL="${API_URL%/}/git-clone"
echo "Sending request to $ENDPOINT_URL..."
echo ""

# Make the request with verbose output for debugging
echo "Request details:"
echo "  Method: POST"
echo "  URL: $ENDPOINT_URL"
echo "  Headers: Content-Type: application/json, Authorization: Bearer ${API_KEY:0:10}..."
echo ""

RESPONSE=$(curl -k -s --max-time 300 -w "\n%{http_code}" -X POST "$ENDPOINT_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$REQUEST_BODY" \
  2>&1)

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
    echo "✅ Git clone test PASSED"
    TARGET_DIR=$(echo "$BODY" | jq -r '.output' 2>/dev/null | grep "TARGET_DIR=" | cut -d'=' -f2 || echo "")
    if [ -n "$TARGET_DIR" ]; then
      echo "Target directory: $TARGET_DIR"
    fi
    exit 0
  else
    echo "❌ Git clone test FAILED - success=false"
    ERROR=$(echo "$BODY" | jq -r '.error' 2>/dev/null || echo "Unknown error")
    echo "Error: $ERROR"
    exit 1
  fi
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Git clone test FAILED - HTTP 404 (Not Found)"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify the SSH service API backend is running:"
  echo "     - Check Docker: docker ps | grep ssh-service-api"
  echo "     - Check systemd: systemctl status ssh-service-api"
  echo "     - Check logs: docker logs ssh-service-api or journalctl -u ssh-service-api"
  echo ""
  echo "  2. Verify nginx configuration:"
  echo "     - Check nginx is running: systemctl status nginx"
  echo "     - Test nginx config: nginx -t"
  echo "     - Verify proxy_pass in nginx config points to correct backend"
  echo ""
  echo "  3. Test backend directly (bypass nginx):"
  echo "     curl -X POST http://localhost:7000/git-clone -H 'Content-Type: application/json' -H 'Authorization: Bearer $API_KEY' -d '{...}'"
  echo ""
  echo "  4. Verify the endpoint path:"
  echo "     - Backend expects: POST /git-clone"
  echo "     - Nginx should proxy: /api/ssh/git-clone -> http://backend:7000/git-clone"
  exit 1
else
  echo "❌ Git clone test FAILED - HTTP $HTTP_CODE"
  exit 1
fi

