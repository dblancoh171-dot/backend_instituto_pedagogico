const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/cursoController');

// Enlaza la URL /disponibles con la función del controlador
router.get('/disponibles', cursoController.obtenerCursosParaMatricula);

module.exports = router;
