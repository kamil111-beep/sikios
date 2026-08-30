// 🟢 Set Timezone Global ke Asia/Jakarta (WIB) untuk Vercel Serverless
process.env.TZ = 'Asia/Jakarta';

// Import environment variables dari file .env
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
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

// 🟢 4. Konfigurasi Kredensial MySQL Store (Fix Error 500 Vercel)
const dbOptions = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: true,        // 🟢 Otomatis buat tabel 'sessions' di Aiven jika belum ada
    clearExpired: true,
    checkExpirationInterval: 900000,   // Hapus session expired tiap 15 menit
    expiration: 24 * 60 * 60 * 1000    // Masa aktif session 24 jam
};

const sessionStore = new MySQLStore(dbOptions);

// Konfigurasi Session Cookie Stabil & Aman untuk Vercel
app.use(session({
    key: 'sikios_session',
    secret: process.env.SESSION_SECRET || 'sikios_secret_key_12345',
    store: sessionStore,               // 🟢 Simpan session ke DB MySQL Aiven
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1', // True jika di Vercel (HTTPS)
        httpOnly: true,                // Mencegah akses cookie via Javascript client
        sameSite: 'lax',               // 🟢 Tetap dikirim saat navigasi/redirect di Vercel
        maxAge: 24 * 60 * 60 * 1000    // Session aktif 24 jam
    }
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