// Import environment variables dari file .env
require('dotenv').config();

const express = require('express');
const session = require('express-session'); // 🟢 DITAMBAHKAN
const path = require('path');

// Inisialisasi aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Setting View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middleware Parsing Request Data & Asset Statis
app.use(express.json()); // Untuk membaca request body berupa JSON
app.use(express.urlencoded({ extended: true })); // Untuk membaca request body dari Form
app.use(express.static(path.join(__dirname, 'public'))); // Folder untuk file CSS, JS, dan Gambar

// 🟢 2.5. Konfigurasi Express Session (Disimpan sebelum routing)
app.use(session({
    secret: process.env.SESSION_SECRET || 'sikios_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { 
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