
// import { termiiService } from './termiiService.js';
import { resendService } from './resendService.js';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'resend'; // Default to resend

console.log(`[EmailService] Using provider: ${EMAIL_PROVIDER}`);

export const emailService = {
    /**
     * Sends an Email Token/OTP using the configured provider
     */
    sendEmailToken: async (emailAddress: string, token: string) => {
        // if (EMAIL_PROVIDER === 'resend') {
        return await resendService.sendEmailToken(emailAddress, token);
        // } else {
        //     return await termiiService.sendEmailToken(emailAddress, token);
        // }
    }
};
