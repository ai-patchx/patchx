#!/bin/bash

# Database Management Script for D1
# This script can initialize or reset the D1 database
# Usage:
#   ./scripts/reset-db.sh [--init] [--env ENV] [--remote] [--confirm]
#   --init: Initialize database (create tables if they don't exist, don't drop existing)
#   Without --init: Reset database (drop and recreate tables)
#   --remote: Use remote D1 database (required for production/staging)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV=""
CONFIRM=false
INIT_ONLY=false
REMOTE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --init)
      INIT_ONLY=true
      shift
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --remote)
      REMOTE=true
      shift
      ;;
    --confirm)
      CONFIRM=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --init            Initialize database (create tables if they don't exist)"
      echo "                    Without this flag, the script will reset (drop and recreate) the database"
      echo "  --env ENV         Environment (production, staging, or leave empty for default)"
      echo "  --remote          Use remote D1 database (required for production/staging databases)"
      echo "  --confirm         Skip confirmation prompt"
      echo "  -h, --help        Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --init                    # Initialize local database (safe, won't drop existing data)"
      echo "  $0 --init --remote            # Initialize remote database"
      echo "  $0 --init --env production --remote --confirm  # Initialize production database remotely"
      echo "  $0                            # Reset local database (drops all tables and recreates)"
      echo "  $0 --env production --remote  # Reset production database remotely"
      echo ""
      echo "Note: For remote databases, you must first create the D1 database using:"
      echo "  wrangler d1 create patchx-db"
      echo "Then update wrangler.toml with the database_id from the command output."
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Confirmation prompt
if [ "$CONFIRM" = false ]; then
  if [ "$INIT_ONLY" = true ]; then
    echo -e "${GREEN}This will initialize your D1 database.${NC}"
    echo "This will create the required tables if they don't exist."
    echo "Existing data will be preserved."
  else
    echo -e "${RED}WARNING: This will reset your D1 database!${NC}"
    echo "All data in remote_nodes and app_settings tables will be lost."
    echo "This action cannot be undone."
  fi
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " response
  if [ "$response" != "yes" ]; then
    echo "Database operation cancelled."
    exit 0
  fi
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
  if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: wrangler CLI is not installed.${NC}"
    echo ""
    echo "Please install wrangler:"
    echo "  npm install -g wrangler"
    echo "  or use: npx wrangler"
    exit 1
  fi
  WRANGLER_CMD="npx wrangler"
else
  WRANGLER_CMD="wrangler"
fi

# Check if schema.sql exists
if [ ! -f "schema.sql" ]; then
  echo -e "${RED}Error: schema.sql file not found.${NC}"
  echo "Please ensure schema.sql exists in the project root."
  exit 1
fi

# Add environment flag if specified
ENV_FLAG=""
if [ -n "$ENV" ]; then
  ENV_FLAG="--env $ENV"
fi

# Add remote flag if specified
REMOTE_FLAG=""
if [ "$REMOTE" = true ]; then
  REMOTE_FLAG="--remote"
fi

# Determine database binding/name from environment
# For D1 with --env, we use the binding name "DB" as defined in wrangler.toml
# For local or without --env, we need to use the actual database name
if [ -n "$ENV" ]; then
  # When using --env, wrangler uses the binding name from that environment's config
  DB_REF="DB"
  DB_DISPLAY_NAME="DB binding (${ENV} environment)"

  if [ "$REMOTE" = false ]; then
    echo -e "${YELLOW}Note: Using --env without --remote will use local database.${NC}"
    echo -e "${YELLOW}For remote database, add --remote flag: $0 --init --env $ENV --remote${NC}"
  fi
else
  # For default environment without --env, use database name
  # Note: This requires the database to be created first
  DB_REF="patchx-db"
  DB_DISPLAY_NAME="patchx-db"

  if [ "$REMOTE" = true ]; then
    echo -e "${YELLOW}Note: Using --remote without --env. Make sure the database 'patchx-db' exists in your Cloudflare account.${NC}"
    echo -e "${YELLOW}For production/staging, use: $0 --init --env production --remote${NC}"
  else
    echo -e "${YELLOW}Note: Using local database. For remote database, use --remote flag or specify --env.${NC}"
    echo -e "${YELLOW}To create a local database, run: wrangler d1 create patchx-db${NC}"
  fi
fi

if [ "$INIT_ONLY" = true ]; then
  echo -e "${GREEN}Initializing D1 database: $DB_DISPLAY_NAME${NC}"
  if [ "$REMOTE" = true ]; then
    echo -e "${YELLOW}Using remote database${NC}"
  else
    echo -e "${YELLOW}Using local database${NC}"
  fi

  # Execute SQL from schema.sql (CREATE TABLE IF NOT EXISTS will skip existing tables)
  echo "Executing schema.sql..."
  if $WRANGLER_CMD d1 execute $DB_REF $ENV_FLAG $REMOTE_FLAG --file=./schema.sql; then
    echo -e "${GREEN}✓ Database initialized successfully!${NC}"
    echo ""
    echo "Tables created/verified:"
    echo "  - remote_nodes"
    echo "  - app_settings"
  else
    echo -e "${RED}Error: Failed to initialize database.${NC}"
    echo ""
    if [ -z "$ENV" ] && [ "$REMOTE" = false ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Create a local D1 database:"
      echo "   wrangler d1 create patchx-db"
      echo ""
      echo "2. Or use remote database with environment:"
      echo "   $0 --init --env production --remote"
      echo "   $0 --init --env staging --remote"
    elif [ -z "$ENV" ] && [ "$REMOTE" = true ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Create the remote database in Cloudflare:"
      echo "   wrangler d1 create patchx-db"
      echo ""
      echo "2. Or use with environment (recommended):"
      echo "   $0 --init --env production --remote"
    elif [ -n "$ENV" ] && [ "$REMOTE" = false ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "For remote database, add --remote flag:"
      echo "   $0 --init --env $ENV --remote"
    else
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Ensure D1 database is created in Cloudflare"
      echo "2. Update wrangler.toml with the correct database_id"
      echo "3. Verify you're authenticated: wrangler login"
    fi
    exit 1
  fi
else
  echo -e "${GREEN}Resetting D1 database: $DB_DISPLAY_NAME${NC}"
  if [ "$REMOTE" = true ]; then
    echo -e "${YELLOW}Using remote database${NC}"
  else
    echo -e "${YELLOW}Using local database${NC}"
  fi

  # Drop existing tables
  echo "Dropping existing tables..."
  $WRANGLER_CMD d1 execute $DB_REF $ENV_FLAG $REMOTE_FLAG --command="DROP TABLE IF EXISTS app_settings;" || true
  $WRANGLER_CMD d1 execute $DB_REF $ENV_FLAG $REMOTE_FLAG --command="DROP TABLE IF EXISTS remote_nodes;" || true

  # Recreate tables from schema.sql
  echo "Recreating tables from schema.sql..."
  if $WRANGLER_CMD d1 execute $DB_REF $ENV_FLAG $REMOTE_FLAG --file=./schema.sql; then
    echo -e "${GREEN}✓ Database reset completed successfully!${NC}"
    echo ""
    echo "Tables recreated:"
    echo "  - remote_nodes"
    echo "  - app_settings"
  else
    echo -e "${RED}Error: Failed to reset database.${NC}"
    echo ""
    if [ -z "$ENV" ] && [ "$REMOTE" = false ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Create a local D1 database:"
      echo "   wrangler d1 create patchx-db"
      echo ""
      echo "2. Or use remote database with environment:"
      echo "   $0 --env production --remote"
    elif [ -z "$ENV" ] && [ "$REMOTE" = true ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Create the remote database in Cloudflare:"
      echo "   wrangler d1 create patchx-db"
      echo ""
      echo "2. Or use with environment (recommended):"
      echo "   $0 --env production --remote"
    elif [ -n "$ENV" ] && [ "$REMOTE" = false ]; then
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "For remote database, add --remote flag:"
      echo "   $0 --env $ENV --remote"
    else
      echo -e "${YELLOW}Troubleshooting:${NC}"
      echo "1. Ensure D1 database is created in Cloudflare"
      echo "2. Update wrangler.toml with the correct database_id"
      echo "3. Verify you're authenticated: wrangler login"
    fi
    exit 1
  fi
fi
