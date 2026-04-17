import pool from '../config/db.js';

export interface YieldRate {
    id?: number;
    plan_name: string;
    currency: string;
    contribution_frequency: string;
    tenure_days: number;
    min_amount: number;
    max_amount: number | null;
    interest_rate: number;
    is_active?: boolean;
    created_at?: Date;
    updated_at?: Date;
}

export const yieldRateService = {
    async checkDuplicate(data: Partial<YieldRate>, excludeId: number | null = null) {
        let query = `
            SELECT id FROM yield_rates 
            WHERE plan_name = $1 
            AND currency = $2 
            AND contribution_frequency = $3
            AND min_amount = $4 
            AND interest_rate = $5
        `;
        const values: any[] = [data.plan_name, data.currency, data.contribution_frequency, data.min_amount, data.interest_rate];

        if (data.max_amount === null || data.max_amount === undefined) {
            query += ` AND max_amount IS NULL`;
        } else {
            query += ` AND max_amount = $6`;
            values.push(data.max_amount);
        }

        if (excludeId) {
            query += ` AND id != $${values.length + 1}`;
            values.push(excludeId);
        }

        const result = await pool.query(query, values);
        return result.rows.length > 0;
    },

    async createRate(data: Partial<YieldRate>) {
        const query = `
            INSERT INTO yield_rates (plan_name, currency, contribution_frequency, tenure_days, min_amount, max_amount, interest_rate)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [
            data.plan_name,
            data.currency,
            data.contribution_frequency,
            data.tenure_days,
            data.min_amount,
            data.max_amount,
            data.interest_rate
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async getAllRates() {
        const query = `SELECT * FROM yield_rates ORDER BY created_at DESC;`;
        const result = await pool.query(query);
        return result.rows;
    },

    async getRateById(id: number) {
        const query = `SELECT * FROM yield_rates WHERE id = $1;`;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    async updateRate(id: number, data: Partial<YieldRate>) {
        const query = `
            UPDATE yield_rates
            SET plan_name = COALESCE($1, plan_name),
                currency = COALESCE($2, currency),
                contribution_frequency = COALESCE($3, contribution_frequency),
                tenure_days = COALESCE($4, tenure_days),
                min_amount = COALESCE($5, min_amount),
                max_amount = $6, -- Allow explicit NULL for infinity
                interest_rate = COALESCE($7, interest_rate),
                is_active = COALESCE($8, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *;
        `;
        const values = [
            data.plan_name,
            data.currency,
            data.contribution_frequency,
            data.tenure_days,
            data.min_amount,
            data.max_amount,
            data.interest_rate,
            data.is_active,
            id
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async deleteRate(id: number) {
        const query = `DELETE FROM yield_rates WHERE id = $1 RETURNING *;`;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    async getActiveRates() {
        const query = `SELECT * FROM yield_rates WHERE is_active = TRUE ORDER BY tenure_days ASC;`;
        const result = await pool.query(query);
        return result.rows;
    },

    async calculateRate(params: { plan_name: string, currency: string, contribution_frequency: string, amount: number, tenure_days: number }) {
        const query = `
            SELECT * FROM yield_rates 
            WHERE (plan_name ILIKE '%' || $1 || '%')
            AND currency = $2 
            AND contribution_frequency = $3
            AND tenure_days >= $4 
            AND is_active = TRUE
            AND $5 >= min_amount 
            AND (max_amount IS NULL OR $5 <= max_amount)
            ORDER BY tenure_days ASC, created_at DESC 
            LIMIT 1;
        `;
        const values = [params.plan_name, params.currency, params.contribution_frequency, params.tenure_days, params.amount];
        const result = await pool.query(query, values);
        return result.rows[0];
    }
};;
