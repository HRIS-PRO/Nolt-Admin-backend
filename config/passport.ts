import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import sql from './db.js';

interface Customer {
    id: number;
    google_id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    new_comer: boolean;
}

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    callbackURL: "/auth/google/callback"
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
                INSERT INTO customers (google_id, email, full_name, avatar_url, new_comer)
                VALUES (${googleId}, ${email}, ${fullName}, ${avatarUrl}, ${true})
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
    done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
    try {
        const users = await sql<Customer[]>`SELECT * FROM customers WHERE id = ${id}`;
        if (users.length > 0) {
            done(null, users[0]);
        } else {
            done(new Error("User not found"), null);
        }
    } catch (err) {
        done(err, null);
    }
});
