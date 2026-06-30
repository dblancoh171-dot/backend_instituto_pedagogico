const db = require('../config/db');

// 1. 🔥 NUEVO: Función obligatoria para traer la lista de alumnos inscritos en el curso
exports.obtenerAlumnosPorCurso = async (req, res) => {
    const curso_id = req.query.curso_id;

    console.log("-> [BACKEND] Solicitando alumnos para Curso ID:", curso_id);

    if (!curso_id) {
        return res.status(400).json({ message: "El parámetro curso_id es requerido." });
    }

    try {
        const [rows] = await db.query(`
            SELECT DISTINCT
                e.id AS estudiante_id,
                u.nombres,
                u.apellidos,
                u.dni
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            INNER JOIN estudiantes e ON m.estudiante_id = e.id
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE md.curso_id = ?
            ORDER BY u.apellidos ASC
        `, [Number(curso_id)]);

        return res.status(200).json(rows);
    } catch (error) {
        console.error("🚨 Error real en obtenerAlumnosPorCurso:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 2. Tu función de registro corregida y adaptada con la columna 'resultado'
exports.registrarNota = async (req, res) => {
    const { estudiante_id, curso_id, semestre_id, nota_final } = req.body;

    if (nota_final < 0 || nota_final > 20) {
        return res.status(400).json({ message: "La nota debe estar entre 0 y 20." });
    }

    // 🔥 CALCULO AUTOMÁTICO DE ESTADO ACADÉMICO MINEDU (Aprobado >= 11)
    const resultado = nota_final >= 11 ? 'aprobado' : 'desaprobado';

    try {
        const [matricula] = await db.query(
            'SELECT id FROM matriculas WHERE estudiante_id = ? AND semestre_id = ?',
            [estudiante_id, semestre_id]
        );

        if (matricula.length === 0) {
            return res.status(400).json({ message: "El estudiante no está matriculado en este semestre." });
        }

        // 🔥 CORRECCIÓN: Insertamos 5 valores y actualizamos ambos en caso de duplicados
        await db.query(`
            INSERT INTO notas (estudiante_id, curso_id, semestre_id, nota_final, resultado)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                nota_final = VALUES(nota_final),
                resultado = VALUES(resultado)
        `, [estudiante_id, curso_id, semestre_id, nota_final, resultado]);

        res.status(200).json({ message: "Nota registrada correctamente.", resultado });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



// 🔥 NUEVO: Obtener las asignaturas asignadas al profesor desde carga_academica
exports.obtenerCursosPorDocente = async (req, res) => {
    const { profesor_id, semestre_id } = req.query;

    if (!profesor_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros (profesor_id o semestre_id)." });
    }

    try {
        const [cursos] = await db.query(`
            SELECT 
                c.id AS curso_id,
                c.nombre AS curso_nombre,
                c.ciclo,
                CONCAT('SI', c.ciclo, '0', c.id) AS codigo,
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(UPPER(SUBSTRING(h.dia_semana, 1, 1)), SUBSTRING(h.dia_semana, 2), ' (', DATE_FORMAT(h.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h.hora_fin, '%H:%i'), ')')
                            SEPARATOR ' / '
                        )
                        FROM horarios h
                        WHERE h.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario,
                'Aula por Asignar' AS aula
            FROM carga_academica ca
            JOIN cursos c ON ca.curso_id = c.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [profesor_id, semestre_id]);

        res.status(200).json(cursos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};




// 🔥 REGLA CRÍTICA: Asegúrate de que empiece exactamente con 'exports.'
exports.obtenerCursosPorDocente = async (req, res) => {
    const { profesor_id, semestre_id } = req.query;

    if (!profesor_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros (profesor_id o semestre_id)." });
    }

    try {
        // ⏰ CÁLCULO DE TIEMPO REAL: Obtenemos el nombre del día en español usando el reloj del sistema
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const fechaActual = new Date();
        const diaHoy = diasSemana[fechaActual.getDay()];

        const fechaManana = new Date();
        fechaManana.setDate(fechaActual.getDate() + 1);
        const diaManana = diasSemana[fechaManana.getDay()];

        const [cursos] = await db.query(`
            SELECT 
                c.id AS curso_id,
                c.nombre AS curso_nombre,
                c.ciclo,
                CONCAT('SI', c.ciclo, '0', c.id) AS codigo,
                
                -- JALAMOS EL HORARIO FORMATEADO DE TU TABLA horarios
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(UPPER(SUBSTRING(h.dia_semana, 1, 1)), SUBSTRING(h.dia_semana, 2), ' (', DATE_FORMAT(h.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h.hora_fin, '%H:%i'), ')')
                            SEPARATOR ' / '
                        )
                        FROM horarios h
                        WHERE h.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario,
                'Aula por Asignar' AS aula,

                -- ALERTA INTERACTIVA 1: Verifica de forma real si dicta hoy, mañana o en otra fecha
                IFNULL(
                    (
                        SELECT CASE 
                            WHEN SUM(CASE WHEN h2.dia_semana = ? THEN 1 ELSE 0 END) > 0 THEN 'Próxima Clase: Hoy'
                            WHEN SUM(CASE WHEN h2.dia_semana = ? THEN 1 ELSE 0 END) > 0 THEN 'Próxima Clase: Mañana'
                            ELSE 'Sin clases próximas'
                        END
                        FROM horarios h2
                        WHERE h2.carga_academica_id = ca.id
                    ),
                    'Sin clases próximas'
                ) AS estatus_clase,

                -- ALERTA INTERACTIVA 2: Cuenta cuántos alumnos matriculados no tienen nota en este curso
                (
                    SELECT COUNT(md.id)
                    FROM matricula_detalles md
                    JOIN matriculas m ON md.matricula_id = m.id
                    LEFT JOIN notas n ON n.estudiante_id = m.estudiante_id AND n.curso_id = md.curso_id AND n.semestre_id = m.semestre_id
                    WHERE md.curso_id = c.id 
                      AND m.semestre_id = ca.semestre_id 
                      AND n.nota_final IS NULL
                ) AS notas_pendientes_count

            FROM carga_academica ca
            JOIN cursos c ON ca.curso_id = c.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [diaHoy, diaManana, profesor_id, semestre_id]);

        res.status(200).json(cursos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// 🔥 NUEVO: Obtener los datos del perfil del profesor desde la base de datos
exports.obtenerPerfilProfesor = async (req, res) => {
    const { id } = req.params; // Este es el profesor_id (Ej: 1)

    console.log(`-> [AIVEN.IO] Extrayendo perfil del Profesor ID: ${id}`);

    try {
        // 🔥 LA CORRECCIÓN CLAVE: Cruzamos profesores con usuarios para extraer 
        // los nombres, apellidos y DNI desde la tabla central humana, y validamos su estado_id
        const [rows] = await db.query(`
            SELECT 
                p.id AS profesor_id,
                p.codigo_docente,
                u.id AS usuario_id,
                u.nombres,
                u.apellidos,
                u.dni,
                u.email,
                e.nombre AS estado_nombre
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN estados e ON p.estado_id = e.id
            WHERE p.id = ?
        `, [Number(id)]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Profesor no encontrado en los registros institucionales." });
        }

        // Enviamos el objeto limpio al Frontend con toda su identidad resuelta
        res.status(200).json(rows[0]);

    } catch (error) {
        console.error("Error crítico en obtenerPerfilProfesor:", error);
        res.status(500).json({ error: error.message });
    }
};



// 🔥 FUNCIÓN 1: Guardar el título de la sesión y registrar el archivo en la base de datos
exports.guardarContenidoSesion = async (req, res) => {
    const { sesion_id, titulo } = req.body;

    if (!sesion_id) {
        return res.status(400).json({ message: "El ID de la sesión es obligatorio." });
    }

    try {
        // 1. Actualizamos el título de la sesión en la base de datos
        if (titulo !== undefined) {
            await db.query(
                'UPDATE sesiones SET titulo = ? WHERE id = ?',
                [titulo.trim(), Number(sesion_id)]
            );
        }

        // 2. Si el profesor subió un archivo, lo registramos en la tabla 'sesion_materiales'
        if (req.file) {
            const nombreArchivo = req.file.originalname;
            const urlArchivo = `/uploads/${req.file.filename}`; // Ruta virtual para descargar

            await db.query(
                'INSERT INTO sesion_materiales (sesion_id, nombre_archivo, url_archivo) VALUES (?, ?, ?)',
                [sesion_id, nombreArchivo, urlArchivo]
            );
        }

        res.status(200).json({ message: "¡Contenido y materiales guardados con éxito en la base de datos!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 🔥 FUNCIÓN 2: Obtener los materiales ya subidos de una sesión (Para pintar la lista derecha al cargar)
exports.obtenerMaterialesSesion = async (req, res) => {
    const { sesion_id } = req.query;
    try {
        const [materiales] = await db.query(
            'SELECT id, nombre_archivo, url_archivo FROM sesion_materiales WHERE sesion_id = ? ORDER BY id DESC',
            [sesion_id]
        );
        res.status(200).json(materiales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


const fs = require('fs');
const path = require('path');

// 🔥 NUEVO: Eliminar material adjunto de la base de datos y del almacenamiento local
exports.eliminarMaterialSesion = async (req, res) => {
    const { material_id } = req.body;

    if (!material_id) {
        return res.status(400).json({ message: "El ID del material es obligatorio." });
    }

    try {
        // 1. Buscamos primero el archivo en la base de datos para conocer su URL física
        const [material] = await db.query('SELECT url_archivo FROM sesion_materiales WHERE id = ?', [material_id]);

        if (material.length === 0) {
            return res.status(404).json({ message: "El archivo no existe en el servidor." });
        }

        const rutaFisica = path.join(__dirname, '..', material[0].url_archivo);

        // 2. Borramos el archivo físico del disco de tu computadora si es que existe
        if (fs.existsSync(rutaFisica)) {
            fs.unlinkSync(rutaFisica);
        }

        // 3. Borramos el registro definitivo de tu tabla en Aiven.io
        await db.query('DELETE FROM sesion_materiales WHERE id = ?', [material_id]);

        res.status(200).json({ message: "Archivo eliminado exitosamente del repositorio." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};




// 🔥 NUEVO: Traer las sesiones reales indexadas de un curso y semestre
exports.obtenerSesionesPorCurso = async (req, res) => {
    const { curso_id, semestre_id } = req.query;

    // Log de auditoría para verificar en tu terminal qué datos pide el Frontend
    //console.log(`-> Petición de Sesiones recibida. Curso ID: ${curso_id} | Semestre ID: ${semestre_id}`);

    if (!curso_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros obligatorios (curso_id o semestre_id)." });
    }

    try {
        // Incluimos fecha_clase de forma explícita para que haga match perfecto con tu Workbench
        const [rows] = await db.query(
                    `SELECT 
                s.id, 
                s.curso_id, 
                s.semestre_id, 
                s.numero_sesion, 
                s.titulo, 
                s.fecha_clase,
                IF(
                    (SELECT COUNT(*) FROM control_asistencias ca WHERE ca.sesion_id = s.id) > 0, 
                    'realizado', 
                    'pendiente'
                ) AS estado_asistencia
            FROM sesiones s 
            WHERE s.curso_id = ? AND s.semestre_id = ? 
            ORDER BY s.numero_sesion ASC`
            , [Number(curso_id), Number(semestre_id)]
        );

        console.log(`-> Sesiones encontradas en Aiven.io: ${rows.length} filas.`);
        res.status(200).json(rows);
    } catch (error) {
        console.error("Error crítico en obtenerSesionesPorCurso:", error);
        res.status(500).json({ error: error.message });
    }
};




// 🔥 1. Guardar una nueva actividad evaluativa creada desde el modal flotante
exports.crearActividadEvaluativa = async (req, res) => {
    const { sesion_id, titulo, descripcion, tipo_documento, fecha_limite, puntuacion_maxima } = req.body;

    if (!sesion_id || !titulo || !fecha_limite) {
        return res.status(400).json({ message: "Faltan parámetros obligatorios (sesion_id, titulo o fecha_limite)." });
    }

    try {
        // Si el profesor subió un archivo guía opcional en el modal, capturamos su ruta física
        let archivoUrl = null;
        if (req.file) {
            archivoUrl = `/uploads/${req.file.filename}`;
        }

        // Insertar registro limpio en Aiven.io
        const [resultado] = await db.query(`
            INSERT INTO actividades_evaluativas 
            (sesion_id, titulo, descripcion, tipo_documento, archivo_adjunto_url, fecha_limite, puntuacion_maxima) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            Number(sesion_id),
            titulo.trim(),
            descripcion ? descripcion.trim() : null,
            tipo_documento,
            archivoUrl,
            fecha_limite,
            Number(puntuacion_maxima || 20)
        ]);

        res.status(201).json({
            message: "¡Actividad evaluativa programada con éxito!",
            actividad_id: resultado.insertId
        });

    } catch (error) {
        console.error("Error al crear actividad evaluativa:", error);

        // 🛡️ CAPTURA EL CANDADO DE MYSQL: Si el Trigger aborta la inserción por llegar a 5
        if (error.sqlState === '45000') {
            return res.status(400).json({ message: error.message });
        }

        return res.status(500).json({ error: error.message });
    }
};

// 🔥 2. Obtener el listado de actividades de una sesión para el cuadro de Resumen
exports.obtenerActividadesPorSesion = async (req, res) => {
    const { sesion_id } = req.query;

    if (!sesion_id) {
        return res.status(400).json({ message: "El ID de la sesión es requerido." });
    }

    try {
        const [actividades] = await db.query(`
            SELECT 
                id, 
                titulo, 
                descripcion, 
                tipo_documento, 
                archivo_adjunto_url, 
                fecha_limite,
                -- 🔥 EXTRAEMOS LA FECHA EN FORMATO EXIGIDO POR EL NAVEGADOR (YYYY-MM-DD)
                DATE_FORMAT(fecha_limite, '%Y-%m-%d') AS fecha_plana,
                -- 🔥 EXTRAEMOS LA HORA EN FORMATO EXIGIDO POR EL NAVEGADOR (HH:MM)
                DATE_FORMAT(fecha_limite, '%H:%i') AS hora_plana,
                -- Este se mantiene para pintar la tarjeta azul en la pantalla principal
                DATE_FORMAT(fecha_limite, '%d de %M, %h:%i %p') AS fecha_formateada,
                puntuacion_maxima 
            FROM actividades_evaluativas 
            WHERE sesion_id = ? 
            ORDER BY id ASC
        `, [Number(sesion_id)]);

        res.status(200).json(actividades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



// 🔥 NUEVO: Actualizar los datos de una actividad existente
exports.actualizarActividadCronograma = async (req, res) => {
    const { id, titulo, descripcion, tipo_documento, fecha_limite, puntuacion_maxima } = req.body;

    if (!id) return res.status(400).json({ message: "El ID de la actividad es obligatorio." });

    try {
        // 1. Modificamos los campos de texto base
        await db.query(`
            UPDATE actividades_evaluativas 
            SET titulo = ?, descripcion = ?, tipo_documento = ?, fecha_limite = ?, puntuacion_maxima = ?
            WHERE id = ?
        `, [titulo.trim(), descripcion ? descripcion.trim() : null, tipo_documento, fecha_limite, Number(puntuacion_maxima), Number(id)]);

        // 2. Si el profesor reemplazó el PDF guía, actualizamos su URL
        if (req.file) {
            const archivoUrl = `/uploads/${req.file.filename}`;
            await db.query('UPDATE actividades_evaluativas SET archivo_adjunto_url = ? WHERE id = ?', [archivoUrl, Number(id)]);
        }

        res.status(200).json({ message: "Registro actualizado de forma exitosa." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



// 🔥 NUEVO: Eliminar una actividad evaluativa por su ID
exports.eliminarActividadCronograma = async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "El ID de la actividad es requerido." });

    try {
        await db.query('DELETE FROM actividades_evaluativas WHERE id = ?', [Number(id)]);
        res.status(200).json({ message: "Actividad removida con éxito de Aiven.io" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};







// 🔥 NUEVO: Procesar y asentar las asistencias de un aula en Aiven.io
exports.guardarAsistenciaAula = async (req, res) => {
    const { sesion_id, registros } = req.body;

    if (!sesion_id || !registros || !Array.isArray(registros) || registros.length === 0) {
        return res.status(400).json({ message: "Parámetros inválidos o lote de alumnos vacío." });
    }

    try {
        // Mapeamos el lote de marcas en un arreglo de arreglos para el insert masivo
        const valoresLote = registros.map(reg => [
            Number(sesion_id),
            Number(reg.estudiante_id),
            Number(reg.asistio)
        ]);

        console.log(`-> [AIVEN.IO] Procesando actualización masiva para Sesión ID: ${sesion_id}`);

        // 🔥 LA MAGIA DE MYSQL: Inserta si no existe, o hace UPDATE en el mismo ID si ya existe
        // gracias al índice UNIQUE relacional, manteniendo los IDs correlativos intactos.
        await db.query(`
            INSERT INTO control_asistencias (sesion_id, estudiante_id, asistio) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE asistio = VALUES(asistio)
        `, [valoresLote]);

        console.log(`-> [ÉXITO] Asistencias actualizadas correctamente sobre sus mismos registros.`);
        res.status(200).json({ message: "¡Asistencias actualizadas de forma limpia en el repositorio!" });

    } catch (error) {
        console.error("Error crítico en guardarAsistenciaAula:", error);
        res.status(500).json({ error: error.message });
    }
};



// 🔥 NUEVO: Obtener el histórico de asistencias guardadas de una sesión
exports.obtenerAsistenciasGuardadas = async (req, res) => {
    const { sesion_id } = req.query;

    if (!sesion_id) {
        return res.status(400).json({ message: "El parámetro sesion_id es requerido." });
    }

    try {
        const [rows] = await db.query(`
            SELECT estudiante_id, asistio 
            FROM control_asistencias 
            WHERE sesion_id = ?
        `, [Number(sesion_id)]);

        res.status(200).json(rows);
    } catch (error) {
        console.error("Error en obtenerAsistenciasGuardadas:", error);
        res.status(500).json({ error: error.message });
    }
};





