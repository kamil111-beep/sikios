const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// 1. IMPORT KONEKSI DATABASE
const db = require('../config/database');

// Import Controllers
const productController = require('../controllers/productController');
const saleController = require('../controllers/saleController');
const purchaseController = require('../controllers/purchaseController');
const cashFlowController = require('../controllers/cashFlowController');
const debtController = require('../controllers/debtController');
const receivableController = require('../controllers/receivableController');
const reportController = require('../controllers/reportController');

// 🟢 ANTI-CACHE MIDDLEWARE: Memaksa Data Selalu Real-Time (Cegah Status 304)
router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// 🟢 MIDDLEWARE GUARD: Mencegah Kebocoran Data Antar-User
const requireAuthApi = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.id) {
        return next();
    }
    return res.status(401).json({ 
        success: false, 
        message: 'Sesi login telah berakhir. Silakan login kembali.' 
    });
};

// ==========================================
// 0. ENDPOINT AUTHENTICATION
// ==========================================

router.get('/auth/me', requireAuthApi, (req, res) => {
    try {
        return res.json({
            success: true,
            id: req.session.user.id,
            name: req.session.user.name || 'Admin Kasir',
            role: req.session.user.role || 'Active Account'
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/auth/update-profile', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nama lengkap tidak boleh kosong!' });
        }

        await db.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), userId]);
        req.session.user.name = name.trim();

        req.session.save((err) => {
            if (err) {
                console.error('Error saving session on profile update:', err);
            }
            return res.json({ 
                success: true, 
                message: 'Nama profil berhasil diperbarui!',
                name: req.session.user.name 
            });
        });
    } catch (error) {
        console.error('Error update profile:', error);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui profil: ' + error.message });
    }
});

router.put('/auth/update-password', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, message: 'Password lama dan password baru wajib diisi!' });
        }

        const [users] = await db.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!users || users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }

        const dbPassword = String(users[0].password || '').trim();
        const inputCurrentPassword = String(current_password || '').trim();
        let isMatch = false;

        if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$') || dbPassword.startsWith('$2y$')) {
            try {
                isMatch = await bcrypt.compare(inputCurrentPassword, dbPassword);
            } catch (err) {
                isMatch = false;
            }
        } else {
            isMatch = (inputCurrentPassword === dbPassword);
        }

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Password lama yang Anda masukkan salah!' });
        }

        const hashedNewPassword = await bcrypt.hash(new_password.trim(), 10);
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);

        return res.json({ success: true, message: 'Password berhasil diperbarui!' });
    } catch (error) {
        console.error('Error update password:', error);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui password: ' + error.message });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { fullname, username, password } = req.body;

        if (!fullname || !username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Semua kolom (Nama Lengkap, Username, Password) wajib diisi!' 
            });
        }

        const [existingUsers] = await db.query(
            'SELECT id FROM users WHERE username = ? LIMIT 1',
            [String(username).trim()]
        );

        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username sudah terdaftar! Silakan gunakan username lain.' 
            });
        }

        const hashedPassword = await bcrypt.hash(String(password).trim(), 10);

        await db.query(
            'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
            [String(fullname).trim(), String(username).trim(), hashedPassword, 'kasir']
        );

        return res.status(200).json({ 
            success: true, 
            message: 'Registrasi akun berhasil! Silakan login.' 
        });

    } catch (error) {
        console.error('Error pada API Register:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan sistem saat proses registrasi: ' + error.message 
        });
    }
});

// 🟢 POST Handler Login User (Fixed Session Save & Stability)
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username dan password wajib diisi!' 
            });
        }

        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();

        const [users] = await db.query(
            'SELECT * FROM users WHERE username = ? LIMIT 1', 
            [cleanUsername]
        );

        if (!users || users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username atau password salah!' 
            });
        }

        const user = users[0];
        let isMatch = false;

        if (user.password) {
            const dbPassword = String(user.password).trim();
            if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$') || dbPassword.startsWith('$2y$')) {
                try {
                    isMatch = await bcrypt.compare(cleanPassword, dbPassword);
                } catch (bcryptErr) {
                    isMatch = (cleanPassword === dbPassword);
                }
            } else {
                isMatch = (cleanPassword === dbPassword);
            }
        }

        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username atau password salah!' 
            });
        }

        // Pasang Sesi Pengguna
        req.session.user = {
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            role: user.role || 'kasir'
        };

        // Simpan sesi secara eksplisit agar cookie terkirim sempurna ke browser
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Gagal menyimpan sesi: ' + err.message 
                });
            }
            return res.json({ 
                success: true, 
                message: 'Login berhasil!',
                user: req.session.user 
            });
        });

    } catch (error) {
        console.error('Error pada API Login:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan sistem saat proses login: ' + error.message 
        });
    }
});

