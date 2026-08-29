// Transaksi pembelian dan pembaruan stok.
const pool = require('../config/database');

/**
 * Tambah Transaksi Pembelian Stok dari Supplier
 */
exports.createPurchase = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { supplier_id, items, payment_method } = req.body;
        // items berisi array: [{ product_id, quantity, purchase_price }]

        if (!supplier_id || !items || items.length === 0) {
            throw new Error('Supplier dan minimal 1 barang wajib diisi.');
        }

        let total_amount = 0;

        // 1. Hitung Total Pembelian
        for (let item of items) {
            const subtotal = item.purchase_price * item.quantity;
            total_amount += subtotal;
        }

        // 2. Simpan ke Tabel Purchases
        const [purchaseResult] = await connection.query(
            `INSERT INTO purchases (supplier_id, total_amount, payment_method) VALUES (?, ?, ?)`,
            [supplier_id, total_amount, payment_method]
        );
        const purchaseId = purchaseResult.insertId;

        // 3. Simpan Detail Pembelian & Tambah Stok Produk
        for (let item of items) {
            const subtotal = item.purchase_price * item.quantity;

            await connection.query(
                `INSERT INTO purchase_details (purchase_id, product_id, quantity, purchase_price, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [purchaseId, item.product_id, item.quantity, item.purchase_price, subtotal]
            );

            // Tambah stok & perbarui harga beli produk di master
            await connection.query(
                `UPDATE products SET stock = stock + ?, purchase_price = ? WHERE id = ?`,
                [item.quantity, item.purchase_price, item.product_id]
            );
        }

        // 4. Integrasi ke Buku Kas atau Hutang Supplier
        if (payment_method === 'Tunai') {
            // Catat Kas Keluar di Buku Kas
            await connection.query(
                `INSERT INTO cash_flow (type, category, amount, description, ref_id)
                 VALUES ('Keluar', 'Pembelian Stok', ?, ?, ?)`,
                [total_amount, `Pembelian barang ID #${purchaseId}`, purchaseId]
            );
        } else if (payment_method === 'Hutang') {
            // Catat ke Tabel Debts (Hutang Supplier)
            await connection.query(
                `INSERT INTO debts (supplier_id, purchase_id, total_debt, paid_debt, status)
                 VALUES (?, ?, ?, 0.00, 'Belum Lunas')`,
                [supplier_id, purchaseId, total_amount]
            );
        }

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: 'Transaksi pembelian berhasil disimpan dan stok bertambah.',
            data: { purchase_id: purchaseId, total_amount }
        });

    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};
