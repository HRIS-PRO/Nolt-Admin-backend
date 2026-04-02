import pool from './config/db.js';

async function addCol() {
  try {
    await pool.query("ALTER TABLE investments ADD COLUMN IF NOT EXISTS indemnity_document_url TEXT;");
    console.log("Added column successfully");
  } catch (e) {
    console.error("Failed to add column", e);
  } finally {
    process.exit(0);
  }
}

addCol();
