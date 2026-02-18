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
    origin: function (origin, callback) {
        console.log("Incoming Origin:", origin);
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allowed origins
        const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'https://lms.noltfinance.com'];

        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Global Request Logger


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
import pool from './config/db.js'; // Use shared pool

const PgSession = connectPgSimple(session);
// Pool is now imported from config/db.ts

// Determine if we are in production
const isProduction = process.env.NODE_ENV === 'production' ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_STATIC_URL ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN;

console.log("----------------------------------------------------------------");
console.log(`Environment Check:`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT}`);
console.log(`RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN}`);
console.log(`isProduction (Calculated): ${isProduction}`);
console.log("----------------------------------------------------------------");

app.use(session({
    store: new PgSession({
        pool: pool,
        createTableIfMissing: true,
        tableName: 'user_sessions'
    }),
    name: 'nolt_admin_sid', // Rename to avoid zombie cookies
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false, // Don't save empty sessions
    proxy: true, // Required for secure cookies behind proxy
    cookie: {
        secure: isProduction, // true in prod (Requires HTTPS), false in dev
        sameSite: 'lax', // Now that we use Vercel Rewrites, it's same-origin!
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Global Request Logger (Moved after session/passport to log actual user state)
app.use((req, res, next) => {
    const user = req.user as any;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log(`\tSession ID: ${req.sessionID}`);
    console.log(`\tUser: ${user ? `${user.id} (${user.email})` : 'Guest'}`);
    console.log(`\tCookie: ${req.headers.cookie ? 'Present' : 'Missing'}`);
    if (req.headers.cookie) {
        // Only log the connect.sid part for security/brevity in prod logs if needed, but full cookie is useful for debug
        console.log(`\tFull Cookie: ${req.headers.cookie}`);
    }
    console.log(`\tProtocol: ${req.protocol}`);
    console.log(`\tSecure: ${req.secure}`);
    console.log(`\tX-Forwarded-Proto: ${req.headers['x-forwarded-proto']}`);
    next();
});

// Routes
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import staffRoutes from './routes/staff.js';
import otpRoutes from './routes/auth_otp.js';
import uploadRoutes from './routes/upload.js';
import statsRoutes from './routes/stats.js';
import miscRoutes from './routes/misc.js';

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Nolt Admin Backend API" });
});

app.use('/auth', authRoutes);
app.use('/auth/otp', otpRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/upload', uploadRoutes); // Register upload route
app.use('/api/stats', statsRoutes); // Register stats route
app.use('/api/misc', miscRoutes); // Register misc (banks) route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api', customerRoutes);
import investmentRoutes from './routes/investment.js';
app.use('/api/investments', investmentRoutes);

import { zeptoService as resendService } from './services/zeptoService.js';

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

import { startCronJobs } from './services/cronService.js';

import { createServer } from 'http';
import { initSocket } from './socket.js';

const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

httpServer.listen(port, () => {
    // Start Cron Jobs
    startCronJobs();

    // Re-calculate simply for logging or move variable scope up if needed, but here simple calc is fine
    const isProdForLog = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}, Railway: ${!!process.env.RAILWAY_ENVIRONMENT}`);
    console.log(`Cookie Settings: Secure=${isProdForLog}, SameSite=${isProdForLog ? 'none' : 'lax'}`);
});
