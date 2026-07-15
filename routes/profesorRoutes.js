const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const profesorController = require('../controllers/profesorController');

// ⚙️ CONFIGURACIÓN DE DISCO DE MULTER: Evitamos nombres duplicados
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/perfiles';
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Filtro de seguridad para admitir únicamente imágenes reales
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return cb(new Error('Formato invalido. Solo se admiten imagenes JPG, JPEG o PNG.'));
        }
        cb(null, true);
    }
});



// ⚙️ CONFIGURACIÓN DE DISCO PARA GRADUACIONES
const storageGrados = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, './uploads/grados'); },
    filename: (req, file, cb) => { cb(null, `grado-${Date.now()}${path.extname(file.originalname)}`); }
});
const uploadGrado = multer({ storage: storageGrados });

// ⚙️ CONFIGURACIÓN DE DISCO PARA EXPERIENCIAS
const storageExp = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, './uploads/experiencias'); },
    filename: (req, file, cb) => { cb(null, `exp-${Date.now()}${path.extname(file.originalname)}`); }
});
const uploadExp = multer({ storage: storageExp });





// 🚀 PASARELAS POST CONECTADAS CON TUS NUEVOS MODALES MOVIBLES
router.post('/grado', uploadGrado.single('sustentoPdf'), profesorController.crearGradoAcademico);
router.post('/experiencia', uploadExp.single('sustentoPdf'), profesorController.crearExperienciaLaboral);


// 🚀 PASARELAS DE ACTUALIZACIÓN (PUT) CON MIDDLEWARE DE CARGA MULTIMEDIA
router.put('/grado/:id', uploadGrado.single('sustentoPdf'), profesorController.actualizarGradoAcademico);
router.put('/experiencia/:id', uploadExp.single('sustentoPdf'), profesorController.actualizarExperienciaLaboral);

// 🚀 PASARELAS DE ELIMINACIÓN DE RÉCORDS (DELETE)
router.delete('/grado/:id', profesorController.eliminarGradoAcademico);
router.delete('/experiencia/:id', profesorController.eliminarExperienciaLaboral);





// 🚀 PASARELAS DE RED REIVINDICADAS PARA TU MONITOR
router.get('/perfil-completo', profesorController.obtenerPerfilCompletoDocente);
router.post('/upload-avatar', upload.single('foto'), profesorController.actualizarFotoPerfilDocente); // Guarda y Edita
router.post('/delete-avatar', profesorController.eliminarFotoPerfilDocente); // Elimina

module.exports = router;

