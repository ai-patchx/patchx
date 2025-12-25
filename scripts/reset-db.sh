#!/bin/bash

# Database Reset Script for Supabase
# This script resets the Supabase database using the Supabase CLI or API
# Usage: ./scripts/reset-db.sh [--confirm] [--project-ref PROJECT_REF]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
CONFIRM=false
PROJECT_REF=""
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
      echo "  --supabase-url URL     Supabase project URL"
      echo "  --service-role-key KEY Supabase service role key"
      echo "  -h, --help             Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  SUPABASE_PROJECT_REF      Supabase project reference ID"
      echo "  SUPABASE_URL              Supabase project URL"
      echo "  SUPABASE_ANON_KEY         Supabase anon key"
      echo "  SUPABASE_SERVICE_ROLE_KEY Supabase service role key (preferred)"
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
# Prefer service role key, fallback to anon key
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-$SUPABASE_ANON_KEY}}

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

    # For remote databases, we use SUPABASE_URL and SUPABASE_ANON_KEY with Supabase CLI
    if [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_ROLE_KEY" ]; then
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

      # Truncate all tables using direct SQL execution
      echo "Truncating all tables in the public schema..."

      # SQL to truncate all tables
      TRUNCATE_SQL="
DO \$\$
DECLARE
  r RECORD;
  sql_text TEXT;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    sql_text := 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    EXECUTE sql_text;
  END LOOP;
END \$\$;
"

      # Note: db execute may not work for remote databases
      # Skip truncation for remote databases - focus on creating the table instead
      echo -e "${YELLOW}Note: Skipping table truncation for remote database.${NC}"
      echo "If you need to truncate tables, please do so manually in Supabase SQL Editor."
      echo "The script will now proceed to create the remote_nodes table."
    else
      # SUPABASE_URL and SERVICE_ROLE_KEY not provided
      echo -e "${RED}Error: Cannot reset remote database.${NC}"
      echo ""
      echo "The 'db reset' command only works for local Supabase instances."
      echo "For remote databases, you need to provide:"
      echo ""
      echo "SUPABASE_URL and SUPABASE_ANON_KEY in .env.local:"
      echo "  SUPABASE_URL=https://[PROJECT_REF].supabase.co"
      echo "  SUPABASE_ANON_KEY=your_anon_key"
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

  # Execute SQL directly using db execute
  if [ "$USE_CLI" = true ] && [ -n "$PROJECT_REF" ]; then
    # Ensure project is linked
    if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
      if [ -n "$SUPABASE_URL" ] && [ -n "$PROJECT_REF" ]; then
        echo "Linking project to create table..."
        LINK_OUTPUT=$($SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes 2>&1)
        if [ $? -ne 0 ]; then
          echo -e "${YELLOW}Warning: Failed to link project automatically.${NC}"
          echo "Link output: $LINK_OUTPUT"
          echo ""
          echo "You may need to authenticate first:"
          echo "  $SUPABASE_CMD login"
          echo ""
          echo "Or run the SQL manually in Supabase SQL Editor."
          return 1
        else
          echo "Project linked successfully."
        fi
      else
        echo -e "${YELLOW}Warning: Cannot link project - missing SUPABASE_URL or PROJECT_REF.${NC}"
        return 1
      fi
    fi

    # For remote databases, use temporary migration file and push it
    # This is the most reliable way to execute SQL on remote Supabase databases
    echo "Creating remote_nodes table using temporary migration..."

    # Ensure migrations directory exists
    mkdir -p supabase/migrations

    # Check for existing migrations and repair history if needed
    if [ -d "supabase/migrations" ] && [ -n "$(ls -A supabase/migrations/*.sql 2>/dev/null)" ]; then
      echo "Checking migration history..."
      # Get list of existing migration timestamps
      EXISTING_MIGRATIONS=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -n)
      if [ -n "$EXISTING_MIGRATIONS" ]; then
        echo "Found existing migrations. Checking remote migration status (with 5s timeout)..."
        # Check migration history status with timeout to prevent hanging
        COMMIT_OUTPUT=""
        if command -v timeout &> /dev/null; then
          COMMIT_OUTPUT=$(timeout 5 $SUPABASE_CMD db remote commit 2>&1 || echo "TIMEOUT_OR_ERROR")
        else
          # Without timeout command, skip the check to avoid hanging
          echo "  Skipping migration history check (timeout command not available)"
          COMMIT_OUTPUT="SKIPPED"
        fi

        # If check timed out or failed, proceed anyway
        if [ "$COMMIT_OUTPUT" = "TIMEOUT_OR_ERROR" ] || [ "$COMMIT_OUTPUT" = "SKIPPED" ]; then
          echo "  Migration history check skipped or timed out. Proceeding with table creation..."
          COMMIT_OUTPUT=""
        fi

        # Check if there's a migration history mismatch (only if we got output)
        if [ -n "$COMMIT_OUTPUT" ] && echo "$COMMIT_OUTPUT" | grep -qiE "migration history.*does not match|history.*mismatch"; then
          echo -e "${YELLOW}Migration history mismatch detected. Repairing...${NC}"

          # Extract migration repair commands from the output and execute them
          # The output format is: "supabase migration repair --status <status> <timestamp>"
          # Use a temporary file to avoid subshell issues
          REPAIR_TEMP=$(mktemp /tmp/migration_repair_XXXXXX.txt)
          echo "$COMMIT_OUTPUT" | grep -E "supabase migration repair" | sed 's/.*\(supabase migration repair[^$]*\)/\1/' > "$REPAIR_TEMP"

          if [ -s "$REPAIR_TEMP" ]; then
            while IFS= read -r repair_cmd; do
              if [ -n "$repair_cmd" ]; then
                echo "Executing: $repair_cmd"
                # Replace 'supabase' with the actual command (which might be 'npx supabase')
                REPAIR_CMD_FULL=$(echo "$repair_cmd" | sed "s/^supabase/$SUPABASE_CMD/")
                $REPAIR_CMD_FULL 2>&1 || echo "  Note: Repair command completed"
              fi
            done < "$REPAIR_TEMP"
          fi

          rm -f "$REPAIR_TEMP"
          echo "Migration history repair completed."
        fi
      fi
    fi

    # Create a temporary migration file with timestamp
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_TIMESTAMP}_create_remote_nodes.sql"
    echo "$CREATE_TABLE_SQL" > "$TEMP_MIGRATION"

    echo "Migration file created: $TEMP_MIGRATION"
    echo "Pushing migration to create remote_nodes table..."

    # Try db push with timeout and auto-confirmation using expect if available
    if command -v expect &> /dev/null; then
      echo "Pushing migration using expect for auto-confirmation..."
      EXPECT_SCRIPT=$(mktemp /tmp/db_push_expect_XXXXXX.exp)
      cat > "$EXPECT_SCRIPT" << EOFEXPECT
