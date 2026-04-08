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

/**
 * Normalizes dates from various formats (e.g., "01-April-2002" or ISO) to YYYY-MM-DD
 */
const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return "";
    
    // Standard ISO format check
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split('T')[0];
    }

    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) {
        console.warn(`[KYC Service] Failed to normalize date: ${dateStr}`);
    }
    
    return dateStr.toLowerCase().trim();
};

/**
 * Normalizes phone numbers for comparison
 */
const normalizePhone = (phone: string): string => {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('234')) cleaned = cleaned.substring(3);
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    return cleaned;
};

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

        // 2. DOB Match with normalization
        const userDob = normalizeDate(userData.dob);
        const bvnDob = normalizeDate(bvnData.dateOfBirth);
        
        if (userDob && bvnDob) {
            matches.dob = userDob === bvnDob;
        }

        // 3. Phone Match
        if (userData.mobileNumber && bvnData.phoneNumber1) {
            matches.phone = normalizePhone(userData.mobileNumber) === normalizePhone(bvnData.phoneNumber1);
        }

        const matchCount = Object.values(matches).filter(Boolean).length;
        const isValid = matchCount >= 2;

        let details = "";
        if (!isValid) {
            const missing = [];
            if (!matches.firstName) missing.push("First Name");
            if (!matches.dob) missing.push(`Date of Birth (${userDob} vs ${bvnDob})`);
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

            // Robust data extraction
            const body = response.data;
            if (body && (body.success === true || body.statusCode === 200 || body.response_code === "00")) {
                const data = body.data || {};
                const faceData = data.face_data || data.faceData || {};
                
                // Handle different status formats (boolean, string "true", or code "00")
                const status = faceData.status === true || faceData.status === "true" || faceData.response_code === "00";
                const confidence = parseFloat(faceData.confidence) || 0;

                console.log(`[KYC Service] Face Match Result: Status=${status}, Confidence=${confidence}`);

                if (status && confidence >= 70) {
                    return {
                        success: true,
                        confidence,
                        message: "Face verification successful"
                    };
                } else if (status) {
                    return {
                        success: false,
                        confidence,
                        message: `Face match confidence too low (${confidence.toFixed(2)}%). Please use a clearer selfie.`
                    };
                } else {
                    return {
                        success: false,
                        confidence,
                        message: "Face does not match BVN record. Please ensure you are the owner of the BVN."
                    };
                }
            }
            
            console.warn("[KYC Service] Face Match Failed - Unexpected Response Structure:", body);
            return { 
                success: false, 
                confidence: 0, 
                message: body?.message || "Verification service returned an error. Please try again later." 
            };
        } catch (error: any) {
            console.error("[KYC Service] Face Match API Error:", error.response?.data || error.message);
            return { 
                success: false, 
                confidence: 0, 
                message: error.response?.data?.message || "Verification service is currently unavailable. Please try again later." 
            };
        }
    }
};
