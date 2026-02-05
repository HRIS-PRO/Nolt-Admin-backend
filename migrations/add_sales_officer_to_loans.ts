import dotenv from 'dotenv';
dotenv.config();

const runMigration = async () => {
    try {
        console.log("Running migration: add_sales_officer_to_loans...");

        // Dynamic import to ensure env vars are loaded first
        const { default: sql } = await import('../config/db.js');

        await sql`
            ALTER TABLE loans 
            ADD COLUMN IF NOT EXISTS sales_officer_id INTEGER REFERENCES customers(id);
        `;

        console.log("Migration completed: 'sales_officer_id' column added to 'loans' table.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
