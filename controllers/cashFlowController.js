// Pencatatan kas masuk dan keluar.
const pool = require('../config/database');

/**
 * Get Riwayat Arus Kas (Buku Kas Masuk / Keluar)
 */
exports.getCashFlow = async (req, res) => {
    try {
        const { type, start_date, end_date } = req.query;
        let query = `SELECT * FROM cash_flows WHERE 1=1`;
        const params = [];

        // Filter tipe (Masuk / Keluar)
        if (type) {
            query += ` AND type = ?`;
            params.push(type);
        }

        // Filter rentang tanggal (seperti pada UI Buku Kas)
        if (start_date && end_date) {
            query += ` AND DATE(transaction_date) BETWEEN ? AND ?`;
            params.push(start_date, end_date);
        }

        query += ` ORDER BY transaction_date DESC`;

        const [cashFlows] = await pool.query(query, params);

        let totalIncomeGross = 0;
        let totalExpense = 0;

        cashFlows.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            const itemType = (item.type || '').toLowerCase();

            // Deteksi apakah transaksi termasuk pengeluaran
            if (itemType === 'keluar' || itemType === 'out' || itemType === 'pengeluaran' || amount < 0) {
                totalExpense += Math.abs(amount);
            } else {
                totalIncomeGross += Math.abs(amount);
            }
        });

        // Pemasukan bersih yang ikut dikurangi pengeluaran sesuai keinginanmu
        const netIncome = totalIncomeGross - totalExpense;
        const finalBalance = netIncome;

        return res.status(200).json({
            success: true,
            total_income: netIncome, // Total Pemasukan akan ikut berkurang jika ada pengeluaran
            total_expense: totalExpense,     // Total pengeluaran bertambah
            balance: finalBalance,
            total_amount: finalBalance,
            data: cashFlows
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Tambah Pencatatan Kas Manual (Biaya Operasional / Pendapatan Lain)
 */
exports.createCashFlow = async (req, res) => {
    try {
        const { type, category, amount, description } = req.body;

        if (!type || !amount) {
            return res.status(400).json({ success: false, message: 'Tipe dan Nominal wajib diisi.' });
        }

        const rawAmount = parseFloat(amount) || 0;
        const itemType = type.trim().toLowerCase();

        // Deteksi apakah tipenya pengeluaran
        const isExpense = ['keluar', 'out', 'pengeluaran'].includes(itemType);
        
        const dbType = isExpense ? 'Keluar' : 'Masuk';
        const finalAmount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);

        const [result] = await pool.query(
            `INSERT INTO cash_flows (user_id, type, amount, description) VALUES (?, ?, ?, ?)`,
            [1, dbType, finalAmount, description || null]
        );

        return res.status(201).json({
            success: true,
            message: 'Pencatatan kas berhasil disimpan.',
            data: { id: result.insertId, type: dbType, amount: finalAmount }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Reset / Membersihkan Catatan Arus Kas Hari Ini
 */
exports.resetTodayCashFlow = async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        const [result] = await pool.query(
            `DELETE FROM cash_flows WHERE DATE(transaction_date) = ? OR DATE(created_at) = ?`,
            [todayStr, todayStr]
        );

        return res.status(200).json({
            success: true,
            message: `Berhasil mereset ${result.affectedRows} catatan transaksi kas hari ini.`
        });
    } catch (error) {
        console.error('Error resetTodayCashFlow:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};