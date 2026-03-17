import pool from '../config/db.js';

export interface YieldRate {
    id?: number;
    plan_name: string;
    currency: string;
    tenure_months: number;
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
            AND min_amount = $3 
            AND interest_rate = $4
        `;
        const values: any[] = [data.plan_name, data.currency, data.min_amount, data.interest_rate];

        if (data.max_amount === null || data.max_amount === undefined) {
            query += ` AND max_amount IS NULL`;
        } else {
            query += ` AND max_amount = $5`;
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
            INSERT INTO yield_rates (plan_name, currency, tenure_months, min_amount, max_amount, interest_rate)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const values = [
            data.plan_name,
            data.currency,
            data.tenure_months,
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
                tenure_months = COALESCE($3, tenure_months),
                min_amount = COALESCE($4, min_amount),
                max_amount = $5, -- Allow explicit NULL for infinity
                interest_rate = COALESCE($6, interest_rate),
                is_active = COALESCE($7, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *;
        `;
        const values = [
            data.plan_name,
            data.currency,
            data.tenure_months,
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
        const query = `SELECT * FROM yield_rates WHERE is_active = TRUE ORDER BY tenure_months ASC;`;
        const result = await pool.query(query);
        return result.rows;
    }
};
