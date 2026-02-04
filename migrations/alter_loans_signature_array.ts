
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: alter_loans_signature_array...");

        // 1. Add new column
        await sql`
            ALTER TABLE loans 
            ADD COLUMN IF NOT EXISTS signatures TEXT[];
        `;

        // 2. Migrate existing data (cast single string to array)
        // We only do this if signature_url column exists
        await sql`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'signature_url') THEN
                    UPDATE loans 
                    SET signatures = ARRAY[signature_url] 
                    WHERE signature_url IS NOT NULL AND signatures IS NULL;
                END IF;
            END $$;
        `;

        // 3. Drop old column 
        // Note: In production you might want to keep it for a while, but for this refactor we drop it.
        await sql`
            ALTER TABLE loans 
            DROP COLUMN IF EXISTS signature_url;
        `;

        console.log("Migration 'alter_loans_signature_array' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
