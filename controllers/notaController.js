const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');


// 1. 🔥 NUEVO: Función obligatoria para traer la lista de alumnos inscritos en el curso
// 📌 REEMPLAZO EXACTO DESDE LA PÁGINA 1 HASTA LA PÁGINA 4 DE TU CONTROLLER
exports.obtenerAlumnosPorCurso = async (req, res) => {
    const curso_id = req.query.curso_id;
    const semestre_id = req.query.semestre_id;

    if (!curso_id || !semestre_id) {
        return res.status(400).json({ message: "Los parámetros curso_id y semestre_id son estrictamente requeridos." });
    }

    try {
        console.log(`-> [AIVEN.IO] Extrayendo cronograma dinámico para Semestre: ${semestre_id} | Curso: ${curso_id}`);

        // 🔒 LA REGLA DE ORO DE LA VERDAD: Validamos directamente en MySQL si esta acta ya se cerró
        const [actaVerificacion] = await db.query(
            "SELECT id FROM actas_notes WHERE curso_id = ? AND semestre_id = ?",
            [Number(curso_id), Number(semestre_id)]
        );
        const estaActaCerradaBD = actaVerificacion.length > 0; // Devuelve true si encuentra filas, false si está vacía

        // 🚀 CONSULTA 1: Traemos las evaluaciones parametrizadas
        const [configuracion] = await db.query(
            "SELECT id, nombre_nota, peso_porcentaje, fecha_inicio_ingreso, fecha_fin_ingreso FROM configuracion_notas_global WHERE semestre_id = ? ORDER BY num_evaluacion ASC",
            [Number(semestre_id)]
        );

        // 👨‍🏫 CONSULTA DE IDENTIDAD: Jalamos el nombre del profesor asignado a este curso
        const [profesorInfo] = await db.query(`
        SELECT CONCAT(u.nombres, ' ', u.apellidos) AS nombre_completo
        FROM carga_academica ca
        INNER JOIN profesores p ON ca.profesor_id = p.id
        INNER JOIN usuarios u ON p.usuario_id = u.id
        WHERE ca.curso_id = ? AND ca.semestre_id = ?
        LIMIT 1
    `, [Number(curso_id), Number(semestre_id)]);

        const nombreProfesorBD = profesorInfo.length > 0 ? profesorInfo[0].nombre_completo : 'Docente por Asignar';

        // 🚀 CONSULTA 2: Jalamos los datos base de los estudiantes matriculados
        const [alumnos] = await db.query(
            `SELECT DISTINCT 
                e.id AS estudiante_id, 
                e.codigo_estudiante, 
                u.nombres, 
                u.apellidos, 
                u.dni
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            INNER JOIN estudiantes e ON m.estudiante_id = e.id
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE md.curso_id = ? AND m.semestre_id = ?
            ORDER BY u.apellidos ASC`,
            [Number(curso_id), Number(semestre_id)]
        );

        // 🚀 CONSULTA 3: Jalamos el universo de notas existente
        let calificacionesExistentes = [];
        if (alumnos.length > 0 && configuracion.length > 0) {
            const idsEstudiantes = alumnos.map(a => a.estudiante_id);
            const idsConfiguracion = configuracion.map(c => c.id);

            const [notas] = await db.query(
                `SELECT estudiante_id, configuracion_nota_id, nota, nota_publicada 
                 FROM notas_generales_estudiantes 
                 WHERE curso_id = ? 
                 AND estudiante_id IN (?) AND configuracion_nota_id IN (?)`,
                [Number(curso_id), idsEstudiantes, idsConfiguracion]
            );
            calificacionesExistentes = notas;
        }

        // 🧠 MAPEO EN MEMORIA: Acoplamos los datos para enviarlos estructurados a React
        const listaAlumnosProcesados = alumnos.map(alumno => {
            const mapaNotasEstudiante = {};
            const mapaPublicadosEstudiante = {};

            configuracion.forEach(col => {
                const registroNota = calificacionesExistentes.find(n =>
                    n.estudiante_id === alumno.estudiante_id && n.configuracion_nota_id === col.id
                );
                mapaNotasEstudiante[col.id] = registroNota ? registroNota.nota : null;
                mapaPublicadosEstudiante[col.id] = registroNota ? registroNota.nota_publicada : 0;
            });

            return {
                id: alumno.estudiante_id,
                estudiante_id: alumno.estudiante_id,
                codigo_estudiante: alumno.codigo_estudiante,
                nombres: alumno.nombres,
                apellidos: alumno.apellidos,
                apellidos_nombres: `${alumno.apellidos} ${alumno.nombres}`,
                dni: alumno.dni,
                notas: mapaNotasEstudiante,
                publicados: mapaPublicadosEstudiante
            };
        });

        // 🚀 RETORNO INTEGRAL AL FRONTEND: Inyectamos la variable real de la base de datos
        return res.status(200).json({
            alumnos: listaAlumnosProcesados,
            configuracionNotas: configuracion,
            profesorNombre: nombreProfesorBD,
            actaCerrada: estaActaCerradaBD // ◄ ¡Garantiza que React sepa el estado real en frío!
        });

    } catch (error) {
        console.error("🚨 Error real en obtenerAlumnosPorCurso Dinámico:", error);
        return res.status(500).json({ error: error.message });
    }
};



