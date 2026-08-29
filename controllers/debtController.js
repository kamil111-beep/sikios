// Manajemen hutang supplier dan cicilan.
const pool = require('../config/database');

/**
 * Get Daftar Hutang Supplier beserta histori pembayaran
 */
exports.getDebts = async (req, res) => {
    try {
        const [debts] = await pool.query(`
            SELECT d.*, s.name AS supplier_name, s.phone AS supplier_phone,
                   (d.total_debt - d.paid_debt) AS remaining_debt
            FROM debts d
            JOIN suppliers s ON d.supplier_id = s.id
            ORDER BY d.created_at DESC
        `);

        return res.status(200).json({ success: true, data: debts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Bayar Cicilan / Pelunasan Hutang Supplier
 */
exports.payDebt = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params; // debt_id
        const { payment_amount } = req.body;

        if (!payment_amount || payment_amount <= 0) {
            throw new Error('Nominal pembayaran cicilan harus lebih besar dari 0.');
        }

        // 1. Ambil data hutang
        const [rows] = await connection.query('SELECT * FROM debts WHERE id = ? FOR UPDATE', [id]);
        if (rows.length === 0) throw new Error('Data hutang tidak ditemukan.');

        const debt = rows[0];
        const remainingDebt = parseFloat(debt.total_debt) - parseFloat(debt.paid_debt);

        if (parseFloat(payment_amount) > remainingDebt) {
            throw new Error(`Nominal pembayaran melebihi sisa hutang (Sisa: Rp ${remainingDebt}).`);
        }

        const newPaidDebt = parseFloat(debt.paid_debt) + parseFloat(payment_amount);
        const newStatus = newPaidDebt >= parseFloat(debt.total_debt) ? 'Lunas' : 'Belum Lunas';

        // 2. Update status dan total terbayar pada tabel debts
        await connection.query(
            `UPDATE debts SET paid_debt = ?, status = ? WHERE id = ?`,
            [newPaidDebt, newStatus, id]
        );

        // 3. Catat Riwayat Pembayaran ke debt_payments
        await connection.query(
            `INSERT INTO debt_payments (debt_id, amount) VALUES (?, ?)`,
            [id, payment_amount]
        );

        // 4. Catat Kas Keluar di Buku Kas
        await connection.query(
            `INSERT INTO cash_flow (type, category, amount, description, ref_id)
             VALUES ('Keluar', 'Pembayaran Hutang', ?, ?, ?)`,
            [payment_amount, `Bayar cicilan hutang ID #${id}`, id]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Pembayaran cicilan hutang berhasil dicatat.',
            data: { remaining_debt: parseFloat(debt.total_debt) - newPaidDebt, status: newStatus }
        });

    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};
