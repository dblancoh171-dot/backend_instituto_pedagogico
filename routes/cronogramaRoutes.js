const express = require('express');
const router = express.Router();
const cronogramaController = require('../controllers/cronogramaController');

// Mapeamos los endpoints relacionales
router.post('/registrar', cronogramaController.guardarEvaluacionCronograma);
router.put('/actualizar/:id', cronogramaController.actualizarEvaluacionCronograma);

module.exports = router;
