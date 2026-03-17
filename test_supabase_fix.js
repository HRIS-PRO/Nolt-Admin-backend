import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function testSupabaseCorrectUser() {
    console.log("Testing connection with Suspected Correct Supabase User Format...");

    // Most likely: postgres.[PROJECT_REF]
    const client = new Client({
        user: 'postgres.ktokxkwoeulbqzajocgm',
        host: '3.71.38.119',
        database: 'postgres',
        password: 'noltfinance123$',
        port: 5432,
        ssl: { rejectUnauthorized: false }, // Supabase usually requires SSL
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log("Success: Connected with corrected user!");
        const res = await client.query('SELECT NOW()');
        console.log("Result:", res.rows[0]);
        await client.end();
    } catch (err) {
        console.error("Failed with corrected user:", err.message);

        // Try one more: maybe the IP is wrong too and we should use the Supabase host?
        console.log("\nTrying with Supabase Host (aws-0-eu-central-1.pooler.supabase.com)...");
        const client2 = new Client({
            user: 'postgres.ktokxkwoeulbqzajocgm',
            host: 'db.ktokxkwoeulbqzajocgm.supabase.co',
            database: 'postgres',
            password: 'noltfinance123$',
            port: 5432,
            ssl: { rejectUnauthorized: false },
        });

        try {
            await client2.connect();
            console.log("Success: Connected with Supabase Host!");
            await client2.end();
        } catch (err2) {
            console.error("Failed with Supabase Host:", err2.message);
        }
    }
}

testSupabaseCorrectUser();
