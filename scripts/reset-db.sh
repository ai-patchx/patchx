#!/bin/bash

# Database Reset Script for Supabase
# This script resets the Supabase database using the Supabase CLI or API
# Usage: ./scripts/reset-db.sh [--confirm] [--project-ref PROJECT_REF] [--db-url DB_URL]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
CONFIRM=false
PROJECT_REF=""
DB_URL=""
SUPABASE_URL=""
SERVICE_ROLE_KEY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --confirm)
      CONFIRM=true
      shift
      ;;
    --project-ref)
      PROJECT_REF="$2"
      shift 2
      ;;
    --db-url)
      DB_URL="$2"
      shift 2
      ;;
    --supabase-url)
      SUPABASE_URL="$2"
      shift 2
      ;;
    --service-role-key)
      SERVICE_ROLE_KEY="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --confirm              Skip confirmation prompt"
      echo "  --project-ref REF      Supabase project reference ID"
      echo "  --db-url URL          Direct database connection URL"
      echo "  --supabase-url URL     Supabase project URL"
      echo "  --service-role-key KEY Supabase service role key (required for API reset)"
      echo "  -h, --help            Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  SUPABASE_PROJECT_REF   Supabase project reference ID"
      echo "  SUPABASE_URL          Supabase project URL"
      echo "  SUPABASE_SERVICE_ROLE_KEY  Supabase service role key"
      echo "  DATABASE_URL          Direct database connection URL"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Use environment variables if not provided via arguments
PROJECT_REF=${PROJECT_REF:-$SUPABASE_PROJECT_REF}
SUPABASE_URL=${SUPABASE_URL:-$VITE_SUPABASE_URL:-$SUPABASE_URL}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}
DB_URL=${DB_URL:-$DATABASE_URL}

# Check if Supabase CLI is installed
if command -v supabase &> /dev/null; then
  USE_CLI=true
else
  USE_CLI=false
  echo -e "${YELLOW}Warning: Supabase CLI not found. Will attempt API-based reset.${NC}"
fi

# Function to reset using Supabase CLI
reset_with_cli() {
  echo -e "${GREEN}Using Supabase CLI to reset database...${NC}"

  if [ -n "$PROJECT_REF" ]; then
    echo "Resetting remote database for project: $PROJECT_REF"
    supabase db reset --project-ref "$PROJECT_REF" --linked
  elif [ -f supabase/config.toml ]; then
    echo "Resetting local database..."
    supabase db reset
  else
    echo -e "${RED}Error: No Supabase project found.${NC}"
    echo "Either provide --project-ref or initialize Supabase locally with 'supabase init'"
    exit 1
  fi
}

# Function to reset using API (requires service role key)
reset_with_api() {
  if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_URL and SERVICE_ROLE_KEY are required for API-based reset.${NC}"
    echo "Provide them via:"
    echo "  - Environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    echo "  - Command line: --supabase-url and --service-role-key"
    exit 1
  fi

  echo -e "${GREEN}Using Supabase API to reset database...${NC}"
  echo "Project URL: $SUPABASE_URL"

  # Extract project reference from URL if not provided
  if [ -z "$PROJECT_REF" ]; then
    PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
  fi

  if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}Error: Could not extract project reference from URL.${NC}"
    exit 1
  fi

  echo "Project Reference: $PROJECT_REF"

  # Use Supabase Management API to reset database
  # Note: This requires the service role key and appropriate permissions
  API_URL="${SUPABASE_URL}/rest/v1/rpc/reset_database"

  echo -e "${YELLOW}Warning: API-based reset may not be available on all Supabase projects.${NC}"
  echo "Consider using Supabase CLI instead: npm install -g supabase"

  # Alternative: Use psql if DATABASE_URL is provided
  if [ -n "$DB_URL" ]; then
    echo "Attempting to reset via direct database connection..."
    if command -v psql &> /dev/null; then
      echo "This would require dropping and recreating the database schema."
      echo -e "${RED}Direct database reset via psql is not implemented for safety.${NC}"
      echo "Please use Supabase CLI or Supabase Dashboard instead."
      exit 1
    else
      echo -e "${RED}Error: psql not found. Cannot reset via direct database connection.${NC}"
      exit 1
    fi
  else
    echo -e "${RED}Error: Cannot reset database without Supabase CLI or direct database access.${NC}"
    echo "Please install Supabase CLI: npm install -g supabase"
    exit 1
  fi
}

# Confirmation prompt
if [ "$CONFIRM" = false ]; then
  echo -e "${RED}WARNING: This will reset your Supabase database!${NC}"
  echo "All data will be lost. This action cannot be undone."
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " response
  if [ "$response" != "yes" ]; then
    echo "Database reset cancelled."
    exit 0
  fi
fi

# Perform reset
if [ "$USE_CLI" = true ]; then
  reset_with_cli
else
  reset_with_api
fi

echo -e "${GREEN}Database reset completed successfully!${NC}"

