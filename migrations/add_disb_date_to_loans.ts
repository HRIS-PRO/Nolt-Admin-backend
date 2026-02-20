import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Adding disb_date to loans table...");

        await pool.query(`
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS disb_date TIMESTAMP;
        `);

        console.log("Column disb_date added successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
