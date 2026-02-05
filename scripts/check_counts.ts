import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        // Dynamic import to ensure env vars are loaded first
        const { default: sql } = await import('../config/db.js');

        const loans = await sql`SELECT count(*) FROM loans`;
        const customers = await sql`SELECT count(*) FROM customers`;
        console.log(`Loans: ${loans[0].count}`);
        console.log(`Customers: ${customers[0].count}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
