require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool();
pool.query('SELECT id, stage, loan_type, status FROM loans WHERE stage NOT IN (\'submitted\',\'sales\',\'customer_experience\',\'credit_check_1\',\'credit_check_2\',\'internal_audit\',\'finance\',\'disbursed\',\'rejected\')', (err, res) => {
    if (err) console.error(err);
    else console.log(res.rows);
    pool.end();
});
