import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    try {
        console.log("Starting DB migration for promotions schema...");
        
        const constraintRes = await pool.query(`
            SELECT constraint_name 
            FROM information_schema.key_column_usage 
            WHERE table_name = 'promotions' AND column_name = 'utm_campaign'
        `);

        if (constraintRes.rows.length > 0) {
            const constraintName = constraintRes.rows[0].constraint_name;
            console.log("Dropping existing unique constraint:", constraintName);
            await pool.query(`ALTER TABLE promotions DROP CONSTRAINT "${constraintName}"`);
        } else {
            console.log("No unique constraint found on utm_campaign alone, proceeding...");
        }

        console.log("Adding composite unique index...");
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS promotions_composite_uniq_idx 
            ON promotions (utm_campaign, COALESCE(utm_medium, ''), COALESCE(utm_source, ''), target_product);
        `);

        console.log("Migration completed successfully.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
