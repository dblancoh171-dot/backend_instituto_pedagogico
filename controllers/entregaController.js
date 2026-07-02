const db = require('../config/db'); // Tu conexión a MySQL de Aiven.io
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 🛡️ Asegurar la existencia física de la carpeta de entregas de alumnos
const directorioEntregas = path.join(__dirname, '../uploads/entregas');
if (!fs.existsSync(directorioEntregas)) {
    fs.mkdirSync(directorioEntregas, { recursive: true });
}

// 🎚️ CONFIGURACIÓN DE ALMACENAMIENTO ATÓMICO CON MULTER
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, directorioEntregas);
    },
    filename: (req, file, cb) => {
        // Renombramos el archivo con un timestamp único para evitar colisiones (Ej: alumno-10-act-3-178267535.pdf)
        const idEstudiante = req.body.estudiante_id || 'anon';
        const idActividad = req.body.actividad_id || 'act';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `est-${idEstudiante}-act-${idActividad}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// Filtro estricto de extensiones a nivel de servidor (Seguridad del Sistema)
const fileFilter = (req, file, cb) => {
    const filetypes = /pdf|zip|docx|doc/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) return cb(null, true);
    cb(new Error("❌ Tipo de archivo no autorizado por el instituto. Solo se admiten extensiones PDF, ZIP o DOCX."));
};

exports.upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // Tope máximo estricto de 15MB
});

// 🚀 FUNCIÓN ATÓMICA: Registrar la entrega física del estudiante en MySQL
exports.registrarEntregaActividadEstudiante = async (req, res) => {
    const { actividad_id, estudiante_id, comentario_alumno } = req.body;

    // Validamos que se haya adjuntado un archivo real en la petición HTTP
    if (!req.file) {
        return res.status(400).json({ message: "Falta adjuntar el documento digital de la actividad." });
    }

    if (!actividad_id || !estudiante_id) {
        // Si faltan llaves, borramos el archivo subido preventivamente para no dejar basura en el disco duro
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Faltan parámetros de identidad obligatorios (actividad_id o estudiante_id)." });
    }

    try {
        console.log(`-> [AIVEN.IO] Procesando entrega física para Actividad: ${actividad_id} | Alumno: ${estudiante_id}`);

        // 🛡️ ESCUDO DE CONTROL DE TIEMPO INTERNO (Antes de tocar el Trigger de la BD)
        const [actividad] = await db.query(
            "SELECT fecha_limite FROM actividades_evaluativas WHERE id = ?", 
            [Number(actividad_id)]
        );

        if (actividad.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: "La actividad evaluativa no existe en el sistema." });
        }

        const fechaLimite = new Date(actividad[0].fecha_limite);
        const fechaActual = new Date();

        if (fechaActual > fechaLimite) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: "❌ Envío bloqueado: El plazo límite establecido por el docente ha caducado legítimamente." });
        }

        // Construimos la ruta relativa para guardar en la columna varchar de tu base de datos
        const urlArchivoBD = `/uploads/entregas/${req.file.filename}`;

        // Inserción relacional directa (Dejamos los campos de nota en null por defecto para el profesor)
        await db.query(`
            INSERT INTO entregas_alumnos 
                (actividad_id, estudiante_id, nombre_archivo_estudiante, archivo_alumno_url, comentario_docente, estado_evaluacion) 
            VALUES (?, ?, ?, ?, ?, 'PENDIENTE')
            ON DUPLICATE KEY UPDATE 
                nombre_archivo_estudiante = VALUES(nombre_archivo_estudiante),
                archivo_alumno_url = VALUES(archivo_alumno_url),
                fecha_entrega = CURRENT_TIMESTAMP
        `, [Number(actividad_id), Number(estudiante_id), req.file.originalname, urlArchivoBD, comentario_alumno || null]);

        return res.status(201).json({
            message: "🚀 Actividad enviada con éxito absoluto. El documento fue registrado en el repositorio institucional.",
            archivo_url: urlArchivoBD
        });

    } catch (error) {
        console.error("🚨 Error crítico al procesar la entrega del estudiante:", error);
        // Seguro de limpieza en caso de colapso de red
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: error.message });
    }
};



// 🟢 ADICIÓN CRÍTICA FINANCIADA: Recupera la nómina completa y cruza con las entregas reales en Aiven.io
// 🟢 CONEXIÓN EN CASCADA CORREGIDA SEGÚN TUS TABLAS DE WORKBENCH
exports.obtenerDetalleEntregasPorActividad = async (req, res) => {
    const { actividad_id, curso_id } = req.query;

    if (!actividad_id || !curso_id) {
        return res.status(400).json({ 
            message: "Faltan parámetros obligatorios en la consulta (actividad_id y curso_id)." 
        });
    }

    try {
        console.log(`-> [AIVEN.IO] Ejecutando cruce relacional en cascada perfecta...`);

        // 🔗 EL QUERY SUPREMO: Conectamos estudiantes -> usuarios -> matriculas -> matricula_detalles
        const [reporte] = await db.query(`
            SELECT 
                e.id AS estudiante_id,
                CONCAT(u.apellidos, ', ', u.nombres) AS nombre_completo_alumno,
                e.codigo_estudiante AS codigo_alumno,
                
                -- Campos de la bandeja de entregas
                ea.id AS entrega_id,
                ea.archivo_alumno_url,
                ea.nombre_archivo_estudiante,
                ea.comentario_docente AS comentario_alumno,
                DATE_FORMAT(ea.fecha_entrega, '%d %b %Y, %I:%i %p') AS fecha_entrega_formateada,
                ea.nota,
                ea.estado_evaluacion
            FROM estudiantes e
            -- 👥 UNIÓN 1: Jalamos los nombres desde la tabla usuarios
            INNER JOIN usuarios u ON e.usuario_id = u.id
            
            -- 🛡️ UNIÓN 2: Conectamos al estudiante con su cabecera de matrícula
            INNER JOIN matriculas m ON m.estudiante_id = e.id
            
            -- 📖 UNIÓN 3: Conectamos la cabecera con el detalle del curso según tu imagen de Workbench
            INNER JOIN matricula_detalles md ON md.matricula_id = m.id
            
            -- 📁 UNIÓN 4: Cruzamos con los archivos subidos por el alumno
            LEFT JOIN entregas_alumnos ea ON ea.actividad_id = ? AND ea.estudiante_id = e.id
            WHERE md.curso_id = ?
            ORDER BY nombre_completo_alumno ASC
        `, [Number(actividad_id), Number(curso_id)]);

        return res.status(200).json(reporte);

    } catch (error) {
        console.error("🚨 Error crítico interno en obtenerDetalleEntregasPorActividad:", error);
        return res.status(500).json({ error: error.message });
    }
};


// 🟢 NUEVO: Guardar o actualizar la calificación dada por el profesor a un estudiante
exports.guardarCalificacionEntrega = async (req, res) => {
    const { actividad_id, estudiante_id, nota } = req.body;

    // Validación rigurosa de los rangos de nota vigentes en el instituto
    if (actividad_id === undefined || estudiante_id === undefined || nota === undefined) {
        return res.status(400).json({ message: "Faltan parámetros obligatorios (actividad_id, estudiante_id, nota)." });
    }

    const notaNum = Number(nota);
    if (isNaN(notaNum) || notaNum < 0 || notaNum > 20) {
        return res.status(400).json({ message: "La calificación debe ser un valor numérico válido entre 00 y 20." });
    }

    try {
        console.log(`-> [AIVEN.IO] Asentando Nota: ${notaNum} para Alumno ID: ${estudiante_id} en Actividad: ${actividad_id}`);

        // Ejecutamos un UPDATE directo sobre la entrega del alumno
        const [resultado] = await db.query(`
            UPDATE entregas_alumnos 
            SET 
                nota = ?, 
                estado_evaluacion = 'CALIFICADO'
            WHERE actividad_id = ? AND estudiante_id = ?
        `, [notaNum, Number(actividad_id), Number(estudiante_id)]);

        // Si el alumno no ha subido archivo, no hay registro en entregas_alumnos. Creamos el registro vacío con la nota.
        if (resultado.affectedRows === 0) {
            await db.query(`
                INSERT INTO entregas_alumnos 
                    (actividad_id, estudiante_id, nombre_archivo_estudiante, archivo_alumno_url, nota, estado_evaluacion)
                VALUES (?, ?, 'Sin archivo', '/uploads/entregas/vacio.pdf', ?, 'CALIFICADO')
            `, [Number(actividad_id), Number(estudiante_id), notaNum]);
        }

        return res.status(200).json({ message: "Calificación registrada con éxito absoluto." });

    } catch (error) {
        console.error("🚨 Error crítico al guardar calificación:", error);
        return res.status(500).json({ error: error.message });
    }
};


