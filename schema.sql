-- D1 Database Schema for PatchX
-- This schema replaces Supabase tables with D1 SQLite tables

-- Create remote_nodes table
-- This table stores remote node configuration for SSH connections
CREATE TABLE IF NOT EXISTS remote_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('key', 'password')),
  ssh_key TEXT, -- SSH private key
  password TEXT, -- SSH password
  working_home TEXT, -- Working directory path on the remote node
  ssh_service_api_url TEXT, -- SSH service API URL for command execution
  ssh_service_api_key TEXT, -- SSH service API key for authentication
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create index on host and username for faster lookups
CREATE INDEX IF NOT EXISTS idx_remote_nodes_host ON remote_nodes(host);
CREATE INDEX IF NOT EXISTS idx_remote_nodes_username ON remote_nodes(username);

-- Create app_settings table
-- This table stores application settings including LiteLLM configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Trigger to automatically update updated_at timestamp (SQLite doesn't support triggers like PostgreSQL)
-- We'll handle this in application code instead
