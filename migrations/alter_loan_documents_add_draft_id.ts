
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: alter_loan_documents_add_draft_id...");

        // Add draft_id column
        await sql`
            ALTER TABLE loan_documents 
            ADD COLUMN IF NOT EXISTS draft_id TEXT;
        `;

        // Make loan_id nullable
        await sql`
            ALTER TABLE loan_documents 
            ALTER COLUMN loan_id DROP NOT NULL;
        `;

        // Create an index for draft_id for faster lookups
        await sql`CREATE INDEX IF NOT EXISTS idx_loan_documents_draft_id ON loan_documents(draft_id);`;

        console.log("Migration 'alter_loan_documents_add_draft_id' completed successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
