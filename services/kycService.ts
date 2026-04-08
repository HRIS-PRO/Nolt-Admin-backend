import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ZEEH_SECRET_KEY = process.env.ZEEH_SECRET_KEY;
const ZEEH_BASE_URL = process.env.ZEEH_BASE_URL || 'https://api.usezeeh.com/v1';

interface BVNData {
    bvn: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    dateOfBirth: string;
    phoneNumber1: string;
    gender: string;
}

interface ValidationResult {
    isValid: boolean;
    matches: {
        firstName: boolean;
        dob: boolean;
        phone: boolean;
    };
    matchCount: number;
    details: string;
}

interface FaceMatchResult {
    success: boolean;
    confidence: number;
    message: string;
}

export const kycService = {
    lookupBVN: async (bvn: string): Promise<BVNData | null> => {
        try {
            console.log(`[KYC Service] Looking up BVN: ${bvn}`);
            const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_bvn`, 
                { bvn },
                {
                    headers: {
                        'Secret_Key': ZEEH_SECRET_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.success) {
                return response.data.data;
            }
            return null;
        } catch (error: any) {
            console.error("[KYC Service] Lookup Error:", error.response?.data || error.message);
            throw new Error(error.response?.data?.message || "BVN lookup failed");
        }
    },

    validateBVNMatch: (userData: any, bvnData: BVNData): ValidationResult => {
        const matches = {
            firstName: false,
            dob: false,
            phone: false
        };

        // 1. First Name Match (Case-insensitive)
        if (userData.firstName && bvnData.firstName) {
            matches.firstName = userData.firstName.trim().toLowerCase() === bvnData.firstName.trim().toLowerCase();
        }

        // 2. DOB Match (YYYY-MM-DD)
        if (userData.dob && bvnData.dateOfBirth) {
            // Ensure both are in same format if possible
            const userDob = userData.dob.split('T')[0]; // Handle ISO strings
            const bvnDob = bvnData.dateOfBirth.split('T')[0];
            matches.dob = userDob === bvnDob;
        }

        // 3. Phone Match (Stripping non-digits and leading zeros/234)
        const normalizePhone = (phone: string) => {
            if (!phone) return "";
            let cleaned = phone.replace(/\D/g, '');
            if (cleaned.startsWith('234')) cleaned = cleaned.substring(3);
            if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
            return cleaned;
        };

        if (userData.mobileNumber && bvnData.phoneNumber1) {
            matches.phone = normalizePhone(userData.mobileNumber) === normalizePhone(bvnData.phoneNumber1);
        }

        const matchCount = Object.values(matches).filter(Boolean).length;
        const isValid = matchCount >= 2;

        let details = "";
        if (!isValid) {
            const missing = [];
            if (!matches.firstName) missing.push("First Name");
            if (!matches.dob) missing.push("Date of Birth");
            if (!matches.phone) missing.push("Phone Number");
            details = `Validation failed. Mismatched: ${missing.join(', ')}. Need at least 2 matches.`;
        } else {
            details = "BVN validation successful.";
        }

        return {
            isValid,
            matches,
            matchCount,
            details
        };
    },

    verifyFaceMatch: async (bvn: string, selfieUrl: string): Promise<FaceMatchResult> => {
        try {
            console.log(`[KYC Service] Verifying Face Match for BVN: ${bvn} using Advanced Lookup`);
            const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_bvn_with_face`, 
                { bvn, imageUrl: selfieUrl },
                {
                    headers: {
                        'Secret_Key': ZEEH_SECRET_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Response structure: { success: true, data: { face_data: { confidence: 99.92, status: true, ... }, ... } }
            if (response.data && response.data.success) {
                const faceData = response.data?.face_data;
                const confidence = faceData?.confidence || 0;
                const status = faceData?.status || false;

                console.log(`[KYC Service] Face Match Result: Status=${status}, Confidence=${confidence}`);

                return {
                    success: status && confidence >= 70, // Industry standard threshold
                    confidence,
                    message: (status && confidence >= 70) ? "Face verification successful" : 
                             (!status ? "Face does not match BVN record" : `Face match confidence too low (${confidence.toFixed(2)}%)`)
                };
            }
            console.warn("[KYC Service] Face Match Failed - response success was false:", response.data);
            return { success: false, confidence: 0, message: response.data?.message || "Verification failed" };
        } catch (error: any) {
            console.error("[KYC Service] Face Match API Error:", error.response?.data || error.message);
            return { success: false, confidence: 0, message: error.response?.data?.message || "Internal verification error" };
        }
    }
};
