// Manajemen piutang konsumen dan cicilan.
const pool = require('../config/database');

/**
 * Get Daftar Piutang Konsumen
 */
exports.getReceivables = async (req, res) => {
    try {
        const [receivables] = await pool.query(`
            SELECT r.*, c.name AS customer_name, c.phone AS customer_phone,
                   (r.total_receivable - r.paid_receivable) AS remaining_receivable
            FROM receivables r
            JOIN customers c ON r.customer_id = c.id
            ORDER BY r.created_at DESC
        `);

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

        const { id } = req.params; // receivable_id
        const { payment_amount } = req.body;

        if (!payment_amount || payment_amount <= 0) {
            throw new Error('Nominal pembayaran piutang harus lebih besar dari 0.');
        }

        // 1. Ambil data piutang
        const [rows] = await connection.query('SELECT * FROM receivables WHERE id = ? FOR UPDATE', [id]);
        if (rows.length === 0) throw new Error('Data piutang tidak ditemukan.');

        const receivable = rows[0];
        const remainingReceivable = parseFloat(receivable.total_receivable) - parseFloat(receivable.paid_receivable);

        if (parseFloat(payment_amount) > remainingReceivable) {
            throw new Error(`Nominal pembayaran melebihi sisa piutang (Sisa: Rp ${remainingReceivable}).`);
        }

        const newPaidReceivable = parseFloat(receivable.paid_receivable) + parseFloat(payment_amount);
        const newStatus = newPaidReceivable >= parseFloat(receivable.total_receivable) ? 'Lunas' : 'Belum Lunas';

        // 2. Update status dan total terbayar pada tabel receivables
        await connection.query(
            `UPDATE receivables SET paid_receivable = ?, status = ? WHERE id = ?`,
            [newPaidReceivable, newStatus, id]
        );

        // 3. Catat Riwayat Pembayaran ke receivable_payments
        await connection.query(
            `INSERT INTO receivable_payments (receivable_id, amount) VALUES (?, ?)`,
            [id, payment_amount]
        );

        // 4. Catat Kas Masuk di Buku Kas
        await connection.query(
            `INSERT INTO cash_flow (type, category, amount, description, ref_id)
             VALUES ('Masuk', 'Penerimaan Piutang', ?, ?, ?)`,
            [payment_amount, `Terima cicilan piutang ID #${id}`, id]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Pembayaran piutang berhasil dicatat dan masuk ke Kas Masuk.',
            data: { remaining_receivable: parseFloat(receivable.total_receivable) - newPaidReceivable, status: newStatus }
        });

    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};