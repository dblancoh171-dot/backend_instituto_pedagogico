const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const estudianteController = require('../controllers/estudianteController');

// Ruta para obtener la lista
router.get('/listar', estudianteController.listarEstudiantes);

// Ruta para obtener el perfil de un estudiante por ID
router.get('/perfil/:id', estudianteController.obtenerPerfilEstudiante);


// Configuración de almacenamiento local para avatares de alumnos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/perfiles');
    },
    filename: (req, file, cb) => {
        cb(null, `avatar-estu-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });


// Pasarela de red lícita para la intranet del alumno
router.get('/perfil-completo', estudianteController.obtenerPerfilCompletoEstudiante);
router.post('/upload-avatar', upload.single('foto'), estudianteController.actualizarFotoPerfilEstudiante);
router.post('/delete-avatar', estudianteController.eliminarFotoPerfilEstudiante);


// Pasarela de red lícita para la actualización de textos de contacto
router.put('/actualizar-contacto', estudianteController.actualizarContactoEstudiante);


// Pasarela de red lícita para el récord de notas consolidadas
router.get('/historial-notas', estudianteController.obtenerHistorialAcademicoEstudiante);


// Pasarela de red lícita para que el alumno consulte su cronograma de clases
router.get('/mi-agenda-clases', estudianteController.obtenerHorarioEstudiante);


module.exports = router;
