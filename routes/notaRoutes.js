
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const notaController = require('../controllers/notaController');



// Configuración de almacenamiento físico de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir); // Crea la carpeta si no existe
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Le damos un nombre único basado en el tiempo para que no se pisen archivos con el mismo nombre
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });


// Definición de endpoints para el docente
router.get('/alumnos-curso', notaController.obtenerAlumnosPorCurso);
router.post('/registrar', notaController.registrarNota);
router.get('/mis-cursos-docente', notaController.obtenerCursosPorDocente);
router.get('/profesores/perfil/:id', notaController.obtenerPerfilProfesor);


// 🔥 NUEVAS RUTAS DE SESIONES Y MATERIALES CONECTADAS
router.get('/sesion-materiales', notaController.obtenerMaterialesSesion);
// Usamos upload.single('archivo') para indicarle a Express que reciba el documento adjunto
router.post('/guardar-contenido', upload.single('archivo'), notaController.guardarContenidoSesion);

router.post('/eliminar-material', notaController.eliminarMaterialSesion);

router.get('/sesiones-curso', notaController.obtenerSesionesPorCurso);


// Ruta para jalar el resumen de lo programado en la zona derecha
router.get('/actividades-sesion', notaController.obtenerActividadesPorSesion);

// Ruta para procesar el formulario del modal flotante (Soporta 1 archivo adjunto)
router.post('/crear-actividad', upload.single('archivo'), notaController.crearActividadEvaluativa);

router.post('/actualizar-actividad-cronograma', upload.single('archivo'), notaController.actualizarActividadCronograma);

router.post('/eliminar-actividad-cronograma', notaController.eliminarActividadCronograma);

router.post('/guardar-asistencia', notaController.guardarAsistenciaAula);

router.get('/obtener-asistencias-guardadas', notaController.obtenerAsistenciasGuardadas);



module.exports = router;

