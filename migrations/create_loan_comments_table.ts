import dotenv from 'dotenv';
dotenv.config();
import sql from '../config/db.js';

async function createTable() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS loan_comments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                comment TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        console.log("Table 'loan_comments' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error creating table:", error);
        process.exit(1);
    }
}

createTable();
