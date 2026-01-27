#!/bin/bash
# Git Clone Template Script
# This script clones a git repository on a remote node
#
# Parameters:
#   TARGET_PROJECT: Project name (e.g., platform/frameworks/base) (required)
#   TARGET_BRANCH: Branch name to clone (required)
#   GERRIT_BASE_URL: Base URL for Gerrit (e.g., https://android-review.googlesource.com) (required)
#   WORKING_HOME: Working directory path on remote node (optional, defaults to ~/git-work)
#   TARGET_DIR: Target directory name within working home (optional, auto-generated if not provided)
#   COMMIT_MSG_HOOK_URL: Optional override for Gerrit commit-msg hook URL
#                        (defaults to https://gerrit-review.googlesource.com/tools/hooks/commit-msg)

set -e  # Exit on error
set -u  # Exit on undefined variable

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print error messages
error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

# Function to print info messages
info() {
    echo -e "${GREEN}INFO: $1${NC}"
}

# Function to print warning messages
warn() {
    echo -e "${YELLOW}WARN: $1${NC}"
}

# Validate required parameters
if [ -z "${TARGET_PROJECT:-}" ]; then
    error "TARGET_PROJECT (project name) is required"
fi

if [ -z "${TARGET_BRANCH:-}" ]; then
    error "TARGET_BRANCH is required"
fi

if [ -z "${GERRIT_BASE_URL:-}" ]; then
    error "GERRIT_BASE_URL is required"
fi

# Construct repository URL from GERRIT_BASE_URL and project name
# Format: https://android-review.googlesource.com/platform/frameworks/base
GERRIT_BASE_URL="${GERRIT_BASE_URL%/}"  # Remove trailing slash if present
REPOSITORY_URL="${GERRIT_BASE_URL}/${TARGET_PROJECT}"

# Set default working home if not provided
WORKING_HOME="${WORKING_HOME:-$HOME/git-work}"

# Create working home directory if it doesn't exist
if [ ! -d "$WORKING_HOME" ]; then
    info "Creating working home directory: $WORKING_HOME"
    mkdir -p "$WORKING_HOME" || error "Failed to create working home directory: $WORKING_HOME"
fi

# Generate target directory name from project name if not provided
if [ -z "${TARGET_DIR:-}" ]; then
    # Extract repository name from project path
    # Handle formats: platform/frameworks/base -> base
    REPO_NAME=$(basename "$TARGET_PROJECT")
    # Sanitize branch name for use in directory name
    SANITIZED_BRANCH=$(echo "$TARGET_BRANCH" | sed 's/[^a-zA-Z0-9_-]/_/g')
    # Generate unique directory name with timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    TARGET_DIR="${REPO_NAME}_${SANITIZED_BRANCH}_${TIMESTAMP}"
fi

# Full path to target directory
FULL_TARGET_DIR="$WORKING_HOME/$TARGET_DIR"

# Check if target directory already exists, then automatically remove and re-clone for consistency
if [ -d "$FULL_TARGET_DIR" ]; then
    warn "Target directory already exists: $FULL_TARGET_DIR"
    info "Removing existing directory for clean clone..."
    rm -rf "$FULL_TARGET_DIR" || error "Failed to remove existing directory: $FULL_TARGET_DIR"
    info "Existing directory removed successfully"
fi

# Clone the repository
info "Cloning repository: $REPOSITORY_URL"
info "Project: $TARGET_PROJECT"
info "Branch: $TARGET_BRANCH"
info "Target directory: $FULL_TARGET_DIR"

cd "$WORKING_HOME" || error "Failed to change to working home directory: $WORKING_HOME"

# Clone with branch specification
if git clone -b "$TARGET_BRANCH" --depth 1 "$REPOSITORY_URL" "$TARGET_DIR"; then
    info "Repository cloned successfully to: $FULL_TARGET_DIR"

    # Verify the clone
    cd "$FULL_TARGET_DIR" || error "Failed to change to cloned directory"

    # Install Gerrit commit-msg hook (best effort)
    HOOK_URL="${COMMIT_MSG_HOOK_URL:-https://gerrit-review.googlesource.com/tools/hooks/commit-msg}"
    if command -v curl >/dev/null 2>&1; then
        info "Installing Gerrit commit-msg hook from: $HOOK_URL"
        HOOK_FILE="$(git rev-parse --git-dir)/hooks/commit-msg"
        mkdir -p "$(dirname "$HOOK_FILE")" || warn "Failed to create hooks directory for commit-msg"
        if curl -fsSL -o "$HOOK_FILE" "$HOOK_URL"; then
            chmod +x "$HOOK_FILE" || warn "Failed to mark commit-msg hook as executable"
            info "Gerrit commit-msg hook installed at: $HOOK_FILE"
        else
            warn "Failed to download commit-msg hook from: $HOOK_URL"
        fi
    else
        warn "curl not found; skipping Gerrit commit-msg hook installation"
    fi

    # Check current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    info "Current branch: $CURRENT_BRANCH"

    # Show repository status
    info "Repository status:"
    git status --short || true

    # Output the target directory path for use by calling script
    echo "TARGET_DIR=$FULL_TARGET_DIR"
    exit 0
    else
        error "Failed to clone repository: $REPOSITORY_URL"
    fi

