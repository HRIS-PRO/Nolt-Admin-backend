
import 'dotenv/config';
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: alter_investments_signature_array...");

        // 1. Add new column
        await sql`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS signatures TEXT[];
        `;

        console.log("Migration 'alter_investments_signature_array' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
