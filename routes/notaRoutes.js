
const express = require('express');
const router = express.Router();
const notaController = require('../controllers/notaController');


// Definición de endpoints para el docente
router.get('/alumnos-curso', notaController.obtenerAlumnosPorCurso);
router.post('/registrar', notaController.registrarNota);
router.get('/mis-cursos-docente', notaController.obtenerCursosPorDocente);

module.exports = router;

