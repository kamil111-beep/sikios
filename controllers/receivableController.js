// Manajemen piutang konsumen dan cicilan.
const pool = require('../config/database');

/**
 * Get Daftar Piutang Konsumen
 */
exports.getReceivables = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const [receivables] = await pool.query(`
            SELECT r.*, c.name AS customer_name, c.phone AS customer_phone
            FROM receivables r
            LEFT JOIN customers c ON r.customer_id = c.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        `, [userId]);

        return res.status(200).json({ success: true, data: receivables });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Terima Cicilan / Pelunasan Piutang Konsumen
 */
exports.payReceivable = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 🟢 Read user_id dari sesi login kasir secara aman
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const { id } = req.params; // receivable_id
        const { payment_amount } = req.body;

        const payAmount = parseFloat(payment_amount) || 0;
        if (payAmount <= 0) {
            throw new Error('Nominal pembayaran piutang harus lebih besar dari 0.');
        }

        // 1. Ambil data piutang berdasarkan id & user_id
        const [rows] = await connection.query(
            'SELECT * FROM receivables WHERE id = ? AND user_id = ? FOR UPDATE', 
            [id, userId]
        );
        if (rows.length === 0) throw new Error('Data piutang tidak ditemukan.');

        const receivable = rows[0];
        const remainingReceivable = parseFloat(receivable.remaining_amount) || 0;

        if (payAmount > remainingReceivable) {
            throw new Error(`Nominal pembayaran melebihi sisa piutang (Sisa: Rp ${remainingReceivable}).`);
        }

        const newRemaining = remainingReceivable - payAmount;
        const newStatus = newRemaining <= 0 ? 'Lunas' : 'Belum Lunas';

        // 2. Update status dan sisa piutang pada tabel receivables
        await connection.query(
            `UPDATE receivables SET remaining_amount = ?, status = ? WHERE id = ? AND user_id = ?`,
            [newRemaining, newStatus, id, userId]
        );

        // 3. Catat Riwayat Pembayaran ke receivable_payments
        await connection.query(
            `INSERT INTO receivable_payments (receivable_id, payment_date, amount) VALUES (?, CURDATE(), ?)`,
            [id, payAmount]
        );

        // 4. Catat Kas Masuk di Buku Kas (Tabel: cash_flows, Type: 'Masuk')
        await connection.query(
            `INSERT INTO cash_flows (user_id, type, amount, description, transaction_date)
             VALUES (?, 'Masuk', ?, ?, NOW())`,
            [userId, payAmount, `Terima cicilan piutang ID #${id}`]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Pembayaran piutang berhasil dicatat dan masuk ke Kas Masuk.',
            data: { remaining_receivable: newRemaining, status: newStatus }
        });

    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};