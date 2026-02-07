// Termii Service - DISABLED
// This service has been disabled to prevent any usage.

export const termiiService = {
    sendEmailToken: async (emailAddress: string, otpCode: string): Promise<any> => {
        console.error("CRITICAL ERROR: Attempted to use Termii Service while it is disabled.");
        throw new Error("Termii Service is DISABLED. Please use Resend.");
    }
};

/*
import axios from 'axios';
import dotenv from 'dotenv';
... (rest of original code commented out) ...
*/