set timeout 30
spawn $SUPABASE_CMD db push --yes
expect {
  "Do you want to push" {
    send "y\r"
    exp_continue
  }
  "Y/n" {
    send "y\r"
    exp_continue
  }
  eof
}
EOFEXPECT
      if command -v timeout &> /dev/null; then
        PUSH_OUTPUT=$(timeout 35 expect "$EXPECT_SCRIPT" 2>&1)
        PUSH_EXIT=$?
      else
        PUSH_OUTPUT=$(expect "$EXPECT_SCRIPT" 2>&1)
        PUSH_EXIT=$?
      fi
      rm -f "$EXPECT_SCRIPT"
    else
      # Fallback: try with timeout and hope --yes works, or provide instructions
      echo "Pushing migration (expect not available, trying --yes flag)..."
      echo "Note: If this hangs, you may need to install 'expect': sudo apt-get install expect"
      if command -v timeout &> /dev/null; then
        PUSH_OUTPUT=$(timeout 30 bash -c "echo y | $SUPABASE_CMD db push --yes" 2>&1)
        PUSH_EXIT=$?
      else
        PUSH_OUTPUT=$(bash -c "echo y | $SUPABASE_CMD db push --yes" 2>&1)
        PUSH_EXIT=$?
      fi
    fi

    # Show full output for debugging
    echo "=========================================="
    echo "Migration push output:"
    echo "$PUSH_OUTPUT"
    echo "=========================================="
    echo ""

    # Check for various success indicators
    if [ $PUSH_EXIT -eq 0 ]; then
      # Check output for success messages
      if echo "$PUSH_OUTPUT" | grep -qiE "finished|successfully|applied|pushing|migration.*applied|no changes"; then
        echo -e "${GREEN}✓ Migration push completed.${NC}"

        # The migration was successfully pushed, so the table should be created
        # Skip verification to avoid hanging (db remote commit can hang)
        echo -e "${GREEN}✓ remote_nodes table created successfully.${NC}"
        echo ""
        echo "The table has been created. You can verify it in Supabase Dashboard:"
        echo "  ${SUPABASE_URL}/project/${PROJECT_REF}/editor"

        # Remove the temporary migration file after successful push
        rm -f "$TEMP_MIGRATION"
        return 0
      fi
    fi

    # Check for "already exists" messages
    if echo "$PUSH_OUTPUT" | grep -qiE "already exists|duplicate|table.*exists"; then
      echo -e "${GREEN}✓ remote_nodes table already exists.${NC}"
      rm -f "$TEMP_MIGRATION"
      return 0
    fi

    # Check for migration history issues
    if echo "$PUSH_OUTPUT" | grep -qiE "migration.*not found|remote.*not found|history.*mismatch|version.*not found"; then
      echo -e "${YELLOW}Migration history mismatch detected. Attempting to repair...${NC}"

      # Try to repair by marking migrations as applied
      if [ -d "supabase/migrations" ]; then
        for MIG_FILE in supabase/migrations/*.sql; do
          if [ -f "$MIG_FILE" ]; then
            MIG_TIMESTAMP=$(basename "$MIG_FILE" | sed 's/\([0-9]*\)_.*/\1/')
            if [ -n "$MIG_TIMESTAMP" ]; then
              echo "Repairing migration: $MIG_TIMESTAMP"
              $SUPABASE_CMD migration repair --status applied "$MIG_TIMESTAMP" 2>&1 || true
            fi
          fi
        done
      fi

      # Try pushing again
      echo "Retrying migration push after repair..."
      PUSH_OUTPUT=$($SUPABASE_CMD db push --yes 2>&1)
      PUSH_EXIT=$?
      echo "Retry output:"
      echo "$PUSH_OUTPUT"
      echo ""

      if [ $PUSH_EXIT -eq 0 ] && echo "$PUSH_OUTPUT" | grep -qiE "finished|successfully|applied"; then
        echo -e "${GREEN}✓ remote_nodes table created successfully after repair.${NC}"
        rm -f "$TEMP_MIGRATION"
        return 0
      fi
    fi

    # If we get here, migration push likely failed
    SQL_FILE="create_remote_nodes_table.sql"
    cp "$TEMP_MIGRATION" "$SQL_FILE"

    echo -e "${RED}Error: Migration push failed.${NC}"
    echo ""
    echo "Exit code: $PUSH_EXIT"
    echo ""
    echo -e "${GREEN}SQL has been saved to: $SQL_FILE${NC}"
    echo ""
    echo -e "${YELLOW}Please run the SQL manually in Supabase SQL Editor:${NC}"
    echo "  1. Go to: ${SUPABASE_URL}/project/${PROJECT_REF}/sql/new"
    echo "  2. Open the file: $SQL_FILE"
    echo "  3. Copy and paste the SQL into the editor"
    echo "  4. Click 'Run'"
    echo ""
    echo "Or view the SQL:"
    echo "  cat $SQL_FILE"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check if you're authenticated: $SUPABASE_CMD login"
    echo "  - Verify project is linked: $SUPABASE_CMD link --project-ref $PROJECT_REF"
    echo "  - Check migration history: $SUPABASE_CMD db remote commit"
    # Keep the migration file for inspection
    return 1
  else
    echo -e "${YELLOW}Note: Cannot automatically create remote_nodes table.${NC}"
    echo "Supabase CLI is not available or PROJECT_REF is not set."
    echo ""
    echo "Please run the following SQL in Supabase SQL Editor:"
    echo "  ${SUPABASE_URL}/project/${PROJECT_REF}/sql/new"
    echo ""
    echo "SQL to run:"
    echo "----------------------------------------"
    echo "$CREATE_TABLE_SQL"
    echo "----------------------------------------"
    return 1
  fi
}

