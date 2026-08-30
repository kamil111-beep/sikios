const db = require('../config/database');

/**
 * Controller Logika Ringkasan Dashboard (Kas, Penjualan, Stok, Piutang & Hutang)
 * Disesuaikan ke Waktu Indonesia Barat (WIB / UTC+7)
 */
exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : 4; // Fallback ke user ID 4

        // 1. Penjualan Hari Ini (Format WIB)
        const [salesTodayRows] = await db.query(`
            SELECT IFNULL(SUM(total_amount), 0) AS total_sales
            FROM sales
            WHERE user_id = ? 
            AND DATE(DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 7 HOUR))
        `, [userId]);

        // 2. Saldo Kas Toko (Total Kumulatif Seluruh Arus Kas)
        const [cashBalanceRows] = await db.query(`
            SELECT 
                IFNULL(SUM(
                    CASE 
                        WHEN LOWER(TRIM(type)) IN ('out', 'keluar', 'pengeluaran') OR amount < 0 THEN -ABS(amount)
                        ELSE ABS(amount)
                    END
                ), 0) AS total_balance
            FROM cash_flows
            WHERE user_id = ?
        `, [userId]);

        // 3. Total Piutang Pelanggan (Belum Lunas)
        const [receivablesRows] = await db.query(`
            SELECT IFNULL(SUM(remaining_amount), 0) AS total_receivables
            FROM receivables
            WHERE user_id = ? AND status != 'Lunas'
        `, [userId]);

        // 4. Total Hutang Supplier (Belum Lunas)
        const [debtsRows] = await db.query(`
            SELECT IFNULL(SUM(remaining_amount), 0) AS total_debts
            FROM debts
            WHERE user_id = ? AND status != 'Lunas'
        `, [userId]);

        // 5. Barang Stok Kritis (Stok <= 5 Pcs)
        const [criticalStockRows] = await db.query(`
            SELECT id, name, category, selling_price, stock
            FROM products
            WHERE user_id = ? AND stock <= 5
            ORDER BY stock ASC
            LIMIT 10
        `, [userId]);

        // 6. Aktivitas Transaksi Terakhir (Dikonversi ke Jam WIB)
        const [latestActivitiesRows] = await db.query(`
            SELECT 
                id, 
                invoice_number, 
                total_amount, 
                payment_method,
                DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR) AS transaction_date
            FROM sales 
            WHERE user_id = ? 
            ORDER BY id DESC 
            LIMIT 10
        `, [userId]);

        return res.json({
            success: true,
            data: {
                sales_today: parseFloat(salesTodayRows[0].total_sales) || 0,
                cash_balance: parseFloat(cashBalanceRows[0].total_balance) || 0,
                total_receivables: parseFloat(receivablesRows[0].total_receivables) || 0,
                total_debts: parseFloat(debtsRows[0].total_debts) || 0,
                critical_stock: criticalStockRows || [],
                latest_activities: latestActivitiesRows || []
            }
        });

    } catch (error) {
        console.error('Error getDashboardData:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memuat data dashboard: ' + error.message
        });
    }
};