
import axios from 'axios';

const ZEEH_SECRET_KEY = 'pv_OQVl9JAIXxgQoQrW4skdwO2zG';
const ZEEH_BASE_URL = 'https://api.usezeeh.com/v1';

async function lookupBVN() {
    try {
        const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_bvn_with_phone`, 
            { phoneNumber: '08107891549' },
            {
                headers: {
                    'Secret_Key': ZEEH_SECRET_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Success:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
    }
}

lookupBVN();
