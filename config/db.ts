import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables')
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Always use SSL for remote DBs (Railway/Neon)
    max: 20, // Shared pool for the entire application (Session + App)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export default pool;