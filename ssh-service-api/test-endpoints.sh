#!/bin/bash
# Quick test script for SSH Service API endpoints
# Usage: ./test-endpoints.sh [API_URL] [API_KEY] [HOST] [USERNAME] [PASSWORD]

API_URL="${1:-https://supagraph.ai/api/ssh}"
API_KEY="${2:-sk-1234}"
HOST="${3:-}"
USERNAME="${4:-}"
PASSWORD="${5:-}"

# Test project configuration
PROJECT="${6:-platform/build/soong}"
BRANCH="${7:-main}"
GERRIT_BASE_URL="${8:-https://android-review.googlesource.com}"

echo "=========================================="
echo "Testing SSH Service API Endpoints"
echo "=========================================="
echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:10}..."
echo "Test Project: $PROJECT"
echo "Test Branch: $BRANCH"
echo "Gerrit Base URL: $GERRIT_BASE_URL"
echo "=========================================="
echo ""

# Normalize API URL
API_URL=$(echo "$API_URL" | sed 's|/*$||')
if [[ "$API_URL" != *"/api/ssh" ]]; then
  API_URL="${API_URL%/}/api/ssh"
fi

# Test 1: Health endpoint
echo "Test 1: Health endpoint"
HEALTH_URL="${API_URL%/}/health"
echo "URL: $HEALTH_URL"
HEALTH_RESPONSE=$(curl -k -s --max-time 10 -w "\nHTTP_CODE:%{http_code}" "$HEALTH_URL" 2>&1)
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Code: $HEALTH_HTTP_CODE"
if [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Health check PASSED"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
  echo "❌ Health check FAILED"
  echo "Response: $HEALTH_BODY"
fi
echo ""

# Test 2: Git-clone endpoint (should return 400 or 401, not 404)
echo "Test 2: Git-clone endpoint"
GIT_CLONE_URL="${API_URL%/}/git-clone"
echo "URL: $GIT_CLONE_URL"
echo "Testing with project: $PROJECT, branch: $BRANCH"

# Prepare request body - use real project/branch but test credentials if not provided
if [ -z "$HOST" ] || [ -z "$USERNAME" ]; then
  # Use test credentials for basic endpoint accessibility test
  GIT_CLONE_REQUEST_BODY=$(cat <<EOF
{
  "host": "test",
  "port": 22,
  "username": "test",
  "authType": "password",
  "password": "test",
  "project": "$PROJECT",
  "gerritBaseUrl": "$GERRIT_BASE_URL",
  "branch": "$BRANCH",
  "workingHome": "/tmp/git-work",
  "targetDir": ""
}
EOF
)
  echo "Using test credentials (endpoint accessibility test)"
else
  # Use real credentials if provided
  if [ -z "$PASSWORD" ]; then
    read -sp "Enter SSH password for $USERNAME@$HOST: " PASSWORD
    echo ""
  fi
  GIT_CLONE_REQUEST_BODY=$(cat <<EOF
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
  echo "Using real credentials: $USERNAME@$HOST"
fi

GIT_CLONE_RESPONSE=$(curl -k -s --max-time 300 -X POST "$GIT_CLONE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -H "User-Agent: test-endpoints.sh/1.0" \
  -d "$GIT_CLONE_REQUEST_BODY" \
  -w "\nHTTP_CODE:%{http_code}" 2>&1)

GIT_CLONE_HTTP_CODE=$(echo "$GIT_CLONE_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
GIT_CLONE_BODY=$(echo "$GIT_CLONE_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Code: $GIT_CLONE_HTTP_CODE"
if [ "$GIT_CLONE_HTTP_CODE" = "404" ]; then
  echo "❌ Git-clone endpoint NOT FOUND (404)"
  echo "This indicates the endpoint is not accessible through nginx"
  echo "Response preview:"
  echo "$GIT_CLONE_BODY" | head -20
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check if nginx is running: docker ps | grep nginx"
  echo "  2. Check nginx logs: docker logs ssh-service-nginx | tail -20"
  echo "  3. Verify nginx config: docker exec ssh-service-nginx nginx -t"
  echo "  4. Check backend service: docker ps | grep ssh-service-api"
elif [ "$GIT_CLONE_HTTP_CODE" = "200" ]; then
  echo "✅ Git-clone endpoint SUCCESS (HTTP 200)"
  echo "Response:"
  echo "$GIT_CLONE_BODY" | jq '.' 2>/dev/null || echo "$GIT_CLONE_BODY" | head -50
  # Try to extract TARGET_DIR if present
  TARGET_DIR=$(echo "$GIT_CLONE_BODY" | grep -o "TARGET_DIR=[^ ]*" | cut -d= -f2 || echo "")
  if [ -n "$TARGET_DIR" ]; then
    echo ""
    echo "Target directory: $TARGET_DIR"
  fi
elif [ "$GIT_CLONE_HTTP_CODE" = "400" ] || [ "$GIT_CLONE_HTTP_CODE" = "401" ] || [ "$GIT_CLONE_HTTP_CODE" = "500" ]; then
  echo "✅ Git-clone endpoint FOUND (HTTP $GIT_CLONE_HTTP_CODE)"
  echo "The endpoint is accessible (error is expected with test/invalid credentials)"
  echo "Response:"
  echo "$GIT_CLONE_BODY" | jq '.' 2>/dev/null || echo "$GIT_CLONE_BODY" | head -50
else
  echo "⚠️  Git-clone endpoint returned HTTP $GIT_CLONE_HTTP_CODE"
  echo "Response:"
  echo "$GIT_CLONE_BODY" | head -50
fi
echo ""

# Test 3: Execute endpoint
echo "Test 3: Execute endpoint"
EXECUTE_URL="${API_URL%/}/execute"
echo "URL: $EXECUTE_URL"

# Prepare request body for execute endpoint
# If real SSH credentials are provided, run a safe command on the real host.
if [ -z "$HOST" ] || [ -z "$USERNAME" ]; then
  EXECUTE_REQUEST_BODY='{"host":"test","port":22,"username":"test","authType":"password","password":"test","command":"echo test"}'
  echo "Using test credentials (endpoint accessibility test)"
else
  if [ -z "$PASSWORD" ]; then
    read -sp "Enter SSH password for $USERNAME@$HOST: " PASSWORD
    echo ""
  fi
  EXECUTE_REQUEST_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "echo EXECUTE_OK"
}
EOF
)
  echo "Using real credentials: $USERNAME@$HOST"
fi

EXECUTE_RESPONSE=$(curl -k -s --max-time 30 -X POST "$EXECUTE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -H "User-Agent: test-endpoints.sh/1.0" \
  -d "$EXECUTE_REQUEST_BODY" \
  -w "\nHTTP_CODE:%{http_code}" 2>&1)

EXECUTE_HTTP_CODE=$(echo "$EXECUTE_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
EXECUTE_BODY=$(echo "$EXECUTE_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Code: $EXECUTE_HTTP_CODE"
if [ "$EXECUTE_HTTP_CODE" = "404" ]; then
  echo "❌ Execute endpoint NOT FOUND (404)"
  echo "This indicates the endpoint is not accessible through nginx"
  echo "Response: $EXECUTE_BODY"
elif [ "$EXECUTE_HTTP_CODE" = "200" ]; then
  echo "✅ Execute endpoint SUCCESS (HTTP 200)"
  echo "Response:"
  echo "$EXECUTE_BODY" | jq '.' 2>/dev/null || echo "$EXECUTE_BODY" | head -50
elif [ "$EXECUTE_HTTP_CODE" = "400" ] || [ "$EXECUTE_HTTP_CODE" = "401" ] || [ "$EXECUTE_HTTP_CODE" = "500" ]; then
  echo "✅ Execute endpoint FOUND (HTTP $EXECUTE_HTTP_CODE)"
  echo "The endpoint is accessible (error is expected with test/invalid credentials)"
  echo "Response:"
  echo "$EXECUTE_BODY" | jq '.' 2>/dev/null || echo "$EXECUTE_BODY" | head -50
else
  echo "⚠️  Execute endpoint returned HTTP $EXECUTE_HTTP_CODE"
  echo "Response:"
  echo "$EXECUTE_BODY" | head -50
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Health endpoint: $([ "$HEALTH_HTTP_CODE" = "200" ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "Git-clone endpoint: $([ "$GIT_CLONE_HTTP_CODE" = "404" ] && echo "❌ NOT FOUND" || echo "✅ FOUND (HTTP $GIT_CLONE_HTTP_CODE)")"
echo "Execute endpoint: $([ "$EXECUTE_HTTP_CODE" = "404" ] && echo "❌ NOT FOUND" || echo "✅ FOUND (HTTP $EXECUTE_HTTP_CODE)")"
echo "=========================================="
echo ""

# Additional diagnostics if git-clone returned 404
if [ "$GIT_CLONE_HTTP_CODE" = "404" ]; then
  echo "=========================================="
  echo "404 Error Diagnostics"
  echo "=========================================="
  echo "The git-clone endpoint returned 404. This could mean:"
  echo ""
  echo "1. Nginx routing issue:"
  echo "   - Check nginx config: location /api/ssh/ should proxy to http://ssh-service-api:7000/"
  echo "   - Verify: curl -k https://supagraph.ai/api/ssh/health (should return 200)"
  echo ""
  echo "2. Backend service not running:"
  echo "   - Check: docker ps | grep ssh-service-api"
  echo "   - Check logs: docker logs ssh-service-api | tail -20"
  echo ""
  echo "3. Nginx not running or misconfigured:"
  echo "   - Check: docker ps | grep nginx"
  echo "   - Check logs: docker logs ssh-service-nginx | tail -20"
  echo "   - Test config: docker exec ssh-service-nginx nginx -t"
  echo ""
  echo "4. Path mismatch:"
  echo "   - Request URL: $GIT_CLONE_URL"
  echo "   - Expected: /api/ssh/git-clone -> http://ssh-service-api:7000/git-clone"
  echo "   - Verify nginx location block matches /api/ssh/"
  echo "=========================================="
fi
echo ""

# Additional diagnostics if git-clone returned 404
if [ "$GIT_CLONE_HTTP_CODE" = "404" ]; then
  echo "=========================================="
  echo "404 Error Diagnostics"
  echo "=========================================="
  echo "The git-clone endpoint returned 404. This could mean:"
  echo ""
  echo "1. Nginx routing issue:"
  echo "   - Check nginx config: location /api/ssh/ should proxy to http://ssh-service-api:7000/"
  echo "   - Verify: curl -k https://supagraph.ai/api/ssh/health (should return 200)"
  echo ""
  echo "2. Backend service not running:"
  echo "   - Check: docker ps | grep ssh-service-api"
  echo "   - Check logs: docker logs ssh-service-api | tail -20"
  echo ""
  echo "3. Nginx not running or misconfigured:"
  echo "   - Check: docker ps | grep nginx"
  echo "   - Check logs: docker logs ssh-service-nginx | tail -20"
  echo "   - Test config: docker exec ssh-service-nginx nginx -t"
  echo ""
  echo "4. Path mismatch:"
  echo "   - Request URL: $GIT_CLONE_URL"
  echo "   - Expected: /api/ssh/git-clone -> http://ssh-service-api:7000/git-clone"
  echo "   - Verify nginx location block matches /api/ssh/"
  echo "=========================================="
fi
