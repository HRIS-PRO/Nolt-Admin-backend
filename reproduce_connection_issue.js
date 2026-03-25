import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

console.log("Testing connection with settings:");
console.log(`URL provided: ${!!connectionString}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`SSL Setting: ${process.env.NODE_ENV === 'production' ? '{ rejectUnauthorized: false }' : 'false'}`);

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
});

async function testConfig() {
    try {
        console.log("Attempting to connect...");
        const client = await pool.connect();
        console.log("Connected successfully!");
        const res = await client.query('SELECT NOW()');
        console.log("Query result:", res.rows[0]);
        client.release();
        await pool.end();
        console.log("Pool ended.");
    } catch (err) {
        console.error("Connection failed:", err);
    }
}

testConfig();
