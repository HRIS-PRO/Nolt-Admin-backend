import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import './config/passport.js'; // Import passport config
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';

import cors from 'cors';

const app = express();
const port = process.env.PORT || 5000;

// CORS - Allow all origins with credentials
// CORS - Allow specific origin for security
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'https://nolt-finance.vercel.app'], // Exact match required for credentials
    credentials: true
}));

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Session: ${req.sessionID} - User: ${req.user ? (req.user as any).id : 'Guest'}`);
    next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
declare module 'express-session' {
    interface SessionData {
        otp_verified?: boolean;
        passport?: {
            user: number;
        }
    }
}

// Enable Trust Proxy (Required for Railway/Vercel)
app.set('trust proxy', 1);

import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';

const PgSession = connectPgSimple(session);
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(session({
    store: new PgSession({
        pool: pool,
        createTableIfMissing: true,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false, // Don't save empty sessions
    proxy: true, // Required for secure cookies behind proxy
    cookie: {
        secure: true, // Required for SameSite: None. Vercel/Railway are HTTPS.
        sameSite: 'none', // Required for cross-origin (Vercel -> Railway)
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import staffRoutes from './routes/staff.js';
import otpRoutes from './routes/auth_otp.js';
import uploadRoutes from './routes/upload.js';
import statsRoutes from './routes/stats.js';

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Nolt Admin Backend API" });
});

app.use('/auth', authRoutes);
app.use('/auth/otp', otpRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/upload', uploadRoutes); // Register upload route
app.use('/api/stats', statsRoutes); // Register stats route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api', customerRoutes);

import { resendService } from './services/resendService.js';
app.post('/test/email', async (req, res) => {
    try {
        const { email, otp, message } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }
        // Use 'otp' or 'message' field as the code
        const code = otp || message; // Fallback to message for backward compatibility with user's previous curl

        if (!code) {
            return res.status(400).json({ error: "OTP code is required" });
        }

        const response = await resendService.sendEmailToken(email, code);
        res.json({ success: true, data: response });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
