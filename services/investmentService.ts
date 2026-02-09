
import sql from '../config/db.js';

interface CorporateInvestmentPayload {
    investment_type: 'NOLT_RISE' | 'NOLT_VAULT';

    // Corporate Details
    company_name: string;
    company_address: string;
    date_of_incorporation: string;
    directors_are_pep: boolean;

    // Applicant Bio-Data (Representative)
    rep_full_name: string;
    rep_phone_number: string;
    rep_bvn: string;
    rep_nin: string;
    rep_state_of_origin: string;
    rep_state_of_residence: string;
    rep_house_number: string;
    rep_street_address: string;

    // Investment Data
    investment_amount: number;
    tenure_days: number;
    currency: 'NGN' | 'USD';

    // Uploads (URLs)
    cac_url: string;
    director_1_id_url?: string;
    director_2_id_url?: string;
    rep_selfie_url: string;
    rep_id_url: string; // Applicant's ID
    memart_url?: string;
    annual_returns_url?: string;
    board_resolution_url?: string;
    aml_cft_url?: string;
    payment_receipt_url: string; // Required
    signatures: string[];
}

export const investmentService = {
    createInvestment: async (customerId: number, data: CorporateInvestmentPayload) => {
        // Enforce Minimum Tenure (90 days)
        if (data.tenure_days < 90) {
            throw new Error("Minimum investment tenure is 90 days.");
        }

        const newInvestment = await sql`
            INSERT INTO investments (
                customer_id, investment_type,
                company_name, company_address, date_of_incorporation, directors_are_pep,
                rep_full_name, rep_phone_number, rep_bvn, rep_nin, 
                rep_state_of_origin, rep_state_of_residence, rep_house_number, rep_street_address,
                investment_amount, tenure_days, currency,
                cac_url, director_1_id_url, director_2_id_url, rep_selfie_url, rep_id_url,
                memart_url, annual_returns_url, board_resolution_url, aml_cft_url,
                payment_receipt_url,
                signatures,
                status
            ) VALUES (
                ${customerId}, ${data.investment_type},
                ${data.company_name}, ${data.company_address}, ${data.date_of_incorporation}, ${data.directors_are_pep},
                ${data.rep_full_name}, ${data.rep_phone_number}, ${data.rep_bvn}, ${data.rep_nin},
                ${data.rep_state_of_origin}, ${data.rep_state_of_residence}, ${data.rep_house_number}, ${data.rep_street_address},
                ${data.investment_amount}, ${data.tenure_days}, ${data.currency},
                ${data.cac_url}, ${data.director_1_id_url || null}, ${data.director_2_id_url || null}, ${data.rep_selfie_url}, ${data.rep_id_url},
                ${data.memart_url || null}, ${data.annual_returns_url || null}, ${data.board_resolution_url || null}, ${data.aml_cft_url || null},
                ${data.payment_receipt_url},
                ${data.signatures},
                'pending'
            )
            RETURNING *
        `;

        return newInvestment[0];
    },

    getInvestmentById: async (id: number) => {
        const result = await sql`SELECT * FROM investments WHERE id = ${id}`;
        return result[0];
    },

    getUserInvestments: async (customerId: number) => {
        const result = await sql`SELECT * FROM investments WHERE customer_id = ${customerId} ORDER BY created_at DESC`;
        return result;
    }
};
