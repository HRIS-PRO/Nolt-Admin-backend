import 'dotenv/config';
import sql from '../config/db.js';

async function migrate() {
    try {
        console.log("Adding product_type column to loans...");
        await sql`
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS product_type VARCHAR(255) DEFAULT 'Public Sector Loan';
        `;

        console.log("Backfilling existing loans...");
        await sql`
            UPDATE loans
            SET product_type = 'Public Sector Loan'
            WHERE product_type IS NULL OR product_type = '';
        `;

        console.log("Migration successful: product_type added and backfilled.");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        process.exit();
    }
}

migrate();
