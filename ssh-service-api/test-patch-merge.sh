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

# Expand ~ to $HOME in REPO_PATH if needed
REPO_PATH="${REPO_PATH/#\~/$HOME}"

# Remove trailing slashes
REPO_PATH="${REPO_PATH%/}"

# If REPO_PATH contains wildcards, try to expand it
if [[ "$REPO_PATH" == *"*"* ]]; then
  echo "Expanding repository path pattern: $REPO_PATH"
  # Try to find matching directories on remote server
  FIND_CMD="find \$(dirname \"$REPO_PATH\") -maxdepth 1 -type d -name \"$(basename "$REPO_PATH")\" 2>/dev/null | head -1"
  FIND_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$FIND_CMD",
  "timeout": 30000
}
EOF
)

  FIND_RESPONSE=$(curl -k -s --max-time 30 -X POST "${API_URL%/}/execute" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$FIND_BODY")

  FOUND_PATH=$(echo "$FIND_RESPONSE" | jq -r '.output' 2>/dev/null | head -1 | tr -d '\n' | xargs)

  if [ -n "$FOUND_PATH" ] && [ "$FOUND_PATH" != "null" ] && [ "$FOUND_PATH" != "" ]; then
    REPO_PATH="$FOUND_PATH"
    echo "Found repository at: $REPO_PATH"
  else
    echo "Warning: Could not find repository matching pattern: $REPO_PATH"
    echo "Will attempt to use pattern as-is or check if directory exists"
  fi
fi

# Verify repository path exists on remote server
echo "Verifying repository path exists on remote server..."
VERIFY_CMD="test -d \"$REPO_PATH\" && echo \"EXISTS\" || echo \"NOT_FOUND\""
VERIFY_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$VERIFY_CMD",
  "timeout": 30000
}
EOF
)

VERIFY_RESPONSE=$(curl -k -s --max-time 30 -X POST "${API_URL%/}/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$VERIFY_BODY")

VERIFY_OUTPUT=$(echo "$VERIFY_RESPONSE" | jq -r '.output' 2>/dev/null | tr -d '\n')

if [ "$VERIFY_OUTPUT" != "EXISTS" ]; then
  echo "⚠️  Repository directory does not exist: $REPO_PATH"
  echo "Searching for available repositories in working home directory..."

  # Try to find git repositories in the working home directory
  WORKING_HOME=$(dirname "$REPO_PATH")
  if [ "$WORKING_HOME" = "." ] || [ "$WORKING_HOME" = "$REPO_PATH" ] || [ -z "$WORKING_HOME" ]; then
    WORKING_HOME="$HOME/git-work"
  fi

  # Remove trailing slash from WORKING_HOME
  WORKING_HOME="${WORKING_HOME%/}"

  # Search for git repositories - find directories containing .git
  SEARCH_CMD="find \"$WORKING_HOME\" -maxdepth 2 -type d -name '.git' 2>/dev/null | sed 's|/.git$||' | sort -r | head -5"
  SEARCH_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$SEARCH_CMD",
  "timeout": 30000
}
EOF
)

  SEARCH_RESPONSE=$(curl -k -s --max-time 30 -X POST "${API_URL%/}/execute" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$SEARCH_BODY")

  SEARCH_SUCCESS=$(echo "$SEARCH_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")
  AVAILABLE_REPOS=$(echo "$SEARCH_RESPONSE" | jq -r '.output' 2>/dev/null | grep -v '^$' | grep -v 'null' | head -5)

  if [ "$SEARCH_SUCCESS" = "true" ] && [ -n "$AVAILABLE_REPOS" ] && [ "$AVAILABLE_REPOS" != "null" ] && [ "$AVAILABLE_REPOS" != "" ]; then
    echo ""
    echo "Found the following git repositories:"
    echo "$AVAILABLE_REPOS" | while read -r repo; do
      if [ -n "$repo" ] && [ "$repo" != "null" ]; then
        echo "  - $repo"
      fi
    done
    echo ""

    # Try to use the first (most recent) repository
    LATEST_REPO=$(echo "$AVAILABLE_REPOS" | head -1 | xargs)
    if [ -n "$LATEST_REPO" ] && [ "$LATEST_REPO" != "null" ] && [ "$LATEST_REPO" != "" ]; then
      echo "Using most recent repository: $LATEST_REPO"
      REPO_PATH="$LATEST_REPO"

      # Verify the found repository exists
      VERIFY_CMD="test -d \"$REPO_PATH\" && echo \"EXISTS\" || echo \"NOT_FOUND\""
      VERIFY_BODY=$(cat <<EOF
{
  "host": "$HOST",
  "port": 22,
  "username": "$USERNAME",
  "authType": "password",
  "password": "$PASSWORD",
  "command": "$VERIFY_CMD",
  "timeout": 30000
}
EOF
)

      VERIFY_RESPONSE=$(curl -k -s --max-time 30 -X POST "${API_URL%/}/execute" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "$VERIFY_BODY")

      VERIFY_OUTPUT=$(echo "$VERIFY_RESPONSE" | jq -r '.output' 2>/dev/null | tr -d '\n')
    fi
  else
    # If search failed, show debug info
    echo ""
    echo "Search response:"
    echo "$SEARCH_RESPONSE" | jq '.' 2>/dev/null || echo "$SEARCH_RESPONSE"
    echo ""
    echo "❌ Error: No git repositories found in $WORKING_HOME"
    echo ""
    echo "Please ensure:"
    echo "  1. The repository has been cloned to the remote server"
    echo "  2. The path is correct (use absolute path or pattern with wildcards)"
    echo "  3. The directory is accessible by user $USERNAME"
    echo ""
    echo "You can clone a repository first using:"
    echo "  ./test-git-clone.sh $API_URL $API_KEY $HOST $USERNAME [PASSWORD]"
    exit 1
  fi
fi

if [ "$VERIFY_OUTPUT" = "EXISTS" ]; then
  echo "✅ Repository path verified: $REPO_PATH"
  echo ""
else
  echo "❌ Error: Repository directory does not exist on remote server: $REPO_PATH"
  exit 1
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

