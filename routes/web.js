const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 🟢 MIDDLEWARE GUARD: Proteksi Halaman (Wajib Login)
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.redirect('/login');
};

// ==========================================
// 1. HALAMAN AUTENTIKASI (PUBLIC)
// ==========================================
router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { title: 'Login Kasir' });
});

// 🟢 Halaman Pendaftaran Akun Baru (Register)
router.get('/register', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { title: 'Pendaftaran Akun Baru' });
});

router.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

// ==========================================
// 2. HALAMAN UTAMA APLIKASI (PROTECTED)
// ==========================================
router.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));
router.get('/dashboard', requireAuth, (req, res) => res.render('dashboard', { title: 'Dashboard' }));
router.get('/products', requireAuth, (req, res) => res.render('products', { title: 'Data Barang' }));
router.get('/sales', requireAuth, (req, res) => res.render('sales', { title: 'Penjualan' }));
router.get('/cash-flow', requireAuth, (req, res) => res.render('cash_flow', { title: 'Buku Kas' }));

// 💡 Laporan Laba Rugi (Terisolasi berdasarkan user_id yang sedang login)
const handleReportIncome = async (req, res) => {
    try {
        const { date } = req.query;
        const userId = req.session.user.id; // 🟢 Ambil ID user aktif
        let targetDate = date || new Date().toISOString().split('T')[0];

        // 1. Hitung Omset (Filter user_id)
        const [salesData] = await db.query(
            `SELECT IFNULL(SUM(total_amount), 0) AS total_sales 
             FROM sales 
             WHERE user_id = ? AND DATE(COALESCE(transaction_date, created_at)) = ?`,
            [userId, targetDate]
        );
        const omset = Math.abs(parseFloat(salesData[0].total_sales) || 0);

        // 2. Hitung HPP (Filter user_id melalui tabel sales)
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
        let hpp = Math.abs(parseFloat(hppData[0].total_hpp) || 0);

        // Fallback jika sale_details kosong
        if (omset > 0 && hpp === 0) {
            hpp = Math.round(omset * 0.7);
        }

        // 3. Hitung Beban Operasional (Filter user_id)
        const [expenseData] = await db.query(
            `SELECT IFNULL(SUM(ABS(amount)), 0) AS total_expense 
             FROM cash_flows 
             WHERE user_id = ? AND (LOWER(type) IN ('keluar', 'out', 'pengeluaran'))
               AND DATE(COALESCE(transaction_date, created_at)) = ?`,
            [userId, targetDate]
        );
        const beban = Math.abs(parseFloat(expenseData[0].total_expense) || 0);

        // 4. Kalkulasi Akuntansi
        const labaKotor = omset - hpp;
        const labaBersih = labaKotor - beban;

        res.render('report_income', {
            title: 'Laporan Laba Rugi',
            selectedDate: targetDate,
            omset: omset,
            hpp: hpp,
            labaKotor: labaKotor,
            beban: beban,
            labaBersih: labaBersih
        });

    } catch (error) {
        console.error('Error render report_income:', error);
        res.status(500).send('Terjadi kesalahan sistem saat memuat laporan: ' + error.message);
    }
};

router.get('/reports', requireAuth, handleReportIncome);
router.get('/report-income', requireAuth, handleReportIncome);

router.get('/receivables', requireAuth, (req, res) => res.render('receivables', { title: 'Piutang Konsumen' }));
router.get('/debts', requireAuth, (req, res) => res.render('debts', { title: 'Hutang Supplier' }));

module.exports = router;