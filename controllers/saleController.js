const pool = require('../config/database');

/**
 * Controller untuk menangani Transaksi Penjualan / Kasir
 */
exports.createSale = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 🟢 Ambil user_id dari sesi login yang sedang aktif secara aman
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            throw new Error('Sesi login kedaluwarsa atau tidak valid. Silakan login kembali.');
        }

        const { customer_id, items, paid_amount, payment_method } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Keranjang belanja kosong!');
        }

        let total_amount = 0;
        const processedItems = [];

        // 1. Loop validasi barang & kunci harga modal (purchase_price)
        for (let item of items) {
            const [rows] = await connection.query(
                'SELECT id, name, purchase_price, selling_price, stock FROM products WHERE id = ? AND user_id = ? FOR UPDATE',
                [item.product_id, userId]
            );

            if (rows.length === 0) {
                throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan atau bukan milik akun ini.`);
            }

            const product = rows[0];

            if (product.stock < item.quantity) {
                throw new Error(`Stok barang '${product.name}' kurang (Sisa: ${product.stock}).`);
            }

            const sellingPrice = parseFloat(item.price || product.selling_price) || 0;
            // Ambil harga beli (modal). Jika 0, gunakan fallback 70% dari harga jual
            let purchasePrice = parseFloat(product.purchase_price) || 0;
            if (purchasePrice === 0) {
                purchasePrice = sellingPrice * 0.7;
            }

            const subtotal = sellingPrice * item.quantity;
            total_amount += subtotal;

            processedItems.push({
                product_id: product.id,
                quantity: item.quantity,
                purchase_price: purchasePrice,
                selling_price: sellingPrice,
                subtotal: subtotal
            });
        }

        const paid = parseFloat(paid_amount) || 0;
        const change_amount = paid - total_amount;

        if (payment_method !== 'Piutang' && change_amount < 0) {
            throw new Error('Nominal pembayaran kurang dari total belanja!');
        }

        const invoice_number = `INV-${Date.now()}`;

        // 2. Insert ke tabel `sales` (Menyertakan user_id)
        const [saleResult] = await connection.query(
            `INSERT INTO sales (user_id, customer_id, invoice_number, total_amount, paid_amount, change_amount, payment_method, transaction_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [userId, customer_id || null, invoice_number, total_amount, paid, change_amount || 0, payment_method || 'Tunai']
        );

        const saleId = saleResult.insertId;

        // 3. Insert Detail Barang ke `sale_details` & Potong Stok
        for (let item of processedItems) {
            await connection.query(
                `INSERT INTO sale_details (sale_id, product_id, quantity, purchase_price, selling_price, subtotal) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [saleId, item.product_id, item.quantity, item.purchase_price, item.selling_price, item.subtotal]
            );

            await connection.query(
                'UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?',
                [item.quantity, item.product_id, userId]
            );
        }

        // 4. Catat ke Buku Kas atau Piutang (Menyertakan user_id)
        if (payment_method !== 'Piutang') {
            await connection.query(
                `INSERT INTO cash_flows (user_id, type, amount, description) VALUES (?, 'in', ?, ?)`, // 🟢 FIX: Diubah dari 'IN' menjadi 'in'
                [userId, total_amount, `Penjualan Invoice ${invoice_number}`]
            );
        } else {
            if (!customer_id) {
                throw new Error('Konsumen wajib dipilih untuk transaksi Piutang.');
            }
            await connection.query(
                `INSERT INTO receivables (user_id, customer_id, sale_id, amount, remaining_amount, status) 
                 VALUES (?, ?, ?, ?, ?, 'Belum Lunas')`,
                [userId, customer_id, saleId, total_amount, total_amount]
            );
        }

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: 'Transaksi berhasil!',
            data: {
                id: saleId,
                invoice_number: invoice_number,
                total_amount: total_amount,
                paid_amount: paid,
                change_amount: change_amount
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error createSale:', error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        connection.release();
    }
};