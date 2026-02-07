import 'dotenv/config';
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: create_investment_documents_table...");

        await sql`
            CREATE TABLE IF NOT EXISTS investment_documents (
                id SERIAL PRIMARY KEY,
                investment_id INTEGER REFERENCES investments(id) ON DELETE CASCADE,
                draft_id VARCHAR(50), -- To link files before submission
                
                document_type TEXT NOT NULL,
                file_url TEXT NOT NULL,
                file_path TEXT NOT NULL, -- Supabase path
                file_name TEXT,
                mime_type TEXT,
                size_bytes BIGINT,
                
                uploaded_by_user_id INTEGER REFERENCES customers(id),
                is_staff_upload BOOLEAN DEFAULT FALSE,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log("Table 'investment_documents' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
