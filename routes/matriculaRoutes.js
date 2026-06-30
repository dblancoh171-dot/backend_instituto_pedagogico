const express = require('express');
const router = express.Router();
const matriculaController = require('../controllers/matriculaController');

router.post('/matricular', matriculaController.matricularEstudiante);

// 🟢 REGISTRO DE RUTA PARA LA VISTA DE MIS CURSOS
router.get('/mis-cursos', matriculaController.obtenerCursosMatriculadosEstudiante);


module.exports = router;
