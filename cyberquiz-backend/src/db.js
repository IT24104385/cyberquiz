const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
});

// Apply the schema once at startup (idempotent thanks to IF NOT EXISTS).
async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  // Strip line comments FIRST (some contain semicolons), then split.
  const statements = schema
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) await pool.query(stmt);

  // Migrations for new columns added after initial schema.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
}

module.exports = { pool, init };
