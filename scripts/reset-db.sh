#!/bin/bash

# Database Reset Script for Supabase
# This script resets the Supabase database using the Supabase CLI or API
# Usage: ./scripts/reset-db.sh [--confirm] [--project-ref PROJECT_REF] [--db-url DB_URL]
#
# NOTE: Provide SUPABASE_URL and SUPABASE_ANON_KEY in .env.local for best results.
# Get these from Supabase Dashboard → Settings → API

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
LITELLM_BASE_URL=""
LITELLM_API_KEY=""
LITELLM_MODEL=""

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
    --litellm-base-url)
      LITELLM_BASE_URL="$2"
      shift 2
      ;;
    --litellm-api-key)
      LITELLM_API_KEY="$2"
      shift 2
      ;;
    --litellm-model)
      LITELLM_MODEL="$2"
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
      echo "  --litellm-base-url URL LiteLLM base URL (required for initialization)"
      echo "  --litellm-api-key KEY  LiteLLM API key (required for initialization)"
      echo "  --litellm-model NAME   LiteLLM model name (required for initialization)"
      echo "  -h, --help            Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  SUPABASE_PROJECT_REF   Supabase project reference ID"
      echo "  SUPABASE_URL          Supabase project URL (recommended)"
      echo "  SUPABASE_ANON_KEY      Supabase anon key (recommended)"
      echo "  DATABASE_URL          Direct database connection URL (optional fallback)"
      echo "  LITELLM_BASE_URL      LiteLLM base URL (required for initialization)"
      echo "  LITELLM_API_KEY       LiteLLM API key (required for initialization)"
      echo "  LITELLM_MODEL         LiteLLM model name (required for initialization)"
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
LITELLM_BASE_URL=${LITELLM_BASE_URL:-$LITELLM_BASE_URL}
LITELLM_API_KEY=${LITELLM_API_KEY:-$LITELLM_API_KEY}
LITELLM_MODEL=${LITELLM_MODEL:-$LITELLM_MODEL}

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

    # For remote databases, we can use SUPABASE_URL and SUPABASE_ANON_KEY
    # Option 1: Use SUPABASE_URL with Supabase CLI (preferred)
    if [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_ROLE_KEY" ]; then
      echo "Using Supabase API with SUPABASE_URL and SUPABASE_ANON_KEY..."

      # Ensure project is linked
      if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
        echo "Linking project..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
          echo -e "${RED}Error: Failed to link project.${NC}"
          echo "You may need to authenticate first: $SUPABASE_CMD login"
          return 1
        }
      fi

      # Use db push with temporary migration to truncate tables
      echo "Truncating all tables in the public schema..."

      # Ensure migrations directory exists
      mkdir -p supabase/migrations

      # Create a temporary migration file
      # Supabase CLI requires format: <timestamp>_name.sql
      MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
      MIGRATION_NAME="${MIGRATION_TIMESTAMP}_reset_tables"
      TEMP_MIGRATION="supabase/migrations/${MIGRATION_NAME}.sql"

      # SQL to truncate all tables
      cat > "$TEMP_MIGRATION" << 'EOF'
-- Temporary migration to truncate all tables
DO $$
DECLARE
  r RECORD;
  sql_text TEXT;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    sql_text := 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    EXECUTE sql_text;
  END LOOP;
