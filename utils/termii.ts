
import axios from 'axios';

const TERMII_BASE_URL = 'https://api.ng.termii.com';
const DUMMY_API_KEY = 'termii-api-key-dummy';
const DUMMY_EMAIL_CONFIG_ID = 'email-config-id-dummy';

interface SendEmailTokenParams {
    email_address: string;
    code: string;
    api_key?: string;
    email_configuration_id?: string;
}

export const sendEmailToken = async (params: SendEmailTokenParams) => {
    try {
        const payload = {
            api_key: params.api_key || process.env.TERMII_API_KEY || DUMMY_API_KEY,
            email_address: params.email_address,
            code: params.code,
            email_configuration_id: params.email_configuration_id || process.env.TERMII_EMAIL_CONFIG_ID || DUMMY_EMAIL_CONFIG_ID
        };

        const response = await axios.post(`${TERMII_BASE_URL}/api/email/otp/send`, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log("Termii Email Sent:", response.data);
        return response.data;
    } catch (error) {
        console.error("Error sending Termii email:", error);
        throw error;
    }
};
