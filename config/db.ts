import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const connectionTimeoutMillis = connectionString?.includes('pooler') ? 30000 : 10000;

const pool = new Pool({
    connectionString,
    ssl: connectionString?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
});

// Handle idle connection errors
pool.on('error', (err) => {
    console.error('[DB POOL] Unexpected error:', err);
});

export default pool;
