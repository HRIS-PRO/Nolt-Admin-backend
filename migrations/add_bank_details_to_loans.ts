import dotenv from 'dotenv';
dotenv.config();
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: add_bank_details_to_loans...");

        await sql`
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS bank_name TEXT,
            ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
            ADD COLUMN IF NOT EXISTS account_name TEXT;
        `;

        console.log("Migration completed: Bank details columns added.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
