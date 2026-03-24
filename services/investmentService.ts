
import pool from '../config/db.js';

interface CorporateInvestmentPayload {
    investment_type: 'NOLT_RISE' | 'NOLT_VAULT' | 'NOLT_SURGE';

    // ... (Bio/Corporate fields)
    [key: string]: any;
}

export const investmentService = {
    createInvestment: async (customerId: number, data: any, giftToken?: string) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO investments (
                    customer_id, investment_type,
                    company_name, company_address, date_of_incorporation, directors_are_pep,
                    rep_full_name, rep_phone_number, rep_bvn, rep_nin, 
                    rep_state_of_origin, rep_state_of_residence, rep_house_number, rep_street_address,
                    investment_amount, tenure_days, currency,
                    cac_url, director_1_id_url, director_2_id_url, rep_selfie_url, rep_id_url,
                    secondary_id_url, utility_bill_url,
                    memart_url, annual_returns_url, board_resolution_url, aml_cft_url,
                    payment_receipt_url,
                    signatures,
                    title, gender, dob, mother_maiden_name, religion, marital_status,
                    is_on_behalf, representative_relation, is_pep,
                    nok_name, nok_relationship, nok_address,
                    target_amount, rollover_option,
                    status, payment_reference
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                    $29, $30,
                    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
                    'pending', $45
                )
                RETURNING *
            `;

            const values = [
                customerId, data.investment_type,
                data.company_name, data.company_address, data.date_of_incorporation, data.directors_are_pep,
                data.rep_full_name, data.rep_phone_number, data.rep_bvn, data.rep_nin,
                data.rep_state_of_origin, data.rep_state_of_residence, data.rep_house_number, data.rep_street_address,
                data.investment_amount, data.tenure_days, data.currency,
                data.cac_url, data.director_1_id_url || null, data.director_2_id_url || null, data.rep_selfie_url, data.rep_id_url,
                data.secondary_id_url || null, data.utility_bill_url || null,
                data.memart_url || null, data.annual_returns_url || null, data.board_resolution_url || null, data.aml_cft_url || null,
                data.payment_receipt_url,
                data.signatures, // Pass as array directly for TEXT[]
                data.title || null,
                data.gender || null,
                data.dob || null,
                data.mother_maiden_name || null,
                data.religion || null,
                data.marital_status || null,
                data.is_on_behalf || false,
                data.representative_relation || null,
                data.is_pep || false,
                data.nok_name || null,
                data.nok_relationship || null,
                data.nok_address || null,
                data.target_amount || null,
                data.rollover_option || null,
                data.payment_reference || null
            ];

            const result = await client.query(query, values);
            const investment = result.rows[0];

            // Link draft documents if draft_id is provided
            if (data.draft_id) {
                await client.query(
                    `UPDATE investment_documents SET investment_id = $1 WHERE draft_id = $2`,
                    [investment.id, data.draft_id]
                );
            }

            if (giftToken) {
                await client.query(
                    `UPDATE investment_gifts SET status = 'claimed', investment_id = $1 WHERE gift_token = $2`,
                    [investment.id, giftToken]
                );
            }

            await client.query('COMMIT');
            return investment;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    getInvestmentById: async (id: number) => {
        const result = await pool.query('SELECT * FROM investments WHERE id = $1', [id]);
        return result.rows[0];
    },

    getUserInvestments: async (customerId: number) => {
        const result = await pool.query('SELECT * FROM investments WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]);
        return result.rows;
    },

    getAllInvestments: async () => {
        const result = await pool.query(`
            SELECT i.*, c.full_name as customer_name, c.email as customer_email 
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            ORDER BY i.created_at DESC
        `);
        return result.rows;
    }
};
