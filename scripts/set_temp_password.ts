import sql from '../config/db.js';
import bcrypt from 'bcrypt';

async function setSuperAdminPassword() {
    const email = 'exceldistrings@gmail.com';
    const password = 'password123';

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await sql`
            UPDATE customers 
            SET password_hash = ${hashedPassword}
            WHERE email = ${email}
        `;

        console.log(`Password set for ${email}`);
        process.exit(0);

    } catch (error) {
        console.error("Error setting password:", error);
        process.exit(1);
    }
}

setSuperAdminPassword();