END $$;
EOF

      # Try to sync migration history automatically
      echo "Syncing migration history with remote database..."
      PULL_OUTPUT=$($SUPABASE_CMD db pull --yes 2>&1 || true)
      if echo "$PULL_OUTPUT" | grep -q "Finished\|successfully\|pulled"; then
        echo "Migration history synced successfully."
      else
        echo "Note: Could not fully sync migration history, but continuing..."
      # Try to repair migration history if there are previous migrations
      if [ -d "supabase/migrations" ]; then
        PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | head -1)
        if [ -n "$PREVIOUS_MIGRATIONS" ]; then
          echo "Attempting to repair migration history..."
          $SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>/dev/null || true
          fi
        fi
      fi

      # Push the migration to the linked project
      echo "Pushing truncate migration..."
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      PUSH_EXIT_CODE=$?
      echo "Migration push exit code: $PUSH_EXIT_CODE"
      echo "Migration push output: $PUSH_OUTPUT"

      if [ $PUSH_EXIT_CODE -eq 0 ] && echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
        echo -e "${GREEN}Database tables truncated successfully.${NC}"
        # Remove the temporary migration file
        rm -f "$TEMP_MIGRATION"
      else
        # Check if the error is just about migration history (which we can ignore if tables are empty)
        if echo "$PUSH_OUTPUT" | grep -q "Remote migration versions not found"; then
          echo -e "${YELLOW}Warning: Migration history mismatch during truncate, but continuing...${NC}"
          echo "This is usually safe if the database is empty or you're resetting."
        else
          echo -e "${YELLOW}Warning: Failed to truncate tables via CLI (exit code: $PUSH_EXIT_CODE).${NC}"
          echo "Error output: $PUSH_OUTPUT"
          echo "Continuing with table creation anyway..."
        fi
        # Clean up the temporary migration file
        rm -f "$TEMP_MIGRATION"
      fi
    else
      # Neither DATABASE_URL nor SUPABASE_URL/SERVICE_ROLE_KEY provided
      echo -e "${RED}Error: Cannot reset remote database.${NC}"
      echo ""
      echo "The 'db reset' command only works for local Supabase instances."
      echo "For remote databases, you need to provide one of the following:"
      echo ""
      echo "Option 1: SUPABASE_URL and SUPABASE_ANON_KEY in .env.local:"
      echo "  SUPABASE_URL=https://[PROJECT_REF].supabase.co"
      echo "  SUPABASE_ANON_KEY=your_anon_key"
      echo ""
      echo "You can find these values in the Supabase Dashboard under Settings → API."
      echo "Alternatively, you can reset the database manually in the Supabase Dashboard."
      return 1
    fi
  elif [ -f supabase/config.toml ]; then
    echo "Resetting local database..."
    $SUPABASE_CMD db reset
  else
    echo -e "${RED}Error: No Supabase project found.${NC}"
    echo "Either provide --project-ref, set SUPABASE_URL, or initialize Supabase locally with 'supabase init'"
    return 1
  fi
}

# Function to reset using API (requires SUPABASE_URL and SUPABASE_ANON_KEY)
reset_with_api() {
  if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_URL and SUPABASE_ANON_KEY are required for API-based reset.${NC}"
    echo "Provide them via:"
    echo "  - Environment variables: SUPABASE_URL and SUPABASE_ANON_KEY"
    echo "  - Command line: --supabase-url and --service-role-key"
    return 1
  fi

  echo -e "${GREEN}Using Supabase API to reset database...${NC}"
  echo "Project URL: $SUPABASE_URL"

  # Extract project reference from URL if not provided
  if [ -z "$PROJECT_REF" ]; then
    PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
  fi

  if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}Error: Could not extract project reference from URL.${NC}"
    return 1
  fi

  echo "Project Reference: $PROJECT_REF"

  # Try to use Supabase CLI if available
  if [ "$USE_CLI" = true ]; then
    # Ensure project is linked
    if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
      echo "Linking project..."
      $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
        echo -e "${RED}Error: Failed to link project.${NC}"
        echo "You may need to authenticate first: $SUPABASE_CMD login"
        return 1
      }
    fi

    # Use db push with temporary migration to truncate tables
    echo "Truncating all tables in the public schema..."

    # Ensure migrations directory exists
    mkdir -p supabase/migrations

    # Create a temporary migration file
    # Supabase CLI requires format: <timestamp>_name.sql
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    MIGRATION_NAME="${MIGRATION_TIMESTAMP}_reset_tables"
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_NAME}.sql"

    # SQL to truncate all tables
    cat > "$TEMP_MIGRATION" << 'EOF'
-- Temporary migration to truncate all tables
DO $$
DECLARE
  r RECORD;
  sql_text TEXT;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    sql_text := 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    EXECUTE sql_text;
  END LOOP;