// 2. Tu función de registro corregida y adaptada con la columna 'resultado'
// 🟢 REFACTORIZACIÓN SUPREMA: Guardado y actualización adaptado a tu nueva estructura dinámica
exports.registrarNota = async (req, res) => {
    // Capturamos las variables base desestructurando el cuerpo de la petición [01/7]
    const { estudiante_id, curso_id, semestre_id, configuracion_nota_id, nota, registros } = req.body;

    try {
        // 🚀 ESCENARIO A: GUARDADO MASIVO (Al presionar el botón azul "Guardar Cambios")
        if (registros && Array.isArray(registros) && registros.length > 0) {
            console.log(`-> [AIVEN.IO] Procesando lote masivo de ${registros.length} calificaciones con amnistía.`);

            // 🔍 A.1 JALAMOS EL CRONOGRAMA DE FECHAS OFICIAL DE LA BD PARA ESTE SEMESTRE
            // 🔥 LA CORRECCIÓN MAESTRA: Soportamos "semestre" tal como lo envía tu consola de Firefox
            // 🚀 REPARACIÓN SÓNICA: Soportamos Semestre (Con S mayúscula), semestre (minúscula) y semestre_id
            const IDSemestreSeguro = semestre_id || req.body.semestre_id || req.body.semestre || req.body.Semestre;

            console.log(`-> [BACKEND] Identificador de ciclo recuperado y verificado: ${IDSemestreSeguro}`);

            console.log(`-> [BACKEND] Identificador de ciclo recuperado: ${IDSemestreSeguro}`);

            const [cronograma] = await db.query(
                `SELECT id, fecha_inicio_ingreso, fecha_fin_ingreso 
                 FROM configuracion_notas_global 
                 WHERE semestre_id = ? 
                 ORDER BY num_evaluacion ASC`,
                [Number(IDSemestreSeguro)]
            );

            // Si el query da vacío por culpa del ID indefinido, el backend avisa de forma semántica en vez de colapsar
            if (!cronograma || cronograma.length === 0) {
                return res.status(422).json({ message: `No se registró el calendario institucional para el semestre ID: ${IDSemestreSeguro}` });
            }

            // ⏱️ Capturamos la hora actual del servidor en tiempo real
            const ahora = new Date();

            // Ubicamos cuál es la última evaluación del listado (ejemplo: la Evaluación 4)
            const ultimaEvaluacion = cronograma[cronograma.length - 1];

            // Evaluamos matemáticamente si la fecha de hoy ya se encuentra en el periodo de la última unidad
            const yaEstamosEnLaUltimaEvaluacion = ultimaEvaluacion &&
                (ahora >= new Date(ultimaEvaluacion.fecha_inicio_ingreso) &&
                    ahora <= new Date(ultimaEvaluacion.fecha_fin_ingreso));

            // 🛡️ A.2 ADUANA DE AMNISTÍA: Analizamos cada celda del lote antes de tocar MySQL
            for (const reg of registros) {
                // Buscamos el ID en cualquier variante sintáctica que mande el Front
                const idEvaluacionSeguro = reg.configuracion_nota_id || reg.configuracion_evaluacion_id || reg.id;

                if (!idEvaluacionSeguro) {
                    console.log("⚠️ Registro omitido en el escáner por falta de ID relacional:", reg);
                    continue;
                }

                // Filtro preventivo de rango 0-20 [01/10]
                if (reg.nota !== null && reg.nota !== '') {
                    const nNum = parseFloat(reg.nota);
                    if (isNaN(nNum) || nNum < 0 || nNum > 20) {
                        return res.status(422).json({ message: `La nota ${reg.nota} es inválida. Debe estar entre 0 y 20.` });
                    }
                }

                // Buscamos el rango cronológico oficial asignado a esta nota en Workbench
                const configCelda = cronograma.find(c => Number(c.id) === Number(idEvaluacionSeguro));

                if (configCelda) {
                    const fueraDeFechaCronologica = ahora < new Date(configCelda.fecha_inicio_ingreso) ||
                        ahora > new Date(configCelda.fecha_fin_ingreso);

                    // Cláusula de amnistía elástica
                    if (fueraDeFechaCronologica && !yaEstamosEnLaUltimaEvaluacion) {
                        return res.status(422).json({
                            message: "Protección del Servidor: El plazo establecido en el calendario institucional para registrar calificaciones en esta unidad ha expirado."
                        });
                    }
                }
            }

            // Convertimos el lote enviado por React en un arreglo de arreglos puro para MySQL
            const valoresLote = registros.map(reg => [
                Number(reg.estudiante_id),
                Number(reg.curso_id),
                // 🔥 ADUANA SEMÁNTICA: Sincronizamos que use la variable segura mapeada arriba
                Number(reg.configuracion_nota_id || reg.id),
                reg.nota === null || reg.nota === '' ? null : Number(reg.nota)
            ]);

            // Inserción o actualización masiva elástica apoyada en tu UNIQUE KEY compuesta
            await db.query(`
                INSERT INTO notas_generales_estudiantes 
                    (estudiante_id, curso_id, configuracion_nota_id, nota)
                VALUES ?
                ON DUPLICATE KEY UPDATE
                    nota = VALUES(nota)
            `, [valoresLote]);

            return res.status(200).json({
                message: "¡Lote masivo de calificaciones sincronizado con éxito total!"
            });
        }

        // 🚀 ESCENARIO B: GUARDADO INDIVIDUAL (Mantenemos intacto tu bloque base)
        if (estudiante_id === undefined || curso_id === undefined || configuracion_nota_id === undefined || nota === undefined) {
            return res.status(400).json({ message: "Faltan parámetros obligatorios para procesar la nota." });
        }

        let notaValidadaSql = null;
        if (nota !== null && nota !== undefined && nota !== '') {
            const notaNum = parseFloat(nota);
            if (isNaN(notaNum) || notaNum < 0 || notaNum > 20) {
                return res.status(422).json({ message: "La calificación es inválida. Debe estar estrictamente entre 00.00 y 20.00." });
            }
            notaValidadaSql = notaNum;
        }

        // CONTROL DE MATRÍCULA INTERNO DE TU PÁGINA 3
        const [matricula] = await db.query(`
            SELECT m.id FROM matriculas m
            INNER JOIN matricula_detalles md ON md.matricula_id = m.id
            WHERE m.estudiante_id = ? AND md.curso_id = ?
        `, [Number(estudiante_id), Number(curso_id)]);

        if (matricula.length === 0) {
            return res.status(400).json({ message: "El estudiante no registra matrícula activa." });
        }

        // Inserción unitaria limpia de tu monitor
        await db.query(`
            INSERT INTO notas_generales_estudiantes
                (estudiante_id, curso_id, configuracion_nota_id, nota)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                nota = VALUES(nota)
        `, [Number(estudiante_id), Number(curso_id), Number(configuracion_nota_id), notaValidadaSql]);

        return res.status(200).json({ message: "Calificación unitaria registrada correctamente." });

    } catch (error) {
        console.error("🚨 Error crítico en registrarNota Híbrido con Amnistía:", error);
        return res.status(500).json({ error: error.message });
    }
};





