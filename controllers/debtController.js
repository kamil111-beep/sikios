// Manajemen hutang supplier dan cicilan.
const pool = require('../config/database');

/**
 * Get Daftar Hutang Supplier beserta histori pembayaran
 */
exports.getDebts = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const [debts] = await pool.query(`
            SELECT * FROM debts 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `, [userId]);

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

        // 🟢 Validasi sesi login kasir secara aman
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const { id } = req.params; // debt_id
        const { payment_amount, pay_amount } = req.body;

        const payVal = parseFloat(payment_amount || pay_amount) || 0;
        if (payVal <= 0) {
            throw new Error('Nominal pembayaran cicilan harus lebih besar dari 0.');
        }

        // 1. Ambil data hutang berdasarkan ID & user_id
        const [rows] = await connection.query(
            'SELECT * FROM debts WHERE id = ? AND user_id = ? FOR UPDATE', 
            [id, userId]
        );
        if (rows.length === 0) throw new Error('Data hutang tidak ditemukan.');

        const debt = rows[0];
        const remainingDebt = parseFloat(debt.remaining_amount) || 0;
        const supplierName = debt.supplier_name || 'Supplier';

        if (payVal > remainingDebt) {
            throw new Error(`Nominal pembayaran melebihi sisa hutang (Sisa: Rp ${remainingDebt}).`);
        }

        const newRemaining = remainingDebt - payVal;
        const newStatus = newRemaining <= 0 ? 'Lunas' : 'Belum Lunas';

        // 2. Update status dan sisa hutang pada tabel debts
        await connection.query(
            `UPDATE debts SET remaining_amount = ?, status = ? WHERE id = ? AND user_id = ?`,
            [newRemaining, newStatus, id, userId]
        );

        // 3. Catat Riwayat Pembayaran ke debt_payments
        await connection.query(
            `INSERT INTO debt_payments (debt_id, payment_date, amount) VALUES (?, CURDATE(), ?)`,
            [id, payVal]
        );

        // 4. Catat Kas Keluar di Buku Kas (Tabel: cash_flows, Type: 'Keluar', Amount: Negatif)
        await connection.query(
            `INSERT INTO cash_flows (user_id, type, amount, description, transaction_date)
             VALUES (?, 'Keluar', ?, ?, NOW())`,
            [userId, -Math.abs(payVal), `Bayar cicilan hutang ke ${supplierName} (ID #${id})`]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Pembayaran cicilan hutang berhasil dicatat.',
            data: { remaining_debt: newRemaining, status: newStatus }
        });

    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};