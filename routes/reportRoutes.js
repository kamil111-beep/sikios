const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Endpoint API Laporan Laba Rugi
router.get('/income-statement', reportController.getIncomeStatement);

module.exports = router;