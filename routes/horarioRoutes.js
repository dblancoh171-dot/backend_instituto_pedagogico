const express = require('express');
const router = express.Router();
const horarioController = require('../controllers/horarioController');

// Pasarela de red lícita para consultar el cronograma
router.get('/mi-agenda', horarioController.obtenerHorarioProfesor);

module.exports = router;