router.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Gagal mengakhiri sesi.' });
            }
            res.clearCookie('connect.sid');
            return res.json({ success: true, message: 'Berhasil keluar.' });
        });
    } else {
        return res.json({ success: true, message: 'Sesi sudah berakhir.' });
    }
});

// ==========================================
// 1. ENDPOINT DATA BARANG & TRANSAKSI (PROTECTED)
// ==========================================
router.get('/products', requireAuthApi, productController.getAllProducts);
router.post('/products', requireAuthApi, productController.createProduct);
router.put('/products/:id', requireAuthApi, productController.updateProduct);
router.delete('/products/:id', requireAuthApi, productController.deleteProduct);

// --- TRANSAKSI PENJUALAN (SALES) ---
router.post('/sales', requireAuthApi, saleController.createSale);

router.get('/sales', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.query(`
            SELECT id, invoice_number, total_amount, paid_amount, change_amount, payment_method, 
                   DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR) AS transaction_date, 
                   created_at 
            FROM sales 
            WHERE user_id = ? 
            ORDER BY id DESC 
            LIMIT 50
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetch sales history:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat penjualan: ' + error.message });
    }
});

router.get('/sales/:id', requireAuthApi, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;

        const [saleRows] = await db.query('SELECT * FROM sales WHERE id = ? AND user_id = ?', [id, userId]);
        if (saleRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        }

        const [itemsRows] = await db.query(`
            SELECT 
                sd.quantity, 
                IFNULL(sd.selling_price, 0) AS price, 
                IFNULL(sd.purchase_price, 0) AS purchase_price,
                p.name 
            FROM sale_details sd
            JOIN products p ON sd.product_id = p.id
            WHERE sd.sale_id = ?
        `, [id]);

        const saleData = saleRows[0];
        saleData.items = itemsRows;

        res.json({ success: true, data: saleData });
    } catch (error) {
        console.error('Error fetch sale detail:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail transaksi: ' + error.message });
    }
});

router.post('/purchases', requireAuthApi, purchaseController.createPurchase);

// ==========================================
// 2. ENDPOINT BUKU KAS & LAPORAN LABA RUGI (PROTECTED)
// ==========================================
router.get('/reports/income-statement', requireAuthApi, reportController.getIncomeStatement);

router.post('/reports/reset', requireAuthApi, async (req, res) => {
    try {
        const { date } = req.body;
        const userId = req.session.user.id;
        
        const targetDate = date || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        await db.query(`
            DELETE sd FROM sale_details sd
            JOIN sales s ON sd.sale_id = s.id
            WHERE s.user_id = ? AND DATE(DATE_ADD(s.transaction_date, INTERVAL 7 HOUR)) = ?
        `, [userId, targetDate]);

        await db.query(`
            DELETE FROM sales 
            WHERE user_id = ? AND DATE(DATE_ADD(transaction_date, INTERVAL 7 HOUR)) = ?
        `, [userId, targetDate]);

        await db.query(`
            DELETE FROM cash_flows 
            WHERE user_id = ? AND DATE(DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR)) = ?
        `, [userId, targetDate]);

        res.json({ 
            success: true, 
            message: `Data transaksi tanggal ${targetDate} berhasil di-reset!` 
        });
    } catch (error) {
        console.error('Error reset harian:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mereset data harian: ' + error.message 
        });
    }
});

// ==========================================
// ENDPOINT BUKU KAS (CASH FLOW)
// ==========================================

router.get('/cash-flow', requireAuthApi, async (req, res) => {
    try {
        const { date } = req.query;
        const userId = req.session.user.id;
        
        const targetDate = date || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        let querySql = `
            SELECT id, user_id, type, amount, description, 
                   DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR) AS transaction_date, 
                   created_at 
            FROM cash_flows 
            WHERE user_id = ?
        `;
        let queryParams = [userId];

        if (date && date.trim() !== '' && date !== 'all') {
            querySql += ` AND DATE(DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR)) = ?`;
            queryParams.push(date.trim());
        }

        querySql += ` ORDER BY id DESC`;

        const [rows] = await db.query(querySql, queryParams);
        
        let totalIncome = 0;
        let totalExpense = 0;

        if (Array.isArray(rows)) {
            rows.forEach(item => {
                const amount = parseFloat(item.amount) || 0;
                const typeStr = String(item.type || '').trim().toLowerCase();

                if (typeStr === 'out' || typeStr === 'keluar' || typeStr === 'pengeluaran' || amount < 0) {
                    totalExpense += Math.abs(amount);
                } else {
                    totalIncome += Math.abs(amount);
                }
            });
        }

        let totalBalance = totalIncome - totalExpense;

        return res.json({ 
            success: true, 
            selected_date: targetDate,
            data: rows || [], 
            total_income: totalIncome,
            total_expense: totalExpense,
            balance: totalBalance 
        });
    } catch (error) {
        console.error('Error fetch cash-flow:', error);
        return res.json({ 
            success: true, 
            selected_date: req.query.date || 'semua',
            data: [], 
            total_income: 0,
            total_expense: 0,
            balance: 0 
        });
    }
});

router.post('/cash-flow', requireAuthApi, async (req, res) => {
    try {
        const { type, amount, description } = req.body; 
        const userId = req.session.user.id;
        const rawAmount = parseFloat(amount) || 0;

        const typeStr = String(type || '').trim().toLowerCase();
        const isExpense = ['out', 'keluar', 'pengeluaran'].includes(typeStr);
        
        const dbType = isExpense ? 'Keluar' : 'Masuk';
        const finalAmount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);

        const [result] = await db.query(
            `INSERT INTO cash_flows (user_id, type, amount, description, transaction_date) 
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 HOUR))`,
            [userId, dbType, finalAmount, description || null]
        );

        return res.json({ success: true, message: 'Transaksi kas berhasil dicatat', id: result.insertId });
    } catch (error) {
        console.error('Error cash-flow:', error);
        return res.status(500).json({ success: false, message: 'Gagal mencatat kas: ' + error.message });
    }
});

router.delete('/cash-flow/reset-today', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [result] = await db.query(
            `DELETE FROM cash_flows 
             WHERE user_id = ? 
             AND DATE(DATE_ADD(COALESCE(transaction_date, created_at), INTERVAL 7 HOUR)) = ?`,
            [userId, todayStr]
        );

        return res.json({ 
            success: true, 
            message: `Berhasil mereset ${result.affectedRows} catatan transaksi kas hari ini.` 
        });
    } catch (error) {
        console.error('Error reset cash-flow:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Gagal mereset transaksi kas hari ini: ' + error.message 
        });
    }
});

// ==========================================
// 3. API PIUTANG KONSUMEN (RECEIVABLES)
// ==========================================
router.get('/receivables', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.query('SELECT * FROM receivables WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetch receivables:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data piutang' });
    }
});

router.post('/receivables', requireAuthApi, async (req, res) => {
    try {
        const { customer_name, phone, amount, due_date, notes } = req.body;
        const userId = req.session.user.id;
        
        const parseAmount = parseFloat(amount) || 0;
        const validDueDate = due_date && due_date.trim() !== '' ? due_date : null;

        const [result] = await db.query(
            `INSERT INTO receivables (user_id, customer_name, phone, amount, remaining_amount, due_date, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, customer_name, phone || null, parseAmount, parseAmount, validDueDate, notes || null]
        );

        res.json({ success: true, message: 'Piutang berhasil dicatat', id: result.insertId });
    } catch (error) {
        console.error('Error insert receivable:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan ke database: ' + error.message 
        });
    }
});

