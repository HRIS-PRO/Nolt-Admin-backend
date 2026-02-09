import 'dotenv/config';
import sql from '../config/db.js';

const migrate = async () => {
    try {
        await sql`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;
        `;
        console.log('Successfully added payment_receipt_url column to investments table');
    } catch (error) {
        console.error('Error adding column:', error);
    } finally {
        process.exit();
    }
};

migrate();