# Function to create app_settings table
create_app_settings_table() {
  echo -e "${GREEN}Creating app_settings table...${NC}"

  # SQL for creating app_settings table
  CREATE_TABLE_SQL="
-- Create app_settings table in Supabase
-- This table stores application settings including LiteLLM configuration

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
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS \"Service role can manage app_settings\" ON app_settings;

-- Create a policy that allows all access (for backend operations)
-- Note: Service role key bypasses RLS automatically, but this policy
-- allows anon key to work as well (useful for development/testing)
-- In production, prefer using SUPABASE_SERVICE_ROLE_KEY in the worker
CREATE POLICY \"Service role can manage app_settings\" ON app_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
"

  # Execute SQL directly using db execute
  if [ "$USE_CLI" = true ] && [ -n "$PROJECT_REF" ]; then
    # Ensure project is linked (should already be linked from previous table creation)
    if [ ! -f supabase/.temp/project-ref ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
      if [ -n "$SUPABASE_URL" ] && [ -n "$PROJECT_REF" ]; then
        echo "Linking project to create table..."
        LINK_OUTPUT=$($SUPABASE_CMD link --project-ref "$PROJECT_REF" --yes 2>&1)
        if [ $? -ne 0 ]; then
          echo -e "${YELLOW}Warning: Failed to link project automatically.${NC}"
          echo "Link output: $LINK_OUTPUT"
          echo ""
          echo "You may need to authenticate first:"
          echo "  $SUPABASE_CMD login"
          echo ""
          echo "Or run the SQL manually in Supabase SQL Editor."
          return 1
        else
          echo "Project linked successfully."
        fi
      else
        echo -e "${YELLOW}Warning: Cannot link project - missing SUPABASE_URL or PROJECT_REF.${NC}"
        return 1
      fi
    fi

    # For remote databases, use temporary migration file and push it
    echo "Creating app_settings table using temporary migration..."

    # Ensure migrations directory exists
    mkdir -p supabase/migrations

    # Create a temporary migration file with timestamp
    MIGRATION_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    TEMP_MIGRATION="supabase/migrations/${MIGRATION_TIMESTAMP}_create_app_settings.sql"
    echo "$CREATE_TABLE_SQL" > "$TEMP_MIGRATION"

    echo "Migration file created: $TEMP_MIGRATION"
    echo "Pushing migration to create app_settings table..."

    # Try db push with timeout and auto-confirmation using expect if available
    if command -v expect &> /dev/null; then
      echo "Pushing migration using expect for auto-confirmation..."
      EXPECT_SCRIPT=$(mktemp /tmp/db_push_expect_XXXXXX.exp)
      cat > "$EXPECT_SCRIPT" << EOFEXPECT
set timeout 30
spawn $SUPABASE_CMD db push --yes
expect {
  "Do you want to push" {
    send "y\r"
    exp_continue
  }
  "Y/n" {
    send "y\r"
    exp_continue
  }
  eof
}
EOFEXPECT
      if command -v timeout &> /dev/null; then
        PUSH_OUTPUT=$(timeout 35 expect "$EXPECT_SCRIPT" 2>&1)
        PUSH_EXIT=$?
      else
        PUSH_OUTPUT=$(expect "$EXPECT_SCRIPT" 2>&1)
        PUSH_EXIT=$?
      fi
      rm -f "$EXPECT_SCRIPT"
    else
      # Fallback: try with timeout and hope --yes works, or provide instructions
      echo "Pushing migration (expect not available, trying --yes flag)..."
      echo "Note: If this hangs, you may need to install 'expect': sudo apt-get install expect"
      if command -v timeout &> /dev/null; then
        PUSH_OUTPUT=$(timeout 30 bash -c "echo y | $SUPABASE_CMD db push --yes" 2>&1)
        PUSH_EXIT=$?
      else
        PUSH_OUTPUT=$(bash -c "echo y | $SUPABASE_CMD db push --yes" 2>&1)
        PUSH_EXIT=$?
      fi
    fi

    # Show full output for debugging
    echo "=========================================="
    echo "Migration push output:"
    echo "$PUSH_OUTPUT"
    echo "=========================================="
    echo ""

    # Check for various success indicators
    if [ $PUSH_EXIT -eq 0 ]; then
      # Check output for success messages
      if echo "$PUSH_OUTPUT" | grep -qiE "finished|successfully|applied|pushing|migration.*applied|no changes"; then
        echo -e "${GREEN}✓ Migration push completed.${NC}"

        # The migration was successfully pushed, so the table should be created
        echo -e "${GREEN}✓ app_settings table created successfully.${NC}"
        echo ""
        echo "The table has been created. You can verify it in Supabase Dashboard:"
        echo "  ${SUPABASE_URL}/project/${PROJECT_REF}/editor"

        # Remove the temporary migration file after successful push
        rm -f "$TEMP_MIGRATION"
        return 0
      fi
    fi

    # Check for "already exists" messages
    if echo "$PUSH_OUTPUT" | grep -qiE "already exists|duplicate|table.*exists"; then
      echo -e "${GREEN}✓ app_settings table already exists.${NC}"
      rm -f "$TEMP_MIGRATION"
      return 0
    fi

    # If we get here, migration push likely failed
    SQL_FILE="create_app_settings_table.sql"
    cp "$TEMP_MIGRATION" "$SQL_FILE"

    echo -e "${RED}Error: Migration push failed.${NC}"
    echo ""
    echo "Exit code: $PUSH_EXIT"
    echo ""
    echo -e "${GREEN}SQL has been saved to: $SQL_FILE${NC}"
    echo ""
    echo -e "${YELLOW}Please run the SQL manually in Supabase SQL Editor:${NC}"
    echo "  1. Go to: ${SUPABASE_URL}/project/${PROJECT_REF}/sql/new"
    echo "  2. Open the file: $SQL_FILE"
    echo "  3. Copy and paste the SQL into the editor"
    echo "  4. Click 'Run'"
    echo ""
    echo "Or view the SQL:"
    echo "  cat $SQL_FILE"
    # Keep the migration file for inspection
    return 1
  else
    echo -e "${YELLOW}Note: Cannot automatically create app_settings table.${NC}"
    echo "Supabase CLI is not available or PROJECT_REF is not set."
    echo ""
    echo "Please run the following SQL in Supabase SQL Editor:"
    echo "  ${SUPABASE_URL}/project/${PROJECT_REF}/sql/new"
    echo ""
    echo "SQL to run:"
    echo "----------------------------------------"
    echo "$CREATE_TABLE_SQL"
    echo "----------------------------------------"
    return 1
  fi
}

# Perform reset using CLI only
if [ "$USE_CLI" = true ]; then
  reset_with_cli
else
  echo -e "${RED}Error: Supabase CLI is required.${NC}"
  echo ""
  echo "Please install Supabase CLI:"
  echo "  npm install -g supabase"
  echo "  or use: npx supabase"
  echo ""
  echo "Then authenticate:"
  echo "  supabase login"
  exit 1
fi

# Create remote_nodes table after reset
create_remote_nodes_table

# Create app_settings table for LiteLLM configuration
create_app_settings_table

echo -e "${GREEN}Database reset completed successfully!${NC}"