router.post('/receivables/:id/pay', requireAuthApi, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;
        const { pay_amount, payment_amount } = req.body;
        
        const payment = parseFloat(pay_amount || payment_amount) || 0;

        if (payment <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal pembayaran harus lebih besar dari 0' });
        }

        const [rows] = await db.query('SELECT customer_name, remaining_amount FROM receivables WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Data piutang tidak ditemukan' });
        }

        const currentRemaining = parseFloat(rows[0].remaining_amount);
        const customerName = rows[0].customer_name || 'Konsumen';
        const newRemaining = Math.max(0, currentRemaining - payment);
        const newStatus = newRemaining === 0 ? 'Lunas' : 'Belum Lunas';

        await db.query(
            'UPDATE receivables SET remaining_amount = ?, status = ? WHERE id = ? AND user_id = ?',
            [newRemaining, newStatus, id, userId]
        );

        await db.query(
            `INSERT INTO cash_flows (user_id, type, amount, description, transaction_date) 
             VALUES (?, 'Masuk', ?, ?, DATE_ADD(NOW(), INTERVAL 7 HOUR))`,
            [userId, payment, `Terima cicilan piutang dari ${customerName}`]
        );

        res.json({ success: true, message: 'Pembayaran piutang berhasil dicatat' });
    } catch (error) {
        console.error('Error pay receivable:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses pembayaran: ' + error.message });
    }
});

