const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/cursoController');

// Enlaza la URL /disponibles con la función del controlador
router.get('/disponibles', cursoController.obtenerCursosParaMatricula);

router.get('/cronograma-estudiante', cursoController.obtenerSesionesParaEstudiante);

router.get('/actividades-por-curso', cursoController.obtenerActividadesPorCurso);


module.exports = router;
