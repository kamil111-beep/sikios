const pool = require('../config/database');

/**
 * Helper Function: Dapatkan ID Kategori yang Valid
 */
async function resolveCategoryId(categoryInput) {
    if (categoryInput && !isNaN(categoryInput)) {
        return parseInt(categoryInput);
    }

    const categoryName = (categoryInput || 'Umum').trim();

    try {
        const [existing] = await pool.query('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1', [categoryName]);
        if (existing.length > 0) {
            return existing[0].id;
        }

        const [newCat] = await pool.query('INSERT INTO categories (name) VALUES (?)', [categoryName]);
        return newCat.insertId;
    } catch (err) {
        console.error('Error resolving category:', err);
        return 1; // Fallback aman ke ID 1
    }
}

/**
 * Get Semua Produk (Difilter Berdasarkan User yang Login)
 */
exports.getAllProducts = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const { search, category_id } = req.query;
        let query = `
            SELECT p.*, c.name AS category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.user_id = ? AND IFNULL(p.is_active, 1) = 1
        `;
        const params = [userId];

        if (search) {
            query += ` AND p.name LIKE ?`;
            params.push(`%${search}%`);
        }
        if (category_id) {
            query += ` AND p.category_id = ?`;
            params.push(category_id);
        }

        query += ` ORDER BY p.name ASC`;

        const [products] = await pool.query(query, params);
        return res.status(200).json({ success: true, data: products });
    } catch (error) {
        console.error('Error getAllProducts:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Tambah Produk Baru (Menyertakan user_id)
 */
exports.createProduct = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        console.log('Incoming Payload Create Product:', req.body);

        const name = req.body.name || req.body.nama || req.body.nama_barang;
        const categoryInput = req.body.category_id || req.body.category || req.body.kategori || req.body.jenis;
        const purchase_price = parseFloat(req.body.purchase_price || req.body.harga_beli || 0);
        const selling_price = parseFloat(req.body.selling_price || req.body.price || req.body.harga_jual || 0);
        const stock = parseInt(req.body.stock || req.body.stok || 0);
        const min_stock = parseInt(req.body.min_stock || 5);

        if (!name) {
            return res.status(400).json({ success: false, message: 'Nama barang wajib diisi.' });
        }

        const validCategoryId = await resolveCategoryId(categoryInput);

        const [result] = await pool.query(
            `INSERT INTO products (user_id, category_id, name, purchase_price, selling_price, stock, min_stock, image_url, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, null, 1)`,
            [userId, validCategoryId, name, purchase_price, selling_price, stock, min_stock]
        );

        return res.status(201).json({
            success: true,
            message: 'Produk berhasil ditambahkan.',
            data: { id: result.insertId, name }
        });
    } catch (error) {
        console.error('Error createProduct:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update Data Produk (Diamankan dengan user_id)
 */
exports.updateProduct = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const { id } = req.params;
        console.log(`Incoming Payload Update Product ID ${id}:`, req.body);

        const name = req.body.name || req.body.nama || req.body.nama_barang;
        const categoryInput = req.body.category_id || req.body.category || req.body.kategori || req.body.jenis;
        const purchase_price = parseFloat(req.body.purchase_price || req.body.harga_beli || 0);
        const selling_price = parseFloat(req.body.selling_price || req.body.price || req.body.harga_jual || 0);
        const stock = parseInt(req.body.stock || req.body.stok || 0);
        const min_stock = parseInt(req.body.min_stock || 5);

        const validCategoryId = await resolveCategoryId(categoryInput);

        const [result] = await pool.query(
            `UPDATE products 
             SET category_id = ?, 
                 name = COALESCE(?, name), 
                 purchase_price = ?, 
                 selling_price = ?, 
                 stock = ?, 
                 min_stock = ?
             WHERE id = ? AND user_id = ?`,
            [validCategoryId, name, purchase_price, selling_price, stock, min_stock, id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan atau bukan milik akun ini.' });
        }

        return res.status(200).json({ success: true, message: 'Data produk berhasil diperbarui.' });
    } catch (error) {
        console.error('Error updateProduct:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete Produk / Soft Delete (Diamankan dengan user_id)
 */
exports.deleteProduct = async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Silakan login terlebih dahulu.' });
        }

        const { id } = req.params;
        const [result] = await pool.query('UPDATE products SET is_active = 0 WHERE id = ? AND user_id = ?', [id, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan atau bukan milik akun ini.' });
        }

        return res.status(200).json({ success: true, message: 'Produk berhasil dihapus.' });
    } catch (error) {
        console.error('Error deleteProduct:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};