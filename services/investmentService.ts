import pool from '../config/db.js';
import { zeptoService } from './zeptoService.js';

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
                    company_name, business_address, date_of_incorporation, directors_are_pep,
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
                    status, payment_reference,
                    contribution_frequency, interest_rate,
                    entity_type, tin, tin_number, business_nature, 
                    is_authorized_rep, auth_rep_phone, directors, rc_number,
                    company_profile_url, status_report_url,
                    is_minor_beneficiary, guardian_confirmed,
                    is_top_up, original_investment_id, casa_account_number,
                    sales_officer_id, referral_code
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                    $29, $30,
                    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
                    'pending', $45,
                    $46, $47,
                    $48, $49, $50, $51, $52, $53, $54, $55, $56, $57,
                    $58, $59,
                    $60, $61, $62,
                    $63, $64
                )
                RETURNING *
            `;

            const values = [
                customerId, data.investment_type,
                data.company_name, data.business_address, data.incorp_date || data.date_of_incorporation, data.directors_are_pep,
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
                data.payment_reference || null,
                data.contribution_frequency || null,
                data.interest_rate || null,
                data.entity_type || 'INDIVIDUAL',
                data.tin || null,
                data.tin_number || null,
                data.business_nature || null,
                data.is_authorized_rep || false,
                data.auth_rep_phone || null,
                JSON.stringify(data.directors || []), // JSONB data
                data.rc_number || null,
                data.company_profile_url || null,
                data.status_report_url || null,
                data.is_minor_beneficiary || false,
                data.guardian_confirmed || false,
                data.is_top_up || false,
                data.original_investment_id || null,
                data.casa_account_number || null,
                null, // placeholder for sales_officer_id
                data.referral_code || null
            ];

            // 1. Referral Logic
            let assignedOfficerId = null;
            if (data.referral_code) {
                const referrerResult = await client.query('SELECT id FROM customers WHERE referral_code = $1', [data.referral_code]);
                if (referrerResult.rows[0]) {
                    assignedOfficerId = referrerResult.rows[0].id;
                }
            }

            // 2. Round Robin Logic (if no referral)
            if (!assignedOfficerId) {
                const officersResult = await client.query("SELECT id FROM customers WHERE role = 'sales_officer' AND is_active = true");
                const officers = officersResult.rows;
                if (officers.length > 0) {
                    const randomIndex = Math.floor(Math.random() * officers.length);
                    assignedOfficerId = officers[randomIndex].id;
                } else {
                    // Fallback to superadmin
                    const adminResult = await client.query("SELECT id FROM customers WHERE (role = 'super_admin' OR role = 'superadmin') AND is_active = true LIMIT 1");
                    if (adminResult.rows[0]) assignedOfficerId = adminResult.rows[0].id;
                }
            }

            // Update assigned values in array
            values[62] = assignedOfficerId;
            values[63] = data.referral_code || null;

            const result = await client.query(query, values);
            const investment = result.rows[0];

            // 3. Log Assignment Activity
            if (assignedOfficerId) {
                await client.query(
                    `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata)
                     VALUES ($1, $2, 'assignment', $3, $4)`,
                    [
                        investment.id, 
                        null, 
                        `Assigned to Sales Officer via ${data.referral_code ? 'referral code' : 'round robin'}`,
                        JSON.stringify({ sales_officer_id: assignedOfficerId, referral_code: data.referral_code || null })
                    ]
                );

                try {
                    const notifyData = await client.query(`
                        SELECT c.full_name as customer_name, s.email as officer_email 
                        FROM customers c, customers s 
                        WHERE c.id = $1 AND s.id = $2
                    `, [customerId, assignedOfficerId]);
                    
                    if (notifyData.rows.length > 0) {
                        const { customer_name, officer_email } = notifyData.rows[0];
                        await zeptoService.sendInvestmentNotification([officer_email], investment.id, customer_name, 'Assigned to you');
                    }
                } catch (emailErr) {
                    console.warn("Failed to notify assigned officer (investmentService):", emailErr);
                }
            }

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
        const result = await pool.query(`
            SELECT i.*, 
                   c.full_name as customer_name, c.email as customer_email,
                   ig.id as gift_id, ig.gift_message, ig.gift_amount,
                   gc.full_name as gifter_name
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN investment_gifts ig ON i.id = ig.investment_id
            LEFT JOIN customers gc ON ig.gifter_id = gc.id
            WHERE i.id = $1
        `, [id]);
        return result.rows[0];
    },

    getUserInvestments: async (customerId: number) => {
        const result = await pool.query('SELECT * FROM investments WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]);
        return result.rows;
    },

    getAllInvestments: async (officerId?: number) => {
        let query = `
            SELECT i.*, 
                   c.full_name as customer_name, c.email as customer_email,
                   CASE WHEN ig.id IS NOT NULL THEN true ELSE false END as is_gift,
                   gc.full_name as gifter_name,
                   staff.full_name as officer_name, staff.email as officer_email
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN customers staff ON i.sales_officer_id = staff.id
            LEFT JOIN investment_gifts ig ON i.id = ig.investment_id
            LEFT JOIN customers gc ON ig.gifter_id = gc.id
        `;
        let values: any[] = [];
        
        if (officerId) {
            query += ` WHERE i.sales_officer_id = $1`;
            values.push(officerId);
        }
        
        query += ` ORDER BY i.created_at DESC`;

        const result = await pool.query(query, values);
        return result.rows;
    }
};
