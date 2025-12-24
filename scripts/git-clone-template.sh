#!/bin/bash
# Git Clone Template Script
# This script clones a git repository on a remote node
#
# Parameters:
#   TARGET_PROJECT: Git repository URL (required)
#   TARGET_BRANCH: Branch name to clone (required)
#   WORKING_HOME: Working directory path on remote node (optional, defaults to ~/git-work)
#   TARGET_DIR: Target directory name within working home (optional, auto-generated if not provided)

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
    error "TARGET_PROJECT (repository URL) is required"
fi

if [ -z "${TARGET_BRANCH:-}" ]; then
    error "TARGET_BRANCH is required"
fi

# Set default working home if not provided
WORKING_HOME="${WORKING_HOME:-$HOME/git-work}"

# Create working home directory if it doesn't exist
if [ ! -d "$WORKING_HOME" ]; then
    info "Creating working home directory: $WORKING_HOME"
    mkdir -p "$WORKING_HOME" || error "Failed to create working home directory: $WORKING_HOME"
fi

# Generate target directory name from repository URL if not provided
if [ -z "${TARGET_DIR:-}" ]; then
    # Extract repository name from URL
    # Handle formats: https://github.com/user/repo.git, git@github.com:user/repo.git, user/repo
    REPO_NAME=$(basename "$TARGET_PROJECT" .git)
    # Remove any path prefixes
    REPO_NAME=$(basename "$REPO_NAME")
    # Generate unique directory name with timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    TARGET_DIR="${REPO_NAME}_${TARGET_BRANCH}_${TIMESTAMP}"
fi

# Full path to target directory
FULL_TARGET_DIR="$WORKING_HOME/$TARGET_DIR"

# Check if target directory already exists
if [ -d "$FULL_TARGET_DIR" ]; then
    warn "Target directory already exists: $FULL_TARGET_DIR"
    read -t 5 -p "Remove existing directory? (y/N): " -n 1 -r || REPLY="n"
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Removing existing directory: $FULL_TARGET_DIR"
        rm -rf "$FULL_TARGET_DIR" || error "Failed to remove existing directory"
    else
        # Try to update existing repository instead
        info "Updating existing repository in: $FULL_TARGET_DIR"
        cd "$FULL_TARGET_DIR" || error "Failed to change to directory: $FULL_TARGET_DIR"

        # Check if it's a git repository
        if [ -d .git ]; then
            info "Fetching latest changes..."
            git fetch origin || warn "Failed to fetch from origin"

            info "Checking out branch: $TARGET_BRANCH"
            git checkout "$TARGET_BRANCH" || warn "Failed to checkout branch: $TARGET_BRANCH"

            info "Pulling latest changes..."
            git pull origin "$TARGET_BRANCH" || warn "Failed to pull latest changes"

            info "Repository updated successfully in: $FULL_TARGET_DIR"
            echo "TARGET_DIR=$FULL_TARGET_DIR"
            exit 0
        else
            error "Directory exists but is not a git repository: $FULL_TARGET_DIR"
        fi
    fi
fi

# Clone the repository
info "Cloning repository: $TARGET_PROJECT"
info "Branch: $TARGET_BRANCH"
info "Target directory: $FULL_TARGET_DIR"

cd "$WORKING_HOME" || error "Failed to change to working home directory: $WORKING_HOME"

# Clone with branch specification
if git clone -b "$TARGET_BRANCH" "$TARGET_PROJECT" "$TARGET_DIR"; then
    info "Repository cloned successfully to: $FULL_TARGET_DIR"

    # Verify the clone
    cd "$FULL_TARGET_DIR" || error "Failed to change to cloned directory"

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
    error "Failed to clone repository: $TARGET_PROJECT"
fi

