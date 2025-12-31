#!/bin/bash
# Test script for full workflow: git clone, patch merge, and status check
# Usage: ./test-full-workflow.sh [API_URL] [API_KEY] [HOST] [USERNAME] [PASSWORD] [PROJECT] [BRANCH] [GERRIT_BASE_URL] [PATCH_FILE]

set -e

# Default values
API_URL="${1:-https://supagraph.ai:8443/api/ssh}"
API_KEY="${2:-sk-1234}"
HOST="${3:-localhost}"
USERNAME="${4:-$USER}"
PASSWORD="${5:-}"
PROJECT="${6:-platform/build/soong}"
BRANCH="${7:-master}"
GERRIT_BASE_URL="${8:-https://android-review.googlesource.com}"
PATCH_FILE="${9:-examples/platform-build-soong.patch}"

echo "=========================================="
echo "Testing Full Workflow"
echo "=========================================="
echo "API URL: $API_URL"
echo "Host: $HOST"
echo "Username: $USERNAME"
echo "Project: $PROJECT"
echo "Branch: $BRANCH"
echo "Gerrit Base URL: $GERRIT_BASE_URL"
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

PATCH_CONTENT=$(cat "$PATCH_FILE")
echo "Patch file loaded: $PATCH_FILE ($(wc -l < "$PATCH_FILE") lines)"
echo ""

# Step 1: Git Clone
echo "=========================================="
echo "Step 1: Git Clone"
echo "=========================================="

CLONE_BODY=$(cat <<EOF
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

CLONE_RESPONSE=$(curl -k -s --max-time 300 -w "\n%{http_code}" -X POST "${API_URL%/}/git-clone" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$CLONE_BODY")

CLONE_HTTP_CODE=$(echo "$CLONE_RESPONSE" | tail -n1)
CLONE_BODY_CONTENT=$(echo "$CLONE_RESPONSE" | sed '$d')

if [ "$CLONE_HTTP_CODE" != "200" ]; then
  echo "❌ Git clone failed - HTTP $CLONE_HTTP_CODE"
  echo "$CLONE_BODY_CONTENT"
  exit 1
fi

CLONE_SUCCESS=$(echo "$CLONE_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
if [ "$CLONE_SUCCESS" != "true" ]; then
  echo "❌ Git clone failed"
  CLONE_ERROR=$(echo "$CLONE_BODY_CONTENT" | jq -r '.error' 2>/dev/null || echo "Unknown error")
  echo "Error: $CLONE_ERROR"
  exit 1
fi

CLONE_OUTPUT=$(echo "$CLONE_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
TARGET_DIR=$(echo "$CLONE_OUTPUT" | grep "TARGET_DIR=" | cut -d'=' -f2 | head -n1 || echo "")

if [ -z "$TARGET_DIR" ]; then
  echo "Warning: Could not extract TARGET_DIR from output"
  echo "Output: $CLONE_OUTPUT"
  # Try to construct target dir from project name
  REPO_NAME=$(basename "$PROJECT")
  SANITIZED_BRANCH=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9_-]/_/g')
  TARGET_DIR="$HOME/git-work/${REPO_NAME}_${SANITIZED_BRANCH}_*"
  echo "Using constructed path: $TARGET_DIR"
else
  echo "✅ Git clone successful"
  echo "Target directory: $TARGET_DIR"
fi

echo "Clone output:"
echo "$CLONE_OUTPUT" | head -20
echo ""

# Step 2: Apply Patch
echo "=========================================="
echo "Step 2: Apply Patch"
echo "=========================================="

# Find the actual directory (handle wildcards)
FIND_DIR_CMD="ls -d $TARGET_DIR 2>/dev/null | head -n1"
FIND_DIR_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$FIND_DIR_CMD",
  "timeout": 10000
}
EOF
)

FIND_DIR_RESPONSE=$(curl -k -s --max-time 10 -w "\n%{http_code}" -X POST "${API_URL%/}/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$FIND_DIR_BODY")

FIND_DIR_HTTP_CODE=$(echo "$FIND_DIR_RESPONSE" | tail -n1)
FIND_DIR_BODY_CONTENT=$(echo "$FIND_DIR_RESPONSE" | sed '$d')

if [ "$FIND_DIR_HTTP_CODE" = "200" ]; then
  FIND_DIR_SUCCESS=$(echo "$FIND_DIR_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
  if [ "$FIND_DIR_SUCCESS" = "true" ]; then
    ACTUAL_DIR=$(echo "$FIND_DIR_BODY_CONTENT" | jq -r '.output' 2>/dev/null | tr -d '\n' || echo "$TARGET_DIR")
    if [ -n "$ACTUAL_DIR" ] && [ "$ACTUAL_DIR" != "null" ]; then
      TARGET_DIR="$ACTUAL_DIR"
      echo "Found actual directory: $TARGET_DIR"
    fi
  fi
fi

# Apply patch
APPLY_CMD="cd $TARGET_DIR && cat > /tmp/test.patch << 'PATCH_EOF'
$PATCH_CONTENT
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

APPLY_RESPONSE=$(curl -k -s --max-time 300 -w "\n%{http_code}" -X POST "${API_URL%/}/execute" \
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
echo "✅ Patch applied successfully!"
if [ -n "$APPLY_OUTPUT" ]; then
  echo "Output: $APPLY_OUTPUT"
fi
echo ""

# Step 3: Check Status
echo "=========================================="
echo "Step 3: Check Git Status"
echo "=========================================="

STATUS_CMD="cd $TARGET_DIR && git status --short"
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

if [ "$STATUS_HTTP_CODE" = "200" ]; then
  STATUS_SUCCESS=$(echo "$STATUS_BODY_CONTENT" | jq -r '.success' 2>/dev/null || echo "false")
  if [ "$STATUS_SUCCESS" = "true" ]; then
    STATUS_OUTPUT=$(echo "$STATUS_BODY_CONTENT" | jq -r '.output' 2>/dev/null || echo "")
    echo "Git status:"
    echo "$STATUS_OUTPUT"
  fi
fi

echo ""
echo "=========================================="
echo "✅ Full workflow test completed successfully!"
echo "=========================================="

