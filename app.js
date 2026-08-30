// 🟢 Set Timezone Global ke Asia/Jakarta (WIB) untuk Vercel Serverless
process.env.TZ = 'Asia/Jakarta';

// Import environment variables dari file .env
require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

// Inisialisasi aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Trust Proxy wajib untuk Vercel / Cloud HTTPS
app.set('trust proxy', 1);

// 2. Setting View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Middleware Parsing Request Data & Asset Statis
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 4. Konfigurasi Cookie Session Terenkripsi (Stabil 100% di Vercel & Anti Crash 500)
app.use(cookieSession({
    name: 'sikios_session',
    keys: [process.env.SESSION_SECRET || 'sikios_secret_key_12345'],
    maxAge: 24 * 60 * 60 * 1000, // Sesi aktif 24 jam
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1', // True jika HTTPS di Vercel
    httpOnly: true,
    sameSite: 'lax'
}));

// 5. Import File Routing
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

// 6. Registrasi Route Aplikasi
app.use('/api', apiRoutes);    // REST API Endpoint
app.use('/', webRoutes);       // Web Views EJS

// 7. Jalankan Server (Local Development)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`===========================================`);
        console.log(`🚀 Server SIKIOS Berjalan di http://localhost:${PORT}`);
        console.log(`===========================================`);
    });
}

// Export app untuk Vercel Serverless Function
module.exports = app;