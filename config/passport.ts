import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import pool from './db.js';

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
        const result = await pool.query('SELECT * FROM customers WHERE email = $1 LIMIT 1', [email]);

        if (result.rows.length === 0) {
            return done(null, false, { message: 'Incorrect email.' });
        }

        const user = result.rows[0];

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
            const existingUserResult = await pool.query(
                'SELECT * FROM customers WHERE google_id = $1 OR email = $2 LIMIT 1',
                [googleId, email]
            );

            if (existingUserResult.rows.length > 0) {
                // User exists
                const user = existingUserResult.rows[0];
                if (user.is_active === false) {
                    // Check if there is a way to pass error message to callback in Google Strategy
                    // Usually cb(null, false, { message: ... }) works if passport-google-oauth20 supports it, 
                    // but unlike local, the failure handling might be different.
                    // However, passing false usually triggers failureRedirect. 
                    // We might want to pass an error if we want to show a specific message, or handle it in the callback.
                    return cb(null, false);
                }
                return cb(null, user);
            } else {
                // Create new customer
                const newUserResult = await pool.query(
                    `INSERT INTO customers (google_id, email, full_name, avatar_url, new_comer, role)
                     VALUES ($1, $2, $3, $4, $5, 'customer')
                     RETURNING *`,
                    [googleId, email, fullName, avatarUrl, true] // new_comer = true
                );
                return cb(null, newUserResult.rows[0]);
            }

        } catch (err: any) {
            return cb(err, undefined);
        }
    }
));

passport.serializeUser((user: any, done) => {
    // console.log("DEBUG: serializeUser", user.id);
    done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
    // console.log(`DEBUG: deserializeUser called for ID: ${id}`);
    try {
        const result = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            // console.log(`DEBUG: deserializeUser success for ID: ${id}`);
            done(null, result.rows[0]);
        } else {
            // console.log(`DEBUG: deserializeUser - user not found for ID: ${id}`);
            done(null, false);
        }
    } catch (err) {
        // console.error(`DEBUG: deserializeUser/SQL error for ID: ${id}`, err);
        done(err, null);
    }
});
