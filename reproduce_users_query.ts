import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

async function testQuery() {
    try {
        console.log("Running query...");
        const users = await sql`
            SELECT 
                c.id, c.email, c.full_name, c.role, c.is_active, c.created_at, 
                c.avatar_url, c.referral_code,
                m.full_name as manager_name
            FROM customers c
            LEFT JOIN customers m ON c.manager_id = m.id
            ORDER BY c.created_at DESC
        `;
        console.log("Query success! Found customers:", users.length);
        console.log(users[0]);
    } catch (error) {
        console.error("Query failed:", error);
    } finally {
        // await sql.end(); // postgres.js handles connection, usually process.exit closes it
        process.exit(0);
    }
}

testQuery();
