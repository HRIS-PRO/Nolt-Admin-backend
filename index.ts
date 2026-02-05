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
// CORS - Allow all origins with credentials
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

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

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Set to true in production (HTTPS)
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Nolt Admin Backend API" });
});

app.use('/auth', authRoutes);
app.use('/auth/otp', otpRoutes);
app.use('/staff', staffRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api', customerRoutes);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