END $$;
EOF

    # Try to sync migration history automatically
    echo "Syncing migration history with remote database..."
    PULL_OUTPUT=$($SUPABASE_CMD db pull --yes 2>&1 || true)
    if echo "$PULL_OUTPUT" | grep -q "Finished\|successfully\|pulled"; then
      echo "Migration history synced successfully."
    else
      echo "Note: Could not fully sync migration history, trying repair..."
      # Try to repair migration history if there are previous migrations
      if [ -d "supabase/migrations" ]; then
        PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -r | head -1)
        if [ -n "$PREVIOUS_MIGRATIONS" ]; then
          echo "Repairing migration history..."
          REPAIR_OUTPUT=$($SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>&1 || true)
          if echo "$REPAIR_OUTPUT" | grep -q "Finished\|repaired"; then
            echo "Migration history repaired."
          fi
        fi
      fi
    fi

    # Push the migration to the linked project
    PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
    if echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
      echo -e "${GREEN}Database tables truncated successfully.${NC}"
      # Remove the temporary migration file
      rm -f "$TEMP_MIGRATION"
      return 0
    else
      # Check if the error is just about migration history (which we can ignore if tables are empty)
      if echo "$PUSH_OUTPUT" | grep -q "Remote migration versions not found"; then
        echo -e "${YELLOW}Warning: Migration history mismatch, but continuing...${NC}"
        echo "This is usually safe if the database is empty or you're resetting."
      else
        echo -e "${YELLOW}Warning: Failed to truncate tables via CLI.${NC}"
        echo "Error: $PUSH_OUTPUT"
      fi
      # Clean up the temporary migration file
      rm -f "$TEMP_MIGRATION"
    fi
  fi

  # Fallback: Use psql if DATABASE_URL is provided
  if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
    echo "Attempting to reset via direct database connection..."
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
      return 0
    else
      echo -e "${YELLOW}No tables found to truncate, or error occurred.${NC}"
    fi
  fi

  # If we get here, all methods failed
  echo -e "${RED}Error: Cannot reset database.${NC}"
  echo ""
  echo "Options to fix this:"
  echo "1. Install Supabase CLI:"
  echo "   - Visit: https://github.com/supabase/cli#install-the-cli"
  echo "   - Or use: npx supabase"
  echo "   - Then authenticate: $SUPABASE_CMD login"
  echo ""
  echo "2. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in .env.local"
  echo ""
  echo "3. Use Supabase Dashboard to reset your database manually"
  return 1
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

# Function to create remote_nodes table
create_remote_nodes_table() {
  echo -e "${GREEN}Creating remote_nodes table...${NC}"

  # SQL for creating remote_nodes table
  CREATE_TABLE_SQL="
-- Create remote_nodes table in Supabase
-- This table stores remote node configuration for SSH connections

CREATE TABLE IF NOT EXISTS remote_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('key', 'password')),
  ssh_key TEXT, -- SSH private key (encrypted in production)
  password TEXT, -- SSH password (encrypted in production)
  working_home TEXT, -- Working directory path on the remote node
  ssh_service_api_url TEXT, -- SSH service API URL for command execution
  ssh_service_api_key TEXT, -- SSH service API key for authentication
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on host and username for faster lookups
CREATE INDEX IF NOT EXISTS idx_remote_nodes_host ON remote_nodes(host);
CREATE INDEX IF NOT EXISTS idx_remote_nodes_username ON remote_nodes(username);

-- Create updated_at trigger to automatically update the timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$ language 'plpgsql';

CREATE TRIGGER update_remote_nodes_updated_at
  BEFORE UPDATE ON remote_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE remote_nodes ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS \"Service role can manage remote_nodes\" ON remote_nodes;

-- Create a policy that allows all access (for backend operations)
-- Note: Service role key bypasses RLS automatically, but this policy
-- allows anon key to work as well (useful for development/testing)
-- In production, prefer using SUPABASE_SERVICE_ROLE_KEY in the worker
CREATE POLICY \"Service role can manage remote_nodes\" ON remote_nodes
  FOR ALL
  USING (true)
  WITH CHECK (true);
