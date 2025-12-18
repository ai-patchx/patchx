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

    # For remote databases, we can use SUPABASE_URL and SUPABASE_ANON_KEY
    # Option 1: Use DATABASE_URL with psql (if available)
    if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
      echo "Using direct database connection via DATABASE_URL..."
      echo "Truncating all tables in the public schema..."

      # Generate SQL to truncate all tables
      TRUNCATE_SQL=$(psql "$DB_URL" -t -c "
        SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(schemaname)||'.'||quote_ident(tablename), ', ') || ' RESTART IDENTITY CASCADE;'
        FROM pg_tables
        WHERE schemaname = 'public';
      " 2>/dev/null)

      if [ -n "$TRUNCATE_SQL" ] && [ "$TRUNCATE_SQL" != "TRUNCATE TABLE  RESTART IDENTITY CASCADE;" ]; then
        echo "Executing: $TRUNCATE_SQL"
        psql "$DB_URL" -c "$TRUNCATE_SQL" || {
          echo -e "${YELLOW}Warning: Failed to truncate tables.${NC}"
          echo "You may need to create the remote_nodes table manually."
        }
        echo -e "${GREEN}Database tables truncated successfully.${NC}"
      else
        echo -e "${YELLOW}No tables found to truncate, or error occurred.${NC}"
      fi
    # Option 2: Use SUPABASE_URL and SUPABASE_ANON_KEY with Supabase CLI
    elif [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_ROLE_KEY" ]; then
      echo "Using Supabase API with SUPABASE_URL and SUPABASE_ANON_KEY..."

      # Ensure project is linked
      if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
        echo "Linking project..."
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
          echo -e "${RED}Error: Failed to link project.${NC}"
          echo "You may need to authenticate first: $SUPABASE_CMD login"
          exit 1
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

      # Try to repair migration history if there are previous migrations
      # Extract migration timestamps from existing migration files
      if [ -d "supabase/migrations" ]; then
        PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | head -1)
        if [ -n "$PREVIOUS_MIGRATIONS" ]; then
          echo "Attempting to repair migration history..."
          $SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>/dev/null || true
        fi
      fi

      # Push the migration to the linked project
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      if echo "$PUSH_OUTPUT" | grep -q "Finished\|successfully\|Applied migration"; then
        echo -e "${GREEN}Database tables truncated successfully.${NC}"
        # Remove the temporary migration file
        rm -f "$TEMP_MIGRATION"
      else
        # Check if the error is just about migration history (which we can ignore if tables are empty)
        if echo "$PUSH_OUTPUT" | grep -q "Remote migration versions not found"; then
          echo -e "${YELLOW}Warning: Migration history mismatch during truncate, but continuing...${NC}"
          echo "This is usually safe if the database is empty or you're resetting."
        else
          echo -e "${YELLOW}Warning: Failed to truncate tables via CLI.${NC}"
          echo "Error: $PUSH_OUTPUT"
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
      echo "Option 2: DATABASE_URL in .env.local (requires psql):"
      echo "  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
      echo ""
      echo "You can find these values in the Supabase Dashboard under Settings."
      echo "Alternatively, you can reset the database manually in the Supabase Dashboard."
      exit 1
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

# Function to reset using API (requires SUPABASE_URL and SUPABASE_ANON_KEY)
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

  # Try to use Supabase CLI if available
  if [ "$USE_CLI" = true ]; then
    # Ensure project is linked
    if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
      echo "Linking project..."
      $SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes || {
        echo -e "${RED}Error: Failed to link project.${NC}"
        echo "You may need to authenticate first: $SUPABASE_CMD login"
        exit 1
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

    # Repair migration history first if there were previous migrations
    echo "Checking migration history before truncate..."
    REPAIR_OUTPUT=$($SUPABASE_CMD migration repair --status reverted 20251218181329 2>&1 || true)
    if echo "$REPAIR_OUTPUT" | grep -q "Finished\|repaired"; then
      echo "Migration history repaired."
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
  echo "2. Provide DATABASE_URL environment variable for direct database access"
  echo "   (requires psql: sudo apt-get install postgresql-client)"
  echo ""
  echo "3. Use Supabase Dashboard to reset your database manually"
  exit 1
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
  # Prefer psql (direct database connection) as it bypasses migration history issues
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

      # Try to repair migration history if there are previous migrations
      # Extract migration timestamps from existing migration files (including the reset migration we just created)
      if [ -d "supabase/migrations" ]; then
        PREVIOUS_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -r | head -1)
        if [ -n "$PREVIOUS_MIGRATIONS" ]; then
          echo "Checking migration history before creating table..."
          REPAIR_OUTPUT=$($SUPABASE_CMD migration repair --status reverted "$PREVIOUS_MIGRATIONS" 2>&1 || true)
          if echo "$REPAIR_OUTPUT" | grep -q "Finished\|repaired"; then
            echo "Migration history repaired."
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
        echo "You can try:"
        echo "  1. Run the SQL manually in Supabase SQL Editor (recommended)"
        echo "  2. Or repair migration history: supabase migration repair --status reverted 20251218180930"
        echo "  3. Or use DATABASE_URL with psql for direct connection"
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
if [ "$USE_CLI" = true ]; then
  reset_with_cli
else
  reset_with_api
fi

# Create remote_nodes table after reset
create_remote_nodes_table

echo -e "${GREEN}Database reset completed successfully!${NC}"

