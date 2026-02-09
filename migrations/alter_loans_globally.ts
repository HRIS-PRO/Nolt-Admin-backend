import 'dotenv/config';
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: alter_loans_globally...");

        await sql`
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS surname TEXT,
            ADD COLUMN IF NOT EXISTS first_name TEXT,
            ADD COLUMN IF NOT EXISTS middle_name TEXT,
            ADD COLUMN IF NOT EXISTS work_id_url TEXT,
            ADD COLUMN IF NOT EXISTS payslip_url TEXT;
        `;
        console.log("Table 'loans' altered successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
