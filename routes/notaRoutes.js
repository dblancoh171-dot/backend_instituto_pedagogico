
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



const storageActas = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/actas';
        // Creamos la subcarpeta de forma automática si aún no existe en el disco
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true }); 
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Le asignamos un nombre formal institucional basado en el timestamp y el nombre original
        cb(null, `ACTA-FIRMA-${Date.now()}${path.extname(file.originalname)}`);
    }
});



// 🔒 NUEVO FILTRO DE SEGURIDAD: Valida de forma estricta que sea SÓLO PDF
const pdfFileFilter = (req, file, cb) => {
    // Expresión regular para buscar la extensión pdf
    const filetypes = /pdf/;
    
    // 1. Validamos la extensión del archivo original (.pdf)
    const extensionValida = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    // 2. Validamos el tipo MIME real que envía el archivo (application/pdf)
    const mimeTypeValido = filetypes.test(file.mimetype);

    if (extensionValida && mimeTypeValido) {
        return cb(null, true); // Cumple las dos condiciones, permite la subida
    } else {
        // Dispara un error inmediato controlable en tu bloque try/catch
        return cb(new Error('Formato no permitido. El documento debe ser estrictamente un archivo en formato PDF.'), false);
    }
};

// Instanciamos tu middleware inyectándole el validador estricto de seguridad
const uploadActas = multer({ 
    storage: storageActas,
    fileFilter: pdfFileFilter, // 🎯 Activamos el filtro de extensión
    limits: { fileSize: 10 * 1024 * 1024 } // Opcional: Límite de 10MB por acta por seguridad
});

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

router.post('/publicar-acta', notaController.publicarActaNotas);

router.get('/mis-calificaciones-alumno', notaController.obtenerCursosEstudiante);

router.get('/boleta-detallada-alumno', notaController.obtenerBoletaDetalladaEstudiante);

router.get('/asistencia-dona-alumno', notaController.obtenerAsistenciaEstudianteDona);

router.post('/cerrar-acta-final', notaController.consolidarCierreActaFinal);

router.get('/actas-consolidadas', notaController.obtenerActasConsolidadas);

// 📄 EN ROUTES/NOTAROUTES.JS: Enlace directo al motor de renderizado PDFKit
router.get('/acta-pdf', notaController.generarPdfActaOficial);

router.put(
    '/actas-consolidadas/:id/documento', 
    uploadActas.single('documento_acta'), // ◄ ¡Usa el cargador dedicado de actas!
    notaController.actualizarDocumentoActa
);

module.exports = router;

