import express from 'express';
import session from 'express-session';
import passport from 'passport';
import './config/passport.js'; // Import passport config
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
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

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Nolt Admin Backend API" });
});

app.use('/auth', authRoutes);
app.use('/api', customerRoutes);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
