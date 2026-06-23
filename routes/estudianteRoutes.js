const express = require('express');
const router = express.Router();
const estudianteController = require('../controllers/estudianteController');

// Ruta para obtener la lista
router.get('/listar', estudianteController.listarEstudiantes);

module.exports = router;
