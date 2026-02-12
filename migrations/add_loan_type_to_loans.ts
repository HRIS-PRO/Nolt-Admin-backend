import sql from '../config/db.js';

export async function up() {
    await sql`
        ALTER TABLE loans 
        ADD COLUMN IF NOT EXISTS loan_type TEXT DEFAULT 'new';
    `;
}

export async function down() {
    await sql`
        ALTER TABLE loans 
        DROP COLUMN IF EXISTS loan_type;
    `;
}

up();