// 🔥 NUEVO: Obtener las asignaturas asignadas al profesor desde carga_academica
exports.obtenerCursosPorDocente = async (req, res) => {
    const { profesor_id, semestre_id } = req.query;

    if (!profesor_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros (profesor_id o semestre_id)." });
    }

    try {
        // 🔥 QUERY REDISEÑADO: Integra bloques_horarios y extrae el aula real
        const [cursos] = await db.query(`
            SELECT 
                c.id AS curso_id,
                c.nombre AS curso_nombre,
                c.ciclo,
                c.codigo AS codigo, -- Usamos el código real único de la tabla cursos que limpiamos antes
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(
                                UPPER(SUBSTRING(h.dia_semana, 1, 1)), SUBSTRING(h.dia_semana, 2), 
                                ' (', DATE_FORMAT(bh.hora_inicio, '%H:%i'), '-', DATE_FORMAT(bh.hora_fin, '%H:%i'), ') [', h.aula, ']'
                            )
                            SEPARATOR ' / '
                        )
                        FROM horarios h
                        INNER JOIN bloques_horarios bh ON h.bloque_id = bh.id
                        WHERE h.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario
            FROM carga_academica ca
            INNER JOIN cursos c ON ca.curso_id = c.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [Number(profesor_id), Number(semestre_id)]);

        return res.status(200).json(cursos);
    } catch (error) {
        console.error("🚨 Error critico SQL en obtenerCursosPorDocente:", error);
        return res.status(500).json({ error: error.message });
    }
};





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
                c.codigo AS codigo, -- 🔥 CORREGIDO: Usamos la columna unificada oficial
                
                -- JALAMOS EL HORARIO FORMATEADO DE TU NUEVA TABLA MAESTRA DEL TIEMPO
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(
                                UPPER(SUBSTRING(h.dia_semana, 1, 1)), SUBSTRING(h.dia_semana, 2), 
                                ' (', DATE_FORMAT(bh.hora_inicio, '%H:%i'), '-', DATE_FORMAT(bh.hora_fin, '%H:%i'), ') [', h.aula, ']'
                            )
                            SEPARATOR ' / '
                        )
                        FROM horarios h
                        INNER JOIN bloques_horarios bh ON h.bloque_id = bh.id -- 🔥 CORREGIDO: Enlace a bloques
                        WHERE h.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario,

                -- ALERTA INTERACTIVA 1 CORREGIDA: Blindado contra mayúsculas/minúsculas usando LOWER()
                IFNULL(
                    (
                        SELECT CASE 
                            WHEN SUM(CASE WHEN LOWER(h2.dia_semana) = LOWER(?) THEN 1 ELSE 0 END) > 0 THEN 'Próxima Clase: Hoy'
                            WHEN SUM(CASE WHEN LOWER(h2.dia_semana) = LOWER(?) THEN 1 ELSE 0 END) > 0 THEN 'Próxima Clase: Mañana'
                            ELSE 'Sin clases próximas'
                        END
                        FROM horarios h2
                        WHERE h2.carga_academica_id = ca.id
                    ),
                    'Sin clases próximas'
                ) AS estatus_clase,

                -- 🔥 ALERTA INTERACTIVA 2: Mantiene tu excelente lógica de casilleros de notas vacíos
                (
                    SELECT COUNT(DISTINCT m.estudiante_id)
                    FROM matricula_detalles md
                    INNER JOIN matriculas m ON md.matricula_id = m.id
                    WHERE md.curso_id = c.id 
                      AND m.semestre_id = ca.semestre_id
                      AND (
                          SELECT COUNT(*) 
                          FROM notas_generales_estudiantes nge
                          WHERE nge.estudiante_id = m.estudiante_id AND nge.curso_id = md.curso_id
                      ) < (
                          SELECT COUNT(*) 
                          FROM configuracion_notas_global cng
                          WHERE cng.semestre_id = ca.semestre_id
                      )
                ) AS notas_pendientes_count

            FROM carga_academica ca
            INNER JOIN cursos c ON ca.curso_id = c.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [diaHoy, diaManana, Number(profesor_id), Number(semestre_id)]);

        return res.status(200).json(cursos);
    } catch (error) {
        console.error("🚨 Error crítico en obtenerCursosPorDocente:", error);
        return res.status(500).json({ error: error.message });
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
        // 🔍 1. CAPTURAMOS EL CURSO_ID ASOCIADO A ESTA SESIÓN DESDE LA BD
        // Lo necesitamos de forma obligatoria para alimentar la auditoría y los procedimientos de asistencia.
        const [sesionInfo] = await db.query(`
            SELECT curso_id FROM sesiones WHERE id = ?
        `, [Number(sesion_id)]);

        if (!sesionInfo || sesionInfo.length === 0) {
            return res.status(404).json({ message: "La sesión especificada no existe en el sistema." });
        }
        const curso_id = sesionInfo[0].curso_id;

        // Mapeamos el lote de marcas en tu arreglo de arreglos exacto para el insert masivo
        const valoresLote = registros.map(reg => [
            Number(sesion_id),
            Number(reg.estudiante_id),
            Number(reg.asistio)
        ]);

        console.log(`-> [AIVEN.IO] Procesando actualización masiva para Sesión ID: ${sesion_id} | Curso ID: ${curso_id}`);

        // 🔥 TU MAGIA ORIGINAL DE MYSQL INTACTA CON MÁXIMO RENDIMIENTO
        await db.query(`
            INSERT INTO control_asistencias (sesion_id, estudiante_id, asistio) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE asistio = VALUES(asistio)
        `, [valoresLote]);

        console.log(`-> [ÉXITO] Asistencias actualizadas correctamente sobre sus mismos registros.`);

        // =========================================================================
        // 🚀 INYECCIÓN MAESTRA: PROCESAMIENTO DINÁMICO DE ASISTENCIAS EN PARALELO [11/07/2026]
        // =========================================================================
        console.log(`-> [AIVEN.IO] Invocando sp_calcular_cierre_asistencia_alumno para ${registros.length} alumno(s).`);

        // A) El procedimiento almacenado calcula y asienta el porcentaje actual en la tabla puente matricula_detalles
        await Promise.all(registros.map(reg => {
            return db.query('CALL sp_calcular_cierre_asistencia_alumno(?, ?)', [
                Number(reg.estudiante_id),
                Number(curso_id)
            ]);
        }));

        // B) 🛡️ LA ADUANA DE CONTROL EN NODE.JS: Evaluamos y actualizamos el estado de aprobación final
        // Si el porcentaje acumulado sobre lo dictado es < 75%, Express le estampa la inhabilitación de forma directa.
        await Promise.all(registros.map(reg => {
            return db.query(`
                UPDATE matricula_detalles md
                INNER JOIN matriculas m ON md.matricula_id = m.id
                SET md.estado_aprobacion = CASE 
                    WHEN md.asistencia_final_porcentaje < 75 THEN 'Desaprobado por Inasistencias'
                    WHEN md.promedio_final >= 10.5 THEN 'Aprobado'
                    WHEN md.promedio_final IS NOT NULL THEN 'Desaprobado por Notas'
                    ELSE 'En Curso'
                END
                WHERE m.estudiante_id = ? AND md.curso_id = ?
            `, [Number(reg.estudiante_id), Number(curso_id)]);
        }));

        console.log(`-> [AIVEN.IO] Auditoría de récords de asistencia procesada al 100% de forma conforme.`);
        // =========================================================================

        res.status(200).json({ message: "¡Asistencias actualizadas de forma limpia en el repositorio y porcentajes auditados!" });

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


exports.publicarActaNotas = async (req, res) => {
    const { curso_id, semestre_id, configuracion_nota_id } = req.body;

    console.log(`-> [AIVEN.IO] Aduana Estricta: Evaluando firma progresiva Evaluación ID: ${configuracion_nota_id} | Curso: ${curso_id}`);

    if (!curso_id || !semestre_id || !configuracion_nota_id) {
        return res.status(400).json({ message: "Todos los parámetros relacionales son estrictamente requeridos." });
    }

    try {
        const [totalMatriculados] = await db.query(`
            SELECT COUNT(DISTINCT m.estudiante_id) AS total
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            WHERE md.curso_id = ? AND m.semestre_id = ?
        `, [Number(curso_id), Number(semestre_id)]);

        const [totalCalificados] = await db.query(`
            SELECT COUNT(*) AS total
            FROM notas_generales_estudiantes
            WHERE curso_id = ? AND configuracion_nota_id = ? 
              AND nota IS NOT NULL AND nota <> ''
        `, [Number(curso_id), Number(configuracion_nota_id)]);

        // Calibración segura de lectura de índices del pool de MySQL
        const alumnosInscritos = totalMatriculados[0]?.total || totalMatriculados?.total || 0;
        const alumnosConNota = totalCalificados[0]?.total || totalCalificados?.total || 0;

        if (alumnosConNota < alumnosInscritos) {
            console.log(`❌ [RECHAZADO] Intento de firma incompleta: Matriculados: ${alumnosInscritos} | Calificados: ${alumnosConNota}`);
            return res.status(422).json({
                message: `Protección del Servidor: No se puede publicar el acta progresiva. Detectamos que faltan registrar las calificaciones de ${alumnosInscritos - alumnosConNota} alumno(s) en esta unidad.`
            });
        }

        // 1. Generamos el string con el formato exacto de fecha y hora local de Perú (UTC-5)
        const fechaPublicacionPeru = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" });
        // Esto creará una cadena compatible: "2026-07-22 15:32:00"

        console.log(`-> [BACKEND] Registrando fecha oficial de publicación en Perú: ${fechaPublicacionPeru}`);

        // 2. Inyectamos la variable directamente como parámetro en tu consulta SQL
        await db.query(`
    UPDATE notas_generales_estudiantes
    SET nota_publicada = 1, 
        fecha_publicacion = ?
    WHERE curso_id = ? AND configuracion_nota_id = ?
`, [fechaPublicacionPeru, Number(curso_id), Number(configuracion_nota_id)]);

        const [alumnosSalon] = await db.query(`
            SELECT DISTINCT m.estudiante_id
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            WHERE md.curso_id = ? AND m.semestre_id = ?
        `, [Number(curso_id), Number(semestre_id)]);

        if (alumnosSalon && alumnosSalon.length > 0) {
            console.log(`-> [AIVEN.IO] Ejecutando sp_calcular_cierre_curso_alumno en lote para ${alumnosSalon.length} estudiante(s).`);

            await Promise.all(alumnosSalon.map(alumno => {
                return db.query('CALL sp_calcular_cierre_curso_alumno(?, ?)', [
                    Number(alumno.estudiante_id),
                    Number(curso_id)
                ]);
            }));

            console.log(`-> [AIVEN.IO] Cierre matemático y promedios finales procesados con éxito.`);
        }

        return res.status(200).json({
            message: `¡Evaluación oficial publicada con éxito! Se aplicó un candado institucional a las celdas correspondientes y se actualizaron los promedios finales.`
        });

    } catch (error) {
        console.error("🚨 Error crítico en la aduana estricta de publicación:", error);
        return res.status(500).json({ error: error.message });
    }
};






// 🎓 PORTAL ALUMNO: Obtener lista de cursos matriculados
exports.obtenerCursosEstudiante = async (req, res) => {
    const { estudiante_id, semestre_id } = req.query;

    console.log(`-> [AIVEN.IO] Listando asignaturas para Alumno ID: ${estudiante_id}`);

    if (!estudiante_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros (estudiante_id o semestre_id)." });
    }

    try {
        // Consulta sincronizada perfectamente con tu formato de la página 7 del PDF
        const [cursos] = await db.query(`
            SELECT 
                c.id AS curso_id,
                c.nombre AS curso_nombre,
                c.codigo AS codigo_curso,
                c.ciclo,
                CONCAT('SI', c.ciclo, '0', c.id) AS codigo
            FROM matriculas m
            INNER JOIN matricula_detalles md ON md.matricula_id = m.id
            INNER JOIN cursos c ON md.curso_id = c.id
            WHERE m.estudiante_id = ? AND m.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [Number(estudiante_id), Number(semestre_id)]);

        return res.status(200).json(cursos);

    } catch (error) {
        console.error("🚨 Error en obtenerCursosEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};




// 📡 PORTAL ALUMNO: Obtener boleta detallada basada en la estructura del cronograma de MySQL [10/07/2026]
exports.obtenerBoletaDetalladaEstudiante = async (req, res) => {
    const { estudiante_id, curso_id, semestre_id } = req.query;

    console.log(`-> [AIVEN.IO] Generando libreta relacional Alumno ID: ${estudiante_id} | Curso ID: ${curso_id} | Semestre ID: ${semestre_id}`);

    if (!estudiante_id || !curso_id || !semestre_id) {
        return res.status(400).json({ message: "Parámetros relacionales incompletos en el servidor." });
    }

    try {
        // 🔍 EL QUERY SUPREMO: Seleccionamos el cronograma como tabla principal (cfg) 
        // y le acoplamos la nota del alumno mediante un LEFT JOIN filtrado en el ON.
        // Esto garantiza que si el alumno no tiene notas, la fila estructural aparezca sí o sí [10/07/2026].
        const [boleta] = await db.query(`
            SELECT 
                cfg.id AS configuracion_nota_id,
                cfg.nombre_nota AS evaluacion_nombre,
                cfg.peso_porcentaje,
                n.nota,
                n.nota_publicada,
                DATE_FORMAT(n.fecha_publicacion, '%d/%m/%Y') AS fecha_publicacion
            FROM configuracion_notas_global cfg
            LEFT JOIN notas_generales_estudiantes n 
                ON cfg.id = n.configuracion_nota_id 
                AND n.estudiante_id = ? 
                AND n.curso_id = ?
            WHERE cfg.semestre_id = ?
            ORDER BY cfg.num_evaluacion ASC
        `, [Number(estudiante_id), Number(curso_id), Number(semestre_id)]);

        console.log(`-> [BACKEND] Filas estructurales recuperadas desde MySQL: ${boleta.length}`);

        // 🧠 Si el administrador no configuró el cronograma para este semestre, lanzamos un bloque base de contingencia
        if (!boleta || boleta.length === 0) {
            return res.status(200).json([
                { configuracion_nota_id: 17, evaluacion_nombre: 'Evaluacion 1', peso: 25, estado: 'Pendiente', fecha_pub: '-', nota: null },
                { configuracion_nota_id: 18, evaluacion_nombre: 'Evaluacion 2', peso: 25, estado: 'Pendiente', fecha_pub: '-', nota: null },
                { configuracion_nota_id: 19, evaluacion_nombre: 'Evaluacion 3', peso: 25, estado: 'Pendiente', fecha_pub: '-', nota: null },
                { configuracion_nota_id: 20, evaluacion_nombre: 'Evaluacion 4', peso: 25, estado: 'Pendiente', fecha_pub: '-', nota: null }
            ]);
        }

        // Mapeo seguro: Si la nota existe pero tiene bandera = 0 (Borrador), se la ocultamos de forma estricta al alumno [10/07/2026]
        const boletaProtegida = boleta.map(evaluacion => {
            const esOficial = evaluacion.nota_publicada === 1;
            return {
                configuracion_nota_id: evaluacion.configuracion_nota_id,
                evaluacion_nombre: evaluacion.evaluacion_nombre,
                peso: evaluacion.peso_porcentaje,
                estado: esOficial ? 'Publicada' : 'Pendiente',
                fecha_pub: esOficial ? evaluacion.fecha_publicacion : '-',
                nota: esOficial ? evaluacion.nota : null
            };
        });

        return res.status(200).json(boletaProtegida);

    } catch (error) {
        console.error("🚨 Error crítico en obtenerBoletaDetalladaEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 📡 PORTAL ALUMNO: Obtener métricas de asistencia blindado contra tablas vacías o inexistentes [10/07/2026]
// 📡 PORTAL ALUMNO: Obtener métricas reales desde control_asistencias
exports.obtenerAsistenciaEstudianteDona = async (req, res) => {
    const { estudiante_id, curso_id } = req.query;

    console.log(`-> [AIVEN.IO] Calculando control_asistencias Alumno: ${estudiante_id} | Curso: ${curso_id}`);

    if (!estudiante_id || !curso_id) {
        return res.status(400).json({ message: "Parámetros relacionales obligatorios ausentes." });
    }

    try {
        // 🔍 CONSULTA A: Contamos cuántas asistencias y faltas reales tiene el alumno en la tabla control_asistencias
        const [conteosAlumno] = await db.query(`
            SELECT 
                COUNT(CASE WHEN ca.asistio = 1 THEN 1 END) AS asistencias,
                COUNT(CASE WHEN ca.asistio = 0 THEN 1 END) AS faltas
            FROM control_asistencias ca
            INNER JOIN sesiones s ON ca.sesion_id = s.id
            WHERE ca.estudiante_id = ? AND s.curso_id = ?
        `, [Number(estudiante_id), Number(curso_id)]);

        // 🔍 CONSULTA B: Jalamos el universo completo de sesiones programadas en tu tabla 'sesiones' (las 20 clases)
        const [universoSesiones] = await db.query(`
            SELECT COUNT(*) AS total_programadas 
            FROM sesiones 
            WHERE curso_id = ?
        `, [Number(curso_id)]);

        // Extraemos la primera fila de resultados del pool desestructurado de MySQL
        const datosAlumno = (conteosAlumno && conteosAlumno[0]) ? conteosAlumno[0] : { asistencias: 0, faltas: 0 };
        const totalClasesProgramadas = (universoSesiones && universoSesiones[0]) ? universoSesiones[0].total_programadas : 0;

        // Despachamos el JSON relacional limpio hacia tu Frontend
        const metrica = {
            asistencias: Number(datosAlumno.asistencias) || 0,
            tardanzas: 0, // No aplica en tus reglas de negocio
            faltas: Number(datosAlumno.faltas) || 0,
            total_clases: Number(totalClasesProgramadas) || 0 // Envía las 20 sesiones reales de tu Workbench
        };

        return res.status(200).json(metrica);

    } catch (error) {
        console.error("🚨 Error crítico en obtenerAsistenciaEstudianteDona:", error);
        return res.status(200).json({ asistencias: 0, tardanzas: 0, faltas: 0, total_clases: 0 });
    }
};


exports.consolidarCierreActaFinal = async (req, res) => {
    const { curso_id, semestre_id, configuracion_nota_id, profesor_id } = req.body;

    console.log(`-> [AIVEN.IO] GATILLO MAESTRO: Evaluando Cierre definitivo de Acta para Curso: ${curso_id}`);

    if (!curso_id || !semestre_id || !configuracion_nota_id || !profesor_id) {
        return res.status(400).json({ message: "Faltan parámetros esenciales para el cierre definitivo del acta." });
    }

    try {
        // 🔒 CANDADO PREVENTIVO DE BACKEND: Verificamos si ya existe un acta cerrada para este curso y periodo
        const [actaExistente] = await db.query(`
            SELECT codigo_acta, url_pdf 
            FROM actas_notes 
            WHERE curso_id = ? AND semestre_id = ?
        `, [Number(curso_id), Number(semestre_id)]);

        // 🛑 SI YA EXISTE, frena el proceso de inmediato y le devuelve al profesor los datos del acta ya generada
        if (actaExistente.length > 0) {
            console.log(`-> [AIVEN.IO] CONTROL: Bloqueando intento de re-cierre. El Acta ${actaExistente[0].codigo_acta} ya se encuentra sellada.`);
            return res.status(409).json({
                message: "⚠️ Operación bloqueada: El acta de calificaciones finales para este curso ya fue cerrada de forma definitiva y no puede ser modificada.",
                codigo_acta: actaExistente[0].codigo_acta,
                url_pdf: actaExistente[0].url_pdf,
                ya_cerrada: true // Bandera útil para que el frontend bloquee los botones visualmente
            });
        }

        // =========================================================================
        // A) Si no existe, continúa el proceso normal que armamos antes...
        // =========================================================================
        const codigoActaUnico = `ACTA-FINAL-C${curso_id}-S${semestre_id}-${Date.now()}`;
        const urlPdfGenerado = null;

        // 🚀 CONVERSIÓN DE SEGURIDAD: Forzamos la hora de tu país en formato de texto plano
        const fechaFirmaPeru = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" });

        // B) Insertamos la Cabecera oficial
        const [resultadoActa] = await db.query(`
            INSERT INTO actas_notes (codigo_acta, curso_id, semestre_id, configuracion_nota_id, profesor_id, url_pdf, fecha_firma)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [codigoActaUnico, Number(curso_id), Number(semestre_id), Number(configuracion_nota_id), Number(profesor_id), urlPdfGenerado, fechaFirmaPeru]);

        const actaIdInsertado = resultadoActa.insertId;

        // C) Congelamos las notas definitivas actuales de todo el salón (Con tu promedio ponderado variable)
        await db.query(`
            INSERT INTO acta_detalles (acta_id, estudiante_id, nota_congelada)
            SELECT 
                ? AS acta_id,
                nge.estudiante_id,
                ROUND(SUM(nge.nota * (cng.peso_porcentaje / 100)), 2) AS promedio_ponderado_final
            FROM notas_generales_estudiantes nge
            INNER JOIN configuracion_notas_global cng ON nge.configuracion_nota_id = cng.id
            WHERE nge.curso_id = ? AND cng.semestre_id = ?
            GROUP BY nge.estudiante_id
        `, [actaIdInsertado, Number(curso_id), Number(semestre_id)]);

        // D) Actualizamos el Estado de Aprobación Final
        await db.query(`
            UPDATE matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            INNER JOIN (
                SELECT 
                    nge.estudiante_id,
                    ROUND(SUM(nge.nota * (cng.peso_porcentaje / 100)), 2) AS promedio_calculado
                FROM notas_generales_estudiantes nge
                INNER JOIN configuracion_notas_global cng ON nge.configuracion_nota_id = cng.id
                WHERE nge.curso_id = ? AND cng.semestre_id = ?
                GROUP BY nge.estudiante_id
            ) v_notas ON m.estudiante_id = v_notas.estudiante_id
            SET 
                md.promedio_final = v_notas.promedio_calculado,
                md.estado_aprobacion = CASE 
                    WHEN md.asistencia_final_porcentaje < 75 THEN 'Desaprobado por Inasistencias'
                    WHEN v_notas.promedio_calculado >= 10.5 THEN 'Aprobado'
                    ELSE 'Desaprobado por Notas'
                END
            WHERE m.semestre_id = ? AND md.curso_id = ?
        `, [Number(curso_id), Number(semestre_id), Number(semestre_id), Number(curso_id)]);

        return res.status(200).json({
            message: "¡Acta Final del curso cerrada e historiada con éxito rotundo!",
            codigo_acta: codigoActaUnico,
            url_pdf: urlPdfGenerado
        });

    } catch (error) {
        console.error("🚨 Error en el botón maestro consolidarCierreActaFinal:", error);
        return res.status(500).json({ error: error.message });
    }
};



// 📊 MODULO: ACTAS CONSOLIDADAS - Inyección de Ciclo Académico (2026-I)
exports.obtenerActasConsolidadas = async (req, res) => {
    const { semestre_id, profesor_id } = req.query;

    if (!semestre_id) {
        return res.status(400).json({ message: "El parámetro semestre_id es obligatorio." });
    }

    try {
        await db.query("SET lc_time_names = 'es_PE'");

        const [actas] = await db.query(`
            SELECT 
                an.id AS acta_id,
                an.codigo_acta,
                -- 🔥 ¡AQUÍ ESTÁ LA CLAVE! Traemos la columna url_pdf para que React la reconozca
                an.url_pdf, 
                s.codigo AS ciclo_academico, 
                DATE_FORMAT(an.fecha_firma, '%d de %M de %Y a las %h:%i %p') AS fecha_cierre, 
                c.id AS curso_id,
                c.codigo AS curso_codigo,
                c.nombre AS curso_nombre,
                c.ciclo AS curso_ciclo,
                ca.nombre AS carrera_nombre,
                COUNT(ad.id) AS total_estudiantes,
                ROUND(AVG(ad.nota_congelada), 2) AS promedio_general_salon,
                SUM(CASE WHEN ad.nota_congelada >= 10.5 THEN 1 ELSE 0 END) AS cantidad_aprobados,
                SUM(CASE WHEN ad.nota_congelada < 10.5 THEN 1 ELSE 0 END) AS cantidad_desaprobados
            FROM actas_notes an
            INNER JOIN cursos c ON an.curso_id = c.id
            INNER JOIN carreras ca ON c.carrera_id = ca.id
            INNER JOIN acta_detalles ad ON an.id = ad.acta_id
            INNER JOIN semestres s ON an.semestre_id = s.id 
            WHERE an.semestre_id = ?
              AND (? IS NULL OR an.profesor_id = ?)
            GROUP BY an.id, an.url_pdf -- Incluimos url_pdf en el group by por estándar SQL
            ORDER BY c.ciclo ASC, an.fecha_firma DESC 
        `, [Number(semestre_id), profesor_id ? Number(profesor_id) : null, profesor_id ? Number(profesor_id) : null]);

        return res.status(200).json(actas);

    } catch (error) {
        console.error("🚨 Error crítico SQL en obtenerActasConsolidadas:", error);
        return res.status(500).json({ error: error.message });
    }
};



// 📄 SERVICIO MAESTRO: Generar PDF oficial del Acta Cerrada e Historiada
exports.generarPdfActaOficial = async (req, res) => {
    const { acta_id } = req.query; // Recibimos el ID numérico del acta a imprimir

    if (!acta_id) {
        return res.status(400).json({ message: "El parámetro acta_id es estrictamente obligatorio." });
    }

    try {
        console.log(`-> [AIVEN.IO] PDF Engine: Compilando reporte oficial para Acta ID: ${acta_id}`);

        // 1. Extraemos la Cabecera oficial del Acta desde MySQL
        const [cabecera] = await db.query(`
    SELECT 
        an.codigo_acta,
        DATE_FORMAT(an.fecha_firma, '%d/%m/%Y/%h:%i %p') AS fecha_cierre_cruda,
        c.nombre AS curso_nombre,
        c.codigo AS curso_codigo,
        c.ciclo AS curso_ciclo,
        ca.nombre AS carrera_nombre,
        s.codigo AS semestre_codigo,
        -- 🧠 CONCATENACIÓN AUTOMÁTICA: Si el query encuentra un grado, le añade el prefijo ideal al nombre completo
        CONCAT(
            IFNULL(v_grado.prefijo_abreviado, 'PROF.'), 
            ' ', 
            u.nombres, 
            ' ', 
            u.apellidos
        ) AS profesor_nombre
    FROM actas_notes an
    INNER JOIN cursos c ON an.curso_id = c.id
    INNER JOIN carreras ca ON c.carrera_id = ca.id
    INNER JOIN semestres s ON an.semestre_id = s.id
    INNER JOIN profesores p ON an.profesor_id = p.id
    INNER JOIN usuarios u ON p.usuario_id = u.id
    
    -- 🛠️ SUB-QUERY MAESTRO: Escanea tu tabla profesor_grados y extrae ÚNICAMENTE el de mayor jerarquía
    LEFT JOIN (
        SELECT 
            profesor_id,
            nivel_grado,
            CASE 
                WHEN nivel_grado = 'Doctor' THEN 'DR.'
                WHEN nivel_grado = 'Magister' THEN 'MAG.'
                WHEN nivel_grado = 'Licenciado' THEN 'LIC.'
                WHEN nivel_grado = 'Bachiller' THEN 'BACH.'
                ELSE 'PROF.'
            END AS prefijo_abreviado
        FROM profesor_grados
        WHERE profesor_id = (
            SELECT profesor_id FROM actas_notes WHERE id = ? LIMIT 1
        )
        -- 🔥 REGLA DE ORO: Ordenamos por la jerarquía educativa real usando FIELD
        ORDER BY FIELD(nivel_grado, 'Doctor', 'Magister', 'Licenciado', 'Bachiller') ASC
        LIMIT 1
    ) v_grado ON p.id = v_grado.profesor_id
    
    WHERE an.id = ?
`, [Number(acta_id), Number(acta_id)]);

        if (!cabecera || cabecera.length === 0) {
            return res.status(404).json({ message: "El acta especificada no registra una cabecera histórica válida." });
        }
        const data = cabecera[0];


        // 🚀 TRADUCTOR INTEGRADO DE MESES EN ESPAÑOL
        const mesesEspanol = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];

        // Separamos la cadena cruda "22/07/2026/06:08 PM" usando las barras
        const partesFecha = data.fecha_cierre_cruda.split('/');
        const dia = partesFecha[0];
        const numeroMes = parseInt(partesFecha[1], 10); // Convierte "07" en el número 7
        const anio = partesFecha[2];
        const horaCompleta = partesFecha[3]; // "06:08 PM"

        // Obtenemos el nombre del mes restando 1 (ya que el array empieza en 0)
        const nombreMesEs = mesesEspanol[numeroMes - 1];

        // 🎯 Construimos la cadena final perfecta e institucional
        const fechaEmisionFinal = `${dia} de ${nombreMesEs} de ${anio} a las ${horaCompleta}`;

        // Guardamos el resultado en el objeto que lee tu generador de PDFKit
        data.fecha_cierre = fechaEmisionFinal;

        // 2. Extraemos el listado de notas congeladas de los alumnos en acta_detalles
        const [detalles] = await db.query(`
            SELECT 
                e.codigo_estudiante,
                CONCAT(u.apellidos, ', ', u.nombres) AS alumno_nombre,
                u.dni,
                ad.nota_congelada
            FROM acta_detalles ad
            INNER JOIN estudiantes e ON ad.estudiante_id = e.id
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE ad.acta_id = ?
            ORDER BY u.apellidos ASC
        `, [Number(acta_id)]);

        // 3. Inicializamos el documento PDFKit (Tamaño A4 estándar con márgenes limpios)
        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 50, right: 50 } });

        // Configuramos las cabeceras HTTP de respuesta para que el navegador lo renderice como PDF puro
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=${data.codigo_acta}.pdf`);
        doc.pipe(res);

        // --- DISEÑO ESTÉTICO INSTITUCIONAL ---

        // Encabezado Principal
        doc.fillColor('#0f172a').fontSize(16).text('INSTITUTO DE EDUCACIÓN SUPERIOR PEDAGÓGICO', { align: 'center', weight: 'bold' });
        doc.fontSize(11).fillColor('#475569').text('SISTEMA INTEGRADO ACADÉMICO (SIA) - ACTA CONFIGURADA', { align: 'center', marginTop: 4 });
        doc.moveDown(1.5);

        // Línea divisoria vectorial estética
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
        doc.moveDown(1);

        // Bloque Informativo de la Cabecera (Matriz de 2 columnas con coordenadas estables)
        const topY = doc.y;
        const columnaDerechaX = 320;
        doc.fillColor('#1e3a8a').fontSize(10);

        // --- FILA 1 ---
        doc.text(`CÓDIGO ACTA: ${data.codigo_acta}`, 50, topY, { width: 260 });
        doc.text(`PERIODO ACADÉMICO: ${data.semestre_codigo}`, columnaDerechaX, topY);

        // --- FILA 2 (Especialidad vs Docente) ---
        // Dibujamos primero la especialidad a la izquierda
        doc.text(`ESPECIALIDAD: ${data.carrera_nombre.toUpperCase()}`, 50, topY + 16, {
            width: 260,
            lineGap: 2
        });
        // Guardamos la coordenada exacta donde terminó la especialidad para pintar el Docente al lado
        const docenteY = doc.y + 6;
        doc.text(`DOCENTE: ${data.profesor_nombre.toUpperCase()}`, columnaDerechaX, topY + 16, {
            width: 220,
            lineGap: 2
        });

        // --- FILA 3 (Asignatura vs Fecha de Emisión) ---
        // Calculamos el Y máximo de la fila anterior para que la fila 3 nunca se monte en nada
        const fila3Y = Math.max(doc.y + 6, docenteY);

        doc.text(`ASIGNATURA: ${data.curso_nombre.toUpperCase()} (${data.curso_codigo})`, 50, fila3Y, {
            width: 260,
            lineGap: 2
        });
        doc.text(`FECHA DE EMISIÓN: ${data.fecha_cierre.toUpperCase()}`, columnaDerechaX, fila3Y);

        // Desplazamiento final limpio del puntero para dar paso a la tabla
        doc.moveDown(2.5);

        // --- RENDERIZADO DE LA TABLA MATRICIAL DE NOTAS ---
        let tableY = doc.y;
        doc.fillColor('#475569').fontSize(9);

        // Encabezado de la Tabla
        doc.rect(50, tableY, 495, 22).fill('#f8fafc');
        doc.fillColor('#475569');
        doc.text('N°', 55, tableY + 6, { width: 25, align: 'center' });
        doc.text('CÓDIGO ALUMNO', 85, tableY + 6, { width: 95 });
        doc.text('APELLIDOS Y NOMBRES', 185, tableY + 6, { width: 195 });
        doc.text('DNI', 385, tableY + 6, { width: 75, align: 'center' });       // ◄ Movido a la izquierda (385)
        doc.text('NOTA FINAL', 465, tableY + 6, { width: 75, align: 'center' }); // ◄ Movido a la derecha (465)

        tableY += 22;

        // Cuerpo de Alumnos Recorridos dinámicamente
        let totalNotas = 0;
        let aprobados = 0;
        let desaprobados = 0;

        detalles.forEach((al, index) => {
            const notaNum = Number(al.nota_congelada);
            totalNotas += notaNum;
            if (notaNum >= 10.5) aprobados++; else desaprobados++;

            // Línea inferior de celda
            doc.moveTo(50, tableY + 20).lineTo(545, tableY + 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

            // Textos alineados de las columnas
            doc.fillColor('#334155');
            doc.text(`${index + 1}`, 55, tableY + 6, { width: 25, align: 'center' });
            doc.text(al.codigo_estudiante || '---', 85, tableY + 6, { width: 95 });
            doc.text(al.alumno_nombre.toUpperCase(), 185, tableY + 6, { width: 195 });
            doc.text(al.dni || '---', 385, tableY + 6, { width: 75, align: 'center' }); // ◄ Coincide con 385

            // Regla de color según ley pedagógica superior
            if (notaNum >= 10.5) {
                doc.fillColor('#16a34a'); // Verde Aprobado
                doc.text(`${Math.round(notaNum)} (${notaNum.toFixed(2)})`, 465, tableY + 6, { align: 'center', weight: 'bold' });
            } else {
                doc.fillColor('#dc2626'); // Rojo Desaprobado
                doc.text(`${Math.round(notaNum)} (${notaNum.toFixed(2)})`, 465, tableY + 6, { align: 'center', weight: 'bold' });
            }

            tableY += 20;
        });

        doc.moveDown(2);

        // --- BLOQUE ESTADÍSTICO DE RESUMEN ---
        doc.x = 50; // Reseteamos margen horizontal
        const promedioSalon = totalNotas / detalles.length;

        doc.fillColor('#1e293b').fontSize(10).text('RESUMEN DE RENDIMIENTO ACADÉMICO:', { weight: 'bold' });
        doc.fontSize(9.5).fillColor('#475569');
        doc.text(`• Total Estudiantes Evaluados: ${detalles.length}`, { marginTop: 4 });
        doc.text(`• Promedio General de la Sección: ${promedioSalon.toFixed(2)}`);
        doc.text(`• Alumnos Condición Aprobados: ${aprobados}`);
        doc.text(`• Alumnos Condición Desaprobados: ${desaprobados}`);

        doc.moveDown(4.5);

        // --- 🔥 ZONA EXCLUSIVA: ESPACIO EN BLANCO CONFIGURADO PARA LA FIRMA DEL DOCENTE ---
        const firmaY = doc.y + 20;
        doc.moveTo(190, firmaY).lineTo(400, firmaY).strokeColor('#475569').lineWidth(1).stroke();
        doc.fillColor('#334155').fontSize(10).text(`${data.profesor_nombre.toUpperCase()}`, 50, firmaY + 6, { align: 'center', weight: 'bold' });
        doc.fontSize(9).fillColor('#64748b').text('DOCENTE RESPONSABLE - FIRMA DIGITAL / FÍSICA', 50, firmaY + 18, { align: 'center' });

        // Cerramos y consolidamos el flujo del stream hacia Express
        doc.end();

    } catch (error) {
        console.error("🚨 Error crítico en el generador de PDF nativo pdfkit:", error);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
    }
};




exports.actualizarDocumentoActa = async (req, res) => {
    const { id } = req.params;
    const accion = req.query.accion; // Captura si la URL envía 'subir' o 'eliminar'

    try {
        // ❌ ACCIÓN 1: ELIMINAR EL DOCUMENTO FIRMADO DE LA BASE DE DATOS
        if (accion === 'eliminar') {
            console.log(`-> [AIVEN.IO] Removiendo enlace digital para Acta ID: ${id}`);

            await db.query("UPDATE actas_notes SET url_pdf = NULL WHERE id = ?", [Number(id)]);

            return res.status(200).json({
                message: "¡El documento firmado fue removido con éxito de la base de datos!",
                url_pdf: null
            });
        }

        // 📤 ACCIÓN 2: SUBIR O EDITAR (REEMPLAZAR) EL ARCHIVO FISICO
        // Validamos si el multer exclusivo logró capturar el binario en la subcarpeta
        if (!req.file) {
            return res.status(400).json({ message: "No se ha recibido ningún archivo binario válido en la petición." });
        }

        // 🔥 CORRECCIÓN EXACTA DE INGENIERÍA DE RUTAS:
        // Como tu storageActas guarda en 'uploads/actas/', acoplamos la ruta web idéntica
        const urlArchivoReal = `/uploads/actas/${req.file.filename}`;

        console.log(`-> [AIVEN.IO] Repositorio: Registrando ruta real '${urlArchivoReal}' para Acta ID: ${id}`);

        // Actualizamos la columna url_pdf en la tabla física actas_notes de tu Workbench
        await db.query("UPDATE actas_notes SET url_pdf = ? WHERE id = ?", [urlArchivoReal, Number(id)]);

        return res.status(200).json({
            message: "¡Documento firmado y guardado correctamente en la base de datos!",
            url_pdf: urlArchivoReal
        });

    } catch (error) {
        console.error("🚨 Error crítico en el controlador actualizarDocumentoActa:", error);
        return res.status(500).json({ error: error.message });
    }
};