
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: create_loan_documents_table...");

        await sql`
            CREATE TABLE IF NOT EXISTS loan_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE,
                
                document_type TEXT NOT NULL, -- e.g. 'govt_id', 'bank_statement', 'other'
                
                file_url TEXT NOT NULL,      -- The Supabase URL
                file_path TEXT NOT NULL,     -- The internal storage path (for deletion)
                file_name TEXT,              -- Original filename
                mime_type TEXT,              -- 'application/pdf', 'image/png'
                size_bytes INTEGER,
                
                uploaded_by_user_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                is_staff_upload BOOLEAN DEFAULT FALSE,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create an index for faster lookups by loan_id
        await sql`CREATE INDEX IF NOT EXISTS idx_loan_documents_loan_id ON loan_documents(loan_id);`;

        console.log("Table 'loan_documents' created successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
