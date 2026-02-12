import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables')
}

const sql = postgres(connectionString, {
    max: 20, // Max number of connections
    idle_timeout: 30, // Idle connection timeout in seconds
    connect_timeout: 10, // Connect timeout in seconds
})

export default sql