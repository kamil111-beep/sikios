// Kalkulasi laporan laba rugi.
const db = require('../config/database');

/**
 * Controller untuk Mengambil & Menghitung Laporan Laba Rugi
 */
exports.getIncomeStatement = async (req, res) => {
    try {
        // 🟢 Ambil user_id dari sesi login yang aktif secara aman
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        // 1. Tangkap parameter tanggal & perbaiki format lokal
        const { date } = req.query;
        
        let targetDate = date;
        if (!targetDate || targetDate.trim() === '') {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            targetDate = `${year}-${month}-${day}`;
        }

        // 2. Hitung Total Penjualan (Omset) - Difilter user_id
        const [salesData] = await db.query(
            `SELECT IFNULL(SUM(total_amount), 0) AS total_sales 
             FROM sales 
             WHERE user_id = ? AND DATE(COALESCE(transaction_date, created_at)) = ?`,
            [userId, targetDate]
        );
        const totalSales = Math.abs(parseFloat(salesData[0].total_sales) || 0);

        // 3. Hitung Total HPP dari tabel sale_details & products - Difilter user_id
        const [hppData] = await db.query(
            `SELECT IFNULL(SUM(
                CASE 
                    WHEN COALESCE(sd.purchase_price, 0) > 0 THEN sd.purchase_price * sd.quantity
                    WHEN COALESCE(p.purchase_price, 0) > 0 THEN p.purchase_price * sd.quantity
                    ELSE (COALESCE(sd.selling_price, p.selling_price, 0) * 0.7) * sd.quantity
                END
               ), 0) AS total_hpp 
             FROM sale_details sd
             JOIN sales s ON sd.sale_id = s.id
             LEFT JOIN products p ON sd.product_id = p.id
             WHERE s.user_id = ? AND DATE(COALESCE(s.transaction_date, s.created_at)) = ?`,
            [userId, targetDate]
        );
        let totalHPP = Math.abs(parseFloat(hppData[0].total_hpp) || 0);

        // 💡 FORCE FALLBACK: Jika Omset ada (> 0) tetapi HPP di database masih 0, paksa hitung modal 70% dari omset.
        if (totalSales > 0 && totalHPP === 0) {
            totalHPP = Math.round(totalSales * 0.7);
        }

        // 4. Hitung Biaya Operasional Kas Keluar - Difilter user_id
        const [expenseData] = await db.query(
            `SELECT IFNULL(SUM(ABS(amount)), 0) AS total_operational_expense 
             FROM cash_flows 
             WHERE user_id = ? AND (LOWER(type) IN ('keluar', 'out', 'pengeluaran'))
               AND DATE(COALESCE(transaction_date, created_at)) = ?`,
            [userId, targetDate]
        );
        const totalOperationalExpense = Math.abs(parseFloat(expenseData[0].total_operational_expense) || 0);

        // 5. Kalkulasi Murni Laba Kotor & Laba Bersih
        const grossProfit = totalSales - totalHPP;
        const netProfit = grossProfit - totalOperationalExpense;

        return res.status(200).json({
            success: true,
            date: targetDate,
            data: {
                omset: totalSales,
                total_sales: totalSales,
                hpp: totalHPP,
                total_hpp: totalHPP,
                laba_kotor: grossProfit,
                gross_profit: grossProfit,
                beban_operasional: totalOperationalExpense,
                operational_expense: totalOperationalExpense,
                laba_bersih: netProfit,
                net_profit: netProfit
            }
        });

    } catch (error) {
        console.error('Error Income Statement:', error);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan sistem saat menghitung Laporan Laba Rugi.',
            error: error.message
        });
    }
};