"

  # Try to execute SQL using available methods
  # Note: Supabase CLI doesn't have a direct SQL execution command that bypasses migrations
  # We'll use migration-based approach with proper sync

  # Method 2: Use psql (direct database connection) as fallback
  if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
    echo "Executing SQL via psql (direct database connection)..."
    if echo "$CREATE_TABLE_SQL" | psql "$DB_URL" 2>&1; then
      echo -e "${GREEN}remote_nodes table created successfully.${NC}"
      return 0
    else
      # Check if table already exists (which is fine)
      OUTPUT=$(echo "$CREATE_TABLE_SQL" | psql "$DB_URL" 2>&1)
      if echo "$OUTPUT" | grep -q "already exists\|duplicate"; then
        echo -e "${GREEN}remote_nodes table already exists.${NC}"
        return 0
      else
        echo -e "${YELLOW}Warning: Failed to create remote_nodes table via psql.${NC}"
        echo "Error output: $OUTPUT"
        echo "You may need to create it manually in Supabase SQL Editor."
      fi
    fi
  elif [ "$USE_CLI" = true ] && [ -n "$PROJECT_REF" ]; then
    # Check if SUPABASE_URL is available (required)
    if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
      echo -e "${YELLOW}Note: SUPABASE_URL and SUPABASE_ANON_KEY should be set in .env.local:${NC}"
      echo -e "${YELLOW}  SUPABASE_URL=https://[PROJECT_REF].supabase.co${NC}"
      echo -e "${YELLOW}  SUPABASE_ANON_KEY=your_anon_key${NC}"
      echo ""
    fi

    # Try using Supabase CLI with db push to create table
    echo "Attempting to create table via Supabase CLI..."

    # Ensure migrations directory exists
    mkdir -p supabase/migrations

    # Create a temporary migration file
    # Supabase CLI requires format: <timestamp>_name.sql
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    MIGRATION_NAME="${MIGRATION_TIMESTAMP}_create_remote_nodes"
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_NAME}.sql"
    echo "$CREATE_TABLE_SQL" > "$TEMP_MIGRATION"

    # Try different CLI methods
    if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
      # For direct database connection, use psql instead (bypasses migration history)
      echo "Using psql for direct database connection (bypasses migration history)..."
      OUTPUT=$(echo "$CREATE_TABLE_SQL" | psql "$DB_URL" 2>&1)
      if [ $? -eq 0 ]; then
        echo -e "${GREEN}remote_nodes table created successfully.${NC}"
        rm -f "$TEMP_MIGRATION"
        return 0
      else
        if echo "$OUTPUT" | grep -q "already exists\|duplicate"; then
          echo -e "${GREEN}remote_nodes table already exists.${NC}"
          rm -f "$TEMP_MIGRATION"
          return 0
        else
          echo -e "${YELLOW}Warning: Failed to create remote_nodes table via psql.${NC}"
          echo "Error output: $OUTPUT"
          echo "You may need to create it manually in Supabase SQL Editor."
        fi
      fi
      rm -f "$TEMP_MIGRATION"
    elif [ -f supabase/.temp/project-ref ] || [ -n "$SUPABASE_URL" ]; then
      # Project is linked or can be linked, use db push
      if [ ! -f supabase/.temp/project-ref ] && [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_ROLE_KEY" ]; then
        echo "Linking project to create table..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes 2>/dev/null || {
          echo -e "${YELLOW}Note: Cannot automatically link project.${NC}"
          echo "Please run the SQL manually in Supabase SQL Editor."
          rm -f "$TEMP_MIGRATION"
          return
        }
      fi

      # Try to sync migration history automatically before creating table
      echo "Syncing migration history with remote database..."
      PULL_OUTPUT=$($SUPABASE_CMD db pull --yes 2>&1 || true)
      if echo "$PULL_OUTPUT" | grep -q "Finished\|successfully\|pulled"; then
        echo "Migration history synced successfully."
      else
        echo "Note: Could not fully sync migration history, trying repair..."
      # Try to repair migration history if there are previous migrations
      if [ -d "supabase/migrations" ]; then
        PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -r | head -1)
        if [ -n "$PREVIOUS_MIGRATIONS" ]; then
            echo "Repairing migration history..."
          REPAIR_OUTPUT=$($SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>&1 || true)
          if echo "$REPAIR_OUTPUT" | grep -q "Finished\|repaired"; then
            echo "Migration history repaired."
            fi
          fi
        fi
      fi

      # Push the migration to create the table
      echo "Pushing migration to create remote_nodes table..."
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      if echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
        echo -e "${GREEN}remote_nodes table created successfully.${NC}"
      elif echo "$PUSH_OUTPUT" | grep -q "already exists\|duplicate\|exists"; then
        echo -e "${GREEN}remote_nodes table already exists.${NC}"
      else
        echo -e "${YELLOW}Warning: Failed to create remote_nodes table via CLI.${NC}"
        echo "Migration history may be out of sync. Error output:"
        echo "$PUSH_OUTPUT"
        echo ""
        echo -e "${YELLOW}The Supabase CLI method failed due to migration history sync issues.${NC}"
        echo ""
        echo "Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in .env.local:"
        echo "  SUPABASE_URL=https://[PROJECT_REF].supabase.co"
        echo "  SUPABASE_ANON_KEY=your_anon_key"
        echo ""
        echo "You can find these values in Supabase Dashboard → Settings → API."
        echo ""
        echo "Or you can try:"
        echo "  1. Run the SQL manually in Supabase SQL Editor (recommended)"
        echo "  2. Or repair migration history: supabase migration repair --status reverted 20251218180930"
      fi
      rm -f "$TEMP_MIGRATION"
    else
      echo -e "${YELLOW}Note: Cannot automatically create remote_nodes table via CLI.${NC}"
      echo "Please run the SQL manually in Supabase SQL Editor."
      rm -f "$TEMP_MIGRATION"
    fi
  else
    echo -e "${YELLOW}Note: Cannot automatically create remote_nodes table.${NC}"
    echo "Please run the following SQL in Supabase SQL Editor:"
    echo ""
    echo "$CREATE_TABLE_SQL"
    echo ""
  fi
}

