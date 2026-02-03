import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables')
}

const sql = postgres(connectionString)

export default sql