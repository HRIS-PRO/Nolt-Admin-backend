import 'dotenv/config';
import postgres from 'postgres';

async function testPostgresJS() {
    console.log("Testing with 'postgres' (js-buy) package...");
    const sql = postgres(process.env.DATABASE_URL, {
        timeout: 10,
        connect_timeout: 10,
    });

    try {
        const result = await sql`SELECT NOW()`;
        console.log("Success with 'postgres' package!");
        console.log("Result:", result[0]);
    } catch (err) {
        console.error("Failed with 'postgres' package:", err);
    } finally {
        await sql.end();
    }
}

testPostgresJS();