router.delete('/receivables/:id', requireAuthApi, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;
        await db.query('DELETE FROM receivables WHERE id = ? AND user_id = ?', [id, userId]);
        res.json({ success: true, message: 'Data piutang berhasil dihapus' });
    } catch (error) {
        console.error('Error delete receivable:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus data: ' + error.message });
    }
});

// ==========================================
// 4. API HUTANG SUPPLIER (DEBTS)
// ==========================================
router.get('/debts', requireAuthApi, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.query('SELECT * FROM debts WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetch debts:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data hutang supplier' });
    }
});

router.post('/debts', requireAuthApi, async (req, res) => {
    try {
        const { supplier_name, phone, amount, due_date, notes } = req.body;
        const userId = req.session.user.id;

        const parseAmount = parseFloat(amount) || 0;
        const validDueDate = due_date && due_date.trim() !== '' ? due_date : null;

        const [result] = await db.query(
            `INSERT INTO debts (user_id, supplier_name, phone, amount, remaining_amount, due_date, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, supplier_name, phone || null, parseAmount, parseAmount, validDueDate, notes || null]
        );

        res.json({ success: true, message: 'Hutang supplier berhasil dicatat', id: result.insertId });
    } catch (error) {
        console.error('Error insert debt:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan ke database: ' + error.message 
        });
    }
});

router.post('/debts/:id/pay', requireAuthApi, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;
        const { pay_amount, payment_amount } = req.body;
        const payment = parseFloat(pay_amount || payment_amount) || 0;

        if (payment <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal pembayaran harus lebih besar dari 0' });
        }

        const [rows] = await db.query('SELECT supplier_name, remaining_amount FROM debts WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Data hutang tidak ditemukan' });
        }

        const currentRemaining = parseFloat(rows[0].remaining_amount);
        const supplierName = rows[0].supplier_name || 'Supplier';
        const newRemaining = Math.max(0, currentRemaining - payment);
        const newStatus = newRemaining === 0 ? 'Lunas' : 'Belum Lunas';

        await db.query(
            'UPDATE debts SET remaining_amount = ?, status = ? WHERE id = ? AND user_id = ?',
            [newRemaining, newStatus, id, userId]
        );

        await db.query(
            `INSERT INTO cash_flows (user_id, type, amount, description, transaction_date) 
             VALUES (?, 'Keluar', ?, ?, DATE_ADD(NOW(), INTERVAL 7 HOUR))`,
            [userId, -Math.abs(payment), `Bayar hutang supplier ke ${supplierName}`]
        );

        res.json({ success: true, message: 'Pembayaran hutang supplier berhasil dicatat' });
    } catch (error) {
        console.error('Error pay debt:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses pembayaran: ' + error.message });
    }
});

router.delete('/debts/:id', requireAuthApi, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;
        await db.query('DELETE FROM debts WHERE id = ? AND user_id = ?', [id, userId]);
        res.json({ success: true, message: 'Data hutang supplier berhasil dihapus' });
    } catch (error) {
        console.error('Error delete debt:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus data: ' + error.message });
    }
});

module.exports = router;