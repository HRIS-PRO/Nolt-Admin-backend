import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import sql from './db.js';

interface Customer {
    id: number;
    google_id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    new_comer: boolean;
    role: string;
    password_hash?: string;
    otp_secret?: string;
    manager_id?: number;
    team_id?: string;
    is_active?: boolean;
}

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const users = await sql<Customer[]>`SELECT * FROM customers WHERE email = ${email} LIMIT 1`;

        if (users.length === 0) {
            return done(null, false, { message: 'Incorrect email.' });
        }

        const user = users[0];

        if (!user.password_hash) {
            return done(null, false, { message: 'Please login with Google.' });
        }

        if (user.is_active === false) {
            return done(null, false, { message: 'Account is deactivated.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return done(null, false, { message: 'Incorrect password.' });
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    // CRITICAL: Must point to the FRONTEND (Proxy) URL so the cookie is set on the frontend domain
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "https://nolt-finance.vercel.app/auth/google/callback"
},
    async (accessToken, refreshToken, profile, cb) => {
        try {
            const googleId = profile.id;
            const email = profile.emails?.[0].value;
            const fullName = profile.displayName || '';
            const avatarUrl = profile.photos?.[0].value || '';

            if (!email) {
                return cb(new Error("No email found from Google"), undefined);
            }

            // Check if customer exists
            const existingCustomers = await sql<Customer[]>`
            SELECT * FROM customers WHERE google_id = ${googleId} OR email = ${email} LIMIT 1
        `;

            if (existingCustomers.length > 0) {
                // User exists
                return cb(null, existingCustomers[0]);
            } else {
                // Create new customer
                const newCustomers = await sql<Customer[]>`
                INSERT INTO customers (google_id, email, full_name, avatar_url, new_comer, role)
                VALUES (${googleId}, ${email}, ${fullName}, ${avatarUrl}, ${true}, 'customer')
                RETURNING *
            `;
                return cb(null, newCustomers[0]);
            }

        } catch (err: any) {
            return cb(err, undefined);
        }
    }
));

passport.serializeUser((user: any, done) => {
    console.log("DEBUG: serializeUser", user.id);
    done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
    console.log(`DEBUG: deserializeUser called for ID: ${id}`);
    try {
        const users = await sql<Customer[]>`SELECT * FROM customers WHERE id = ${id}`;
        if (users.length > 0) {
            console.log(`DEBUG: deserializeUser success for ID: ${id}`);
            done(null, users[0]);
        } else {
            console.log(`DEBUG: deserializeUser - user not found for ID: ${id}`);
            // If user is removed from DB but session exists, we should probably invalid the session, 
            // but for now just return null/false user
            done(null, false);
        }
    } catch (err) {
        console.error(`DEBUG: deserializeUser/SQL error for ID: ${id}`, err);
        done(err, null);
    }
});
