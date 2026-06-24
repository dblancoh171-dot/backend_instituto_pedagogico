const express = require('express');
const router = express.Router();
const estudianteController = require('../controllers/estudianteController');

// Ruta para obtener la lista
router.get('/listar', estudianteController.listarEstudiantes);

// Ruta para obtener el perfil de un estudiante por ID
router.get('/perfil/:id', estudianteController.obtenerPerfilEstudiante);


module.exports = router;
