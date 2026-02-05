import dotenv from 'dotenv';
dotenv.config();

const runMigration = async () => {
    try {
        console.log("Running migration: add_status_column_to_loans...");

        // Dynamic import to ensure env vars are loaded first
        const { default: sql } = await import('../config/db.js');

        await sql`
            ALTER TABLE loans 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
        `;

        // Update existing rows to have 'pending' status if they are null (though default handles new ones)
        await sql`
            UPDATE loans SET status = 'pending' WHERE status IS NULL;
        `;

        console.log("Migration completed: 'status' column added to 'loans' table.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
