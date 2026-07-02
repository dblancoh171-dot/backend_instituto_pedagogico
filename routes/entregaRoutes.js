const express = require('express');
const router = express.Router();
const entregaController = require('../controllers/entregaController');

// 🟢 ENTRADA DE FORM-DATA MULTIPART: Multer procesa el archivo (.single) y luego ejecuta el controlador
router.post('/enviar-trabajo', entregaController.upload.single('archivo_entregable'), entregaController.registrarEntregaActividadEstudiante);

module.exports = router;
