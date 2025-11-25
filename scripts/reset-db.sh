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
      echo "  --service-role-key KEY Supabase anon key (required for API reset)"
      echo "  -h, --help            Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  SUPABASE_PROJECT_REF   Supabase project reference ID"
      echo "  SUPABASE_URL          Supabase project URL"
      echo "  SUPABASE_ANON_KEY      Supabase anon key"
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
SUPABASE_URL=${SUPABASE_URL:-$SUPABASE_URL}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY:-$SUPABASE_ANON_KEY}
DB_URL=${DB_URL:-$DATABASE_URL}

# Check if Supabase CLI is installed
if command -v supabase &> /dev/null; then
  USE_CLI=true
  SUPABASE_CMD="supabase"
elif command -v npx &> /dev/null; then
  USE_CLI=true
  SUPABASE_CMD="npx supabase"
  echo -e "${YELLOW}Note: Using npx to run Supabase CLI (not installed globally).${NC}"
else
  USE_CLI=false
  echo -e "${YELLOW}Warning: Supabase CLI not found. Will attempt alternative reset methods.${NC}"
fi

# Function to reset using Supabase CLI
reset_with_cli() {
  echo -e "${GREEN}Using Supabase CLI to reset database...${NC}"

  # Extract project reference from URL if not provided
  if [ -z "$PROJECT_REF" ] && [ -n "$SUPABASE_URL" ]; then
    PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
    if [ -n "$PROJECT_REF" ]; then
      echo "Extracted project reference from URL: $PROJECT_REF"
    fi
  fi

  if [ -n "$PROJECT_REF" ]; then
    echo "Resetting remote database for project: $PROJECT_REF"

    # Try to use --db-url if DATABASE_URL is available
    if [ -n "$DB_URL" ]; then
      echo "Using direct database connection..."
      $SUPABASE_CMD db reset --db-url "$DB_URL"
    else
      # Check if project is already linked
      if [ -f supabase/.temp/project-ref ]; then
        LINKED_REF=$(cat supabase/.temp/project-ref 2>/dev/null)
        if [ "$LINKED_REF" = "$PROJECT_REF" ]; then
          echo "Project is already linked. Resetting..."
          $SUPABASE_CMD db reset --linked
        else
          echo -e "${YELLOW}Project is linked to a different ref ($LINKED_REF).${NC}"
          echo "Linking to project: $PROJECT_REF"
          $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
            echo -e "${RED}Error: Failed to link project.${NC}"
            echo "You may need to authenticate first: $SUPABASE_CMD login"
            echo "Or provide DATABASE_URL for direct connection."
            exit 1
          }
          $SUPABASE_CMD db reset --linked
        fi
      else
        echo "Linking project first..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
          echo -e "${RED}Error: Failed to link project.${NC}"
          echo ""
          echo "To fix this, you can:"
          echo "1. Authenticate with Supabase: $SUPABASE_CMD login"
          echo "2. Or provide DATABASE_URL in .env.local for direct connection"
          echo "   (Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres)"
          exit 1
        }
        $SUPABASE_CMD db reset --linked
      fi
    fi
  elif [ -f supabase/config.toml ]; then
    echo "Resetting local database..."
    $SUPABASE_CMD db reset
  else
    echo -e "${RED}Error: No Supabase project found.${NC}"
    echo "Either provide --project-ref, set SUPABASE_URL, or initialize Supabase locally with 'supabase init'"
    exit 1
  fi
}

# Function to reset using API (requires service role key)
reset_with_api() {
  if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_URL and SUPABASE_ANON_KEY are required for API-based reset.${NC}"
    echo "Provide them via:"
    echo "  - Environment variables: SUPABASE_URL and SUPABASE_ANON_KEY"
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

  # Alternative: Try using npx if not already tried
  if command -v npx &> /dev/null; then
    echo -e "${YELLOW}Trying to use npx supabase as fallback...${NC}"
    if [ -n "$PROJECT_REF" ]; then
      echo "Resetting remote database for project: $PROJECT_REF"
      npx supabase db reset --project-ref "$PROJECT_REF" --linked
      exit 0
    elif [ -f supabase/config.toml ]; then
      echo "Resetting local database..."
      npx supabase db reset
      exit 0
    fi
  fi

  # Alternative: Use psql if DATABASE_URL is provided
  if [ -n "$DB_URL" ]; then
    echo "Attempting to reset via direct database connection..."
    if command -v psql &> /dev/null; then
      echo -e "${YELLOW}Resetting database using psql...${NC}"
      echo "This will truncate all tables in the public schema."

      # Generate SQL to truncate all tables
      TRUNCATE_SQL=$(psql "$DB_URL" -t -c "
        SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(schemaname)||'.'||quote_ident(tablename), ', ') || ' RESTART IDENTITY CASCADE;'
        FROM pg_tables
        WHERE schemaname = 'public';
      " 2>/dev/null)

      if [ -n "$TRUNCATE_SQL" ] && [ "$TRUNCATE_SQL" != "TRUNCATE TABLE  RESTART IDENTITY CASCADE;" ]; then
        echo "Executing: $TRUNCATE_SQL"
        psql "$DB_URL" -c "$TRUNCATE_SQL"
        echo -e "${GREEN}Database tables truncated successfully.${NC}"
        exit 0
      else
        echo -e "${YELLOW}No tables found to truncate, or error occurred.${NC}"
        exit 1
      fi
    else
      echo -e "${RED}Error: psql not found. Cannot reset via direct database connection.${NC}"
      echo "Install psql with: sudo apt-get install postgresql-client"
      exit 1
    fi
  else
    echo -e "${RED}Error: Cannot reset database without Supabase CLI or direct database access.${NC}"
    echo ""
    echo "Options to fix this:"
    echo "1. Install Supabase CLI:"
    echo "   - Visit: https://github.com/supabase/cli#install-the-cli"
    echo "   - Or use: npx supabase"
    echo ""
    echo "2. Provide DATABASE_URL environment variable for direct database access"
    echo "   (requires psql: sudo apt-get install postgresql-client)"
    echo ""
    echo "3. Use Supabase Dashboard to reset your database manually"
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

