#!/bin/bash
# Test script for patch merge workflow
# Usage: ./test-patch-merge.sh [API_URL] [API_KEY] [HOST] [USERNAME] [PASSWORD] [REPO_PATH] [PATCH_FILE]

set -e

# Default values
API_URL="${1:-https://supagraph.ai:8443/api/ssh}"
API_KEY="${2:-sk-1234}"
HOST="${3:-localhost}"
USERNAME="${4:-$USER}"
PASSWORD="${5:-}"
REPO_PATH="${6:-$HOME/git-work/platform-build-soong_master_*}"
PATCH_FILE="${7:-examples/platform-build-soong.patch}"

echo "=========================================="
echo "Testing Patch Merge Workflow"
echo "=========================================="
echo "API URL: $API_URL"
echo "Host: $HOST"
echo "Username: $USERNAME"
echo "Repository Path: $REPO_PATH"
echo "Patch File: $PATCH_FILE"
echo "=========================================="
echo ""

# Prompt for password if not provided
if [ -z "$PASSWORD" ]; then
  read -sp "Enter SSH password: " PASSWORD
  echo ""
fi

# Ensure API_URL ends with /api/ssh (with or without trailing slash)
API_URL=$(echo "$API_URL" | sed 's|/*$||')
if [[ "$API_URL" != *"/api/ssh" ]]; then
  # If API_URL doesn't end with /api/ssh, append it
  API_URL="${API_URL%/}/api/ssh"
fi

# Read patch file content
if [ ! -f "$PATCH_FILE" ]; then
  echo "Error: Patch file not found: $PATCH_FILE"
  exit 1
fi

PATCH_CONTENT=$(cat "$PATCH_FILE" | jq -Rs .)
echo "Patch file loaded: $PATCH_FILE ($(wc -l < "$PATCH_FILE") lines)"
echo ""

# Step 1: Check git status
echo "Step 1: Checking git status..."
STATUS_CMD="cd $REPO_PATH && git status --porcelain"
STATUS_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$STATUS_CMD",
  "timeout": 60000
}
EOF
)

STATUS_RESPONSE=$(curl -k -s --max-time 60 -w "\n%{http_code}" -X POST "${API_URL%/}/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$STATUS_BODY")

STATUS_HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
STATUS_BODY_CONTENT=$(echo "$STATUS_RESPONSE" | sed '$d')

if [ "$STATUS_HTTP_CODE" != "200" ]; then
  echo "❌ Git status check failed - HTTP $STATUS_HTTP_CODE"
  echo "$STATUS_BODY_CONTENT"
  exit 1
fi

STATUS_SUCCESS=$(echo "$STATUS_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
if [ "$STATUS_SUCCESS" != "true" ]; then
  echo "❌ Git status check failed"
  echo "$STATUS_BODY_CONTENT" | jq '.' 2>/dev/null || echo "$STATUS_BODY_CONTENT"
  exit 1
fi

STATUS_OUTPUT=$(echo "$STATUS_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
echo "Git status:"
echo "$STATUS_OUTPUT"
echo ""

# Step 2: Apply patch
echo "Step 2: Applying patch..."
# Create a temporary patch file on the remote server and apply it
APPLY_CMD="cd $REPO_PATH && cat > /tmp/test.patch << 'PATCH_EOF'
$(cat "$PATCH_FILE")
PATCH_EOF
git apply --check /tmp/test.patch && git apply /tmp/test.patch && rm -f /tmp/test.patch"

APPLY_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$APPLY_CMD",
  "timeout": 300000
}
EOF
)

APPLY_RESPONSE=$(curl -s --max-time 300 -w "\n%{http_code}" -X POST "${API_URL%/}/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$APPLY_BODY")

APPLY_HTTP_CODE=$(echo "$APPLY_RESPONSE" | tail -n1)
APPLY_BODY_CONTENT=$(echo "$APPLY_RESPONSE" | sed '$d')

if [ "$APPLY_HTTP_CODE" != "200" ]; then
  echo "❌ Patch apply failed - HTTP $APPLY_HTTP_CODE"
  echo "$APPLY_BODY_CONTENT"
  exit 1
fi

APPLY_SUCCESS=$(echo "$APPLY_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
if [ "$APPLY_SUCCESS" != "true" ]; then
  echo "❌ Patch apply failed"
  APPLY_ERROR=$(echo "$APPLY_BODY_CONTENT" | jq -r '.error' 2>/dev/null || echo "Unknown error")
  echo "Error: $APPLY_ERROR"
  APPLY_OUTPUT=$(echo "$APPLY_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
  if [ -n "$APPLY_OUTPUT" ]; then
    echo "Output: $APPLY_OUTPUT"
  fi
  exit 1
fi

APPLY_OUTPUT=$(echo "$APPLY_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
echo "Patch applied successfully!"
if [ -n "$APPLY_OUTPUT" ]; then
  echo "Output: $APPLY_OUTPUT"
fi
echo ""

# Step 3: Check git status after patch
echo "Step 3: Checking git status after patch..."
FINAL_STATUS_CMD="cd $REPO_PATH && git status --short"
FINAL_STATUS_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$FINAL_STATUS_CMD",
  "timeout": 60000
}
EOF
)

FINAL_STATUS_RESPONSE=$(curl -k -s --max-time 60 -w "\n%{http_code}" -X POST "${API_URL%/}/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$FINAL_STATUS_BODY")

FINAL_STATUS_HTTP_CODE=$(echo "$FINAL_STATUS_RESPONSE" | tail -n1)
FINAL_STATUS_BODY_CONTENT=$(echo "$FINAL_STATUS_RESPONSE" | sed '$d')

if [ "$FINAL_STATUS_HTTP_CODE" = "200" ]; then
  FINAL_STATUS_SUCCESS=$(echo "$FINAL_STATUS_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
  if [ "$FINAL_STATUS_SUCCESS" = "true" ]; then
    FINAL_STATUS_OUTPUT=$(echo "$FINAL_STATUS_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
    echo "Git status after patch:"
    echo "$FINAL_STATUS_OUTPUT"
  fi
fi

echo ""
echo "✅ Patch merge workflow test completed successfully!"