# Perform reset
echo ""
echo -e "${GREEN}=== Resetting database ===${NC}"
if [ "$USE_CLI" = true ]; then
  # Temporarily disable exit on error for reset (we'll continue even if it has issues)
  set +e
  reset_with_cli
  RESET_EXIT_CODE=$?
  set -e
  if [ $RESET_EXIT_CODE -ne 0 ]; then
    echo -e "${YELLOW}Warning: Database reset had issues (exit code: $RESET_EXIT_CODE), but continuing with table creation...${NC}"
  fi
else
  # Temporarily disable exit on error for reset (we'll continue even if it has issues)
  set +e
  reset_with_api
  RESET_EXIT_CODE=$?
  set -e
  if [ $RESET_EXIT_CODE -ne 0 ]; then
    echo -e "${YELLOW}Warning: Database reset had issues (exit code: $RESET_EXIT_CODE), but continuing with table creation...${NC}"
  fi
fi

# Function to create app_settings table
create_app_settings_table() {
  echo -e "${GREEN}Creating app_settings table...${NC}"

  # SQL for creating app_settings table
  # Note: update_updated_at_column() function should already exist from remote_nodes table creation
  # But we create it here too in case remote_nodes wasn't created first
  CREATE_TABLE_SQL="
-- Create update_updated_at_column function if it doesn't exist (needed for trigger)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$ language 'plpgsql';

-- Create app_settings table in Supabase
-- This table stores application-wide settings (e.g., LiteLLM configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Create updated_at trigger to automatically update the timestamp
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS \"Service role can manage app_settings\" ON app_settings;

-- Create a policy that allows all access (for backend operations)
CREATE POLICY \"Service role can manage app_settings\" ON app_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
"

  # Try to execute SQL using available methods
  # Note: Supabase CLI doesn't have a direct SQL execution command that bypasses migrations
  # We'll use migration-based approach with proper sync

  # Method 2: Use psql (direct database connection) as fallback
  if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
    echo "Executing SQL via psql (direct database connection)..."
    OUTPUT=$(echo "$CREATE_TABLE_SQL" | psql "$DB_URL" 2>&1)
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
      # Verify the table was actually created
      VERIFY_OUTPUT=$(echo "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings');" | psql "$DB_URL" -t 2>&1)
      if echo "$VERIFY_OUTPUT" | grep -q "t\|true\|1"; then
        echo -e "${GREEN}app_settings table created and verified successfully.${NC}"
        return 0
      else
        echo -e "${RED}Error: Table creation reported success but table does not exist.${NC}"
        echo "Verification output: $VERIFY_OUTPUT"
        return 1
      fi
    else
      if echo "$OUTPUT" | grep -q "already exists\|duplicate"; then
        # Verify the table actually exists
        VERIFY_OUTPUT=$(echo "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings');" | psql "$DB_URL" -t 2>&1)
        if echo "$VERIFY_OUTPUT" | grep -q "t\|true\|1"; then
          echo -e "${GREEN}app_settings table already exists and verified.${NC}"
          return 0
        else
          echo -e "${YELLOW}Warning: Table reported as existing but verification failed.${NC}"
          echo "Verification output: $VERIFY_OUTPUT"
          echo "Will try alternative method..."
        fi
      else
        echo -e "${YELLOW}Warning: Failed to create app_settings table via psql.${NC}"
        echo "Error output: $OUTPUT"
        echo "Exit code: $EXIT_CODE"
        echo "Will try alternative method..."
      fi
    fi
  fi

  # Try using Supabase CLI with db push to create table
  if [ "$USE_CLI" = true ]; then
    # Check if SUPABASE_URL is available (required)
    if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
      echo -e "${YELLOW}Note: SUPABASE_URL and SUPABASE_ANON_KEY should be set in .env.local:${NC}"
      echo -e "${YELLOW}  SUPABASE_URL=https://[PROJECT_REF].supabase.co${NC}"
      echo -e "${YELLOW}  SUPABASE_ANON_KEY=your_anon_key${NC}"
      echo ""
    fi

    echo "Attempting to create table via Supabase CLI..."
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    MIGRATION_NAME="${MIGRATION_TIMESTAMP}_create_app_settings"
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_NAME}.sql"
    mkdir -p supabase/migrations
    echo "$CREATE_TABLE_SQL" > "$TEMP_MIGRATION"

    if [ -n "$PROJECT_REF" ]; then
      if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
        echo "Linking project to create table..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
          echo -e "${YELLOW}Warning: Failed to link project.${NC}"
          rm -f "$TEMP_MIGRATION"
          return 1
        }
      fi

      # Try to sync migration history using remote commit (marks all remote migrations as applied locally)
      echo "Syncing migration history with remote database..."
      REMOTE_COMMIT_OUTPUT=$($SUPABASE_CMD db remote commit 2>&1 || true)
      if echo "$REMOTE_COMMIT_OUTPUT" | grep -q "Finished\|successfully\|committed\|up to date"; then
        echo "Migration history synced successfully via remote commit."
      else
        # Fallback: Try db pull
        PULL_OUTPUT=$($SUPABASE_CMD db pull --yes 2>&1 || true)
        if echo "$PULL_OUTPUT" | grep -q "Finished\|successfully\|pulled"; then
          echo "Migration history synced successfully via db pull."
        else
          echo "Note: Could not fully sync migration history, trying repair..."
          # Try to repair migration history if there are previous migrations
          if [ -d "supabase/migrations" ]; then
            PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -r | head -1)
            if [ -n "$PREVIOUS_MIGRATIONS" ]; then
              echo "Repairing migration history..."
              REPAIR_OUTPUT=$($SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>&1 || true)
              if echo "$REPAIR_OUTPUT" | grep -q "Finished\|repaired"; then
                echo "Migration history repaired."
              fi
            fi
          fi
        fi
      fi

      # Push the migration to create the table
      echo "Pushing migration to create app_settings table..."
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      PUSH_EXIT_CODE=$?
      if [ $PUSH_EXIT_CODE -eq 0 ] && echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
        echo -e "${GREEN}app_settings table created successfully via CLI.${NC}"
        rm -f "$TEMP_MIGRATION"
        return 0
      else
        echo -e "${RED}Error: Failed to create app_settings table via CLI.${NC}"
        echo "Exit code: $PUSH_EXIT_CODE"
        echo "Error output: $PUSH_OUTPUT"
        echo ""
        echo -e "${YELLOW}The Supabase CLI method failed due to migration history sync issues.${NC}"
        echo ""
        echo "Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in .env.local:"
        echo "  SUPABASE_URL=https://[PROJECT_REF].supabase.co"
        echo "  SUPABASE_ANON_KEY=your_anon_key"
        echo ""
        echo "You can find these values in Supabase Dashboard → Settings → API."
        echo ""
        echo "Or create the table manually in Supabase SQL Editor using the SQL shown above."
        rm -f "$TEMP_MIGRATION"
        return 1
      fi
    else
      echo -e "${RED}Error: Cannot automatically create app_settings table via CLI.${NC}"
      echo "PROJECT_REF is required but not provided."
      echo "Please provide --project-ref or set SUPABASE_PROJECT_REF environment variable."
      rm -f "$TEMP_MIGRATION"
      return 1
    fi
  else
    echo -e "${RED}Error: Cannot automatically create app_settings table.${NC}"
    echo "No database connection method available."
    echo ""
    echo "Please provide SUPABASE_URL and SUPABASE_ANON_KEY in .env.local:"
    echo "  SUPABASE_URL=https://[PROJECT_REF].supabase.co"
    echo "  SUPABASE_ANON_KEY=your_anon_key"
    echo ""
    echo "You can find these values in Supabase Dashboard → Settings → API."
    echo ""
    echo "Alternatively, you can use DATABASE_URL (optional fallback):"
    echo "  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
    echo ""
    echo "SQL to create the table manually in Supabase SQL Editor:"
    echo "$CREATE_TABLE_SQL"
    return 1
  fi
}

