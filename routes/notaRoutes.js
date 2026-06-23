const express = require('express');
const router = express.Router();
const notaController = require('../controllers/notaController');

router.post('/registrar', notaController.registrarNota);

module.exports = router;
