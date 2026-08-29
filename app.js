// Import environment variables dari file .env
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// Inisialisasi aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// 🟢 PERBAIKAN VERCEL 1: Aktifkan trust proxy agar Vercel mengenalkan HTTPS Cookie
app.set('trust proxy', 1);

// 1. Setting View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middleware Parsing Request Data & Asset Statis
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 PERBAIKAN VERCEL 2: Konfigurasi Cookie Session Aman untuk Cloud & HTTPS
app.use(session({
    secret: process.env.SESSION_SECRET || 'sikios_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Menggunakan secure cookie saat di Vercel
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // Session aktif selama 24 Jam
    }
}));

// 3. Import File Routing
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

// 4. Registrasi Route Aplikasi
app.use('/api', apiRoutes);    // REST API Endpoint
app.use('/', webRoutes);       // Web Views EJS

// 5. Jalankan Server
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🚀 Server SIKIOS Berjalan di http://localhost:${PORT}`);
    console.log(`===========================================`);
});

// Export app untuk Vercel Serverless Function
module.exports = app;