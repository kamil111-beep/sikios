// 🟢 Set Timezone Global ke Asia/Jakarta (WIB) untuk Vercel Serverless
process.env.TZ = 'Asia/Jakarta';

require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Trust Proxy Wajib untuk Vercel / Cloud HTTPS
app.set('trust proxy', 1);

// 2. View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 4. Cookie Session Terenkripsi (Anti-Membal di Vercel Serverless)
app.use(cookieSession({
    name: 'sikios_session',
    keys: [process.env.SESSION_SECRET || 'sikios_secret_key_12345'],
    maxAge: 24 * 60 * 60 * 1000, // Aktif 24 jam
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1', // True jika HTTPS Vercel
    httpOnly: true,
    sameSite: 'lax'
}));

// 5. Routing
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

app.use('/api', apiRoutes);
app.use('/', webRoutes);

// 6. Listener (Local Only)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server SIKIOS berjalan di http://localhost:${PORT}`);
    });
}

module.exports = app;