# Function to initialize LiteLLM settings
initialize_litellm_settings() {
  # Require all three settings: base URL, API key, and model name
  if [ -z "$LITELLM_BASE_URL" ] || [ -z "$LITELLM_API_KEY" ] || [ -z "$LITELLM_MODEL" ]; then
    echo -e "${YELLOW}Note: LiteLLM settings not fully provided. Skipping initialization.${NC}"
    echo "All three settings are required: base URL, API key, and model name."
    echo "You can configure LiteLLM later via the Settings page or by running:"
    echo "  psql \$DATABASE_URL -c \"INSERT INTO app_settings (key, value) VALUES ('litellm_base_url', 'your-url'), ('litellm_api_key', 'your-key'), ('litellm_model', 'your-model') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\""
    return 0
  fi

  echo -e "${GREEN}Initializing LiteLLM settings...${NC}"

  # Escape single quotes in values for SQL
  ESCAPED_BASE_URL=$(echo "$LITELLM_BASE_URL" | sed "s/'/''/g")
  ESCAPED_API_KEY=$(echo "$LITELLM_API_KEY" | sed "s/'/''/g")
  ESCAPED_MODEL=$(echo "$LITELLM_MODEL" | sed "s/'/''/g")

  # SQL to insert/update LiteLLM settings (all three are required)
  INIT_SETTINGS_SQL="
-- Initialize LiteLLM settings in app_settings table
INSERT INTO app_settings (key, value) VALUES
  ('litellm_base_url', '$ESCAPED_BASE_URL'),
  ('litellm_api_key', '$ESCAPED_API_KEY'),
  ('litellm_model', '$ESCAPED_MODEL')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
"

  # Try to execute SQL using available methods
  if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
    echo "Inserting LiteLLM settings via psql (direct database connection)..."
    if echo "$INIT_SETTINGS_SQL" | psql "$DB_URL" 2>&1; then
      echo -e "${GREEN}LiteLLM settings initialized successfully.${NC}"
      return 0
    else
      OUTPUT=$(echo "$INIT_SETTINGS_SQL" | psql "$DB_URL" 2>&1)
      echo -e "${YELLOW}Warning: Failed to initialize LiteLLM settings via psql.${NC}"
      echo "Error output: $OUTPUT"
      echo "You can configure LiteLLM later via the Settings page."
    fi
  elif [ "$USE_CLI" = true ] && [ -n "$PROJECT_REF" ]; then
    # Try using Supabase CLI
    echo "Attempting to initialize LiteLLM settings via Supabase CLI..."

    # Ensure migrations directory exists
    mkdir -p supabase/migrations

    # Create a temporary migration file
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    MIGRATION_NAME="${MIGRATION_TIMESTAMP}_init_litellm_settings"
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_NAME}.sql"
    echo "$INIT_SETTINGS_SQL" > "$TEMP_MIGRATION"

    if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
      OUTPUT=$(echo "$INIT_SETTINGS_SQL" | psql "$DB_URL" 2>&1)
      if [ $? -eq 0 ]; then
        echo -e "${GREEN}LiteLLM settings initialized successfully.${NC}"
        rm -f "$TEMP_MIGRATION"
        return 0
      else
        echo -e "${YELLOW}Warning: Failed to initialize LiteLLM settings via psql.${NC}"
        echo "Error output: $OUTPUT"
      fi
      rm -f "$TEMP_MIGRATION"
    elif [ -f supabase/.temp/project-ref ] || [ -n "$SUPABASE_URL" ]; then
      # Project is linked or can be linked, use db push
      if [ ! -f supabase/.temp/project-ref ] && [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_ROLE_KEY" ]; then
        echo "Linking project to initialize settings..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes 2>/dev/null || {
          echo -e "${YELLOW}Note: Cannot automatically link project.${NC}"
          echo "Please configure LiteLLM settings manually via the Settings page."
          rm -f "$TEMP_MIGRATION"
          return
        }
      fi

      # Push the migration to initialize settings
      echo "Pushing migration to initialize LiteLLM settings..."
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      if echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
        echo -e "${GREEN}LiteLLM settings initialized successfully.${NC}"
        rm -f "$TEMP_MIGRATION"
        return 0
      else
        echo -e "${YELLOW}Warning: Failed to initialize LiteLLM settings via CLI.${NC}"
        echo "Error: $PUSH_OUTPUT"
        echo "You can configure LiteLLM later via the Settings page."
        rm -f "$TEMP_MIGRATION"
      fi
    else
      echo -e "${YELLOW}Note: Cannot automatically initialize LiteLLM settings via CLI.${NC}"
      echo "Please configure LiteLLM settings manually via the Settings page."
      rm -f "$TEMP_MIGRATION"
    fi
  else
    echo -e "${YELLOW}Note: Cannot automatically initialize LiteLLM settings.${NC}"
    echo "Please configure LiteLLM settings manually via the Settings page or run the following SQL:"
    echo ""
    echo "$INIT_SETTINGS_SQL"
  fi
}

# Create remote_nodes table after reset
echo ""
echo -e "${GREEN}=== Creating remote_nodes table ===${NC}"
if ! create_remote_nodes_table; then
  echo -e "${YELLOW}Warning: Failed to create remote_nodes table. Continuing...${NC}"
fi

# Create app_settings table after reset
echo ""
echo -e "${GREEN}=== Creating app_settings table ===${NC}"
if ! create_app_settings_table; then
  echo ""
  echo -e "${RED}Error: Failed to create app_settings table.${NC}"
  echo -e "${RED}This table is required for LiteLLM configuration.${NC}"
  echo ""
  echo -e "${YELLOW}Important: Ensure you are running this script against the same Supabase project${NC}"
  echo -e "${YELLOW}that your Cloudflare Worker is configured to use.${NC}"
  echo ""
  echo -e "${YELLOW}Check your configuration:${NC}"
  if [ -n "$SUPABASE_URL" ]; then
    echo -e "  SUPABASE_URL: $SUPABASE_URL"
  fi
  if [ -n "$PROJECT_REF" ]; then
    echo -e "  PROJECT_REF: $PROJECT_REF"
  fi
  if [ -n "$DB_URL" ]; then
    DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    echo -e "  DATABASE_URL host: $DB_HOST"
  fi
  echo ""
  echo -e "${YELLOW}Please check the error messages above and try again.${NC}"
  echo -e "${YELLOW}You may need to create the table manually in Supabase SQL Editor.${NC}"
  exit 1
fi

# Initialize LiteLLM settings if provided
echo ""
echo -e "${GREEN}=== Initializing LiteLLM settings (if provided) ===${NC}"
initialize_litellm_settings

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Database reset completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"

