const db = require('../config/db');

// 1. 🔥 NUEVO: Función obligatoria para traer la lista de alumnos inscritos en el curso
exports.obtenerAlumnosPorCurso = async (req, res) => {
    const curso_id = req.query.curso_id;
    const semestre_id = req.query.semestre_id;

    if (!curso_id || !semestre_id) {
        return res.status(400).json({ message: "Los parámetros curso_id y semestre_id son estrictamente requeridos." });
    }

    try {
        console.log(`-> [AIVEN.IO] Extrayendo cronograma dinámico para Semestre: ${semestre_id} | Curso: ${curso_id}`);

        // 🚀 CONSULTA 1: Traemos de forma real las evaluaciones parametrizadas por el administrador para este periodo
        const [configuracion] = await db.query(
            "SELECT id, nombre_nota, peso_porcentaje, fecha_inicio_ingreso, fecha_fin_ingreso  FROM configuracion_notas_global WHERE semestre_id = ? ORDER BY num_evaluacion ASC",
            [Number(semestre_id)]
        );

        // 🚀 CONSULTA 2: Jalamos los datos base de los estudiantes matriculados en esta sección
        const [alumnos] = await db.query(
            `SELECT DISTINCT 
                e.id AS estudiante_id, 
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

        // 🚀 CONSULTA 3: Si hay alumnos y configuraciones vigentes, jalamos el universo de notas existente
        let calificacionesExistentes = [];
        if (alumnos.length > 0 && configuracion.length > 0) {
            const idsEstudiantes = alumnos.map(a => a.estudiante_id);
            const idsConfiguracion = configuracion.map(c => c.id);

            // 🔥 REPARACIÓN MAESTRA: Quitamos 'AND semestre_id = ?' y removemos su argumento del arreglo [01/07/2026]
            const [notas] = await db.query(
                `SELECT estudiante_id, configuracion_nota_id, nota, nota_publicada 
         FROM notas_generales_estudiantes 
         WHERE curso_id = ? 
         AND estudiante_id IN (?) AND configuracion_nota_id IN (?)`,
                [Number(curso_id), idsEstudiantes, idsConfiguracion]
            );
            calificacionesExistentes = notas;
        }

        // 🧠 MAPEO EN MEMORIA: Estructuramos el JSON dinámicamente acoplando las celdas encontradas
        const listaAlumnosProcesados = alumnos.map(alumno => {
            const mapaNotasEstudiante = {};
            const mapaPublicadosEstudiante = {};

            // Recorremos las columnas reales encontradas en la BD y buscamos si este alumno tiene nota ahí
            configuracion.forEach(col => {
                const registroNota = calificacionesExistentes.find(n =>
                    n.estudiante_id === alumno.estudiante_id && n.configuracion_nota_id === col.id
                );
                // Si existe el registro se inyecta su valor real, si no, se manda nulo para dejar la caja limpia
                mapaNotasEstudiante[col.id] = registroNota ? registroNota.nota : null;
                mapaPublicadosEstudiante[col.id] = registroNota ? registroNota.nota_publicada : 0;
            });

            return {
                id: alumno.estudiante_id,
                estudiante_id: alumno.estudiante_id,
                apellidos_nombres: `${alumno.apellidos} ${alumno.nombres}`,
                dni: alumno.dni,
                notas: mapaNotasEstudiante,
                publicados: mapaPublicadosEstudiante
            };
        });

        // Retornamos el paquete integral de datos reales rumbo a React
        return res.status(200).json({
            alumnos: listaAlumnosProcesados,
            configuracionNotas: configuracion
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
                    nota = VALUES(nota),
                    fecha_registro = CURRENT_TIMESTAMP
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
                nota = VALUES(nota),
                fecha_registro = CURRENT_TIMESTAMP
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

                -- 🔥 ALERTA INTERACTIVA 2 CORREGIDA: Detecta alumnos que tengan casilleros vacíos de calificación
                (
                    SELECT COUNT(DISTINCT m.estudiante_id)
                    FROM matricula_detalles md
                    INNER JOIN matriculas m ON md.matricula_id = m.id
                    WHERE md.curso_id = c.id 
                      AND m.semestre_id = ca.semestre_id
                      -- Un alumno entra al conteo si la cantidad de notas reales que tiene registradas 
                      -- es menor al total de evaluaciones obligatorias que el admin configuró para este ciclo
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
            JOIN cursos c ON ca.curso_id = c.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY c.ciclo ASC, c.nombre ASC
        `, [diaHoy, diaManana, Number(profesor_id), Number(semestre_id)]);

        res.status(200).json(cursos);
    } catch (error) {
        console.error("🚨 Error crítico en obtenerCursosPorDocente:", error);
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


exports.publicarActaNotas = async (req, res) => {
    // Capturamos el configuracion_nota_id dinámico de la evaluación que se va a cerrar [30/06/2026]
    const { curso_id, semestre_id, configuracion_nota_id } = req.body;

    console.log(`-> [AIVEN.IO] Aduana Estricta: Evaluando firma progresiva Evaluación ID: ${configuracion_nota_id} | Curso: ${curso_id}`);

    if (!curso_id || !semestre_id || !configuracion_nota_id) {
        return res.status(400).json({ message: "Todos los parámetros relacionales son estrictamente requeridos." });
    }

    try {
        // 🔍 1. CONTAMOS EL UNIVERSO REAL DE ALUMNOS MATRICULADOS EN ESTA SECCIÓN (Ejemplo: Dan 2 Alumnos) [30/06/2026]
        const [totalMatriculados] = await db.query(`
            SELECT COUNT(DISTINCT m.estudiante_id) AS total
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            WHERE md.curso_id = ? AND m.semestre_id = ?
        `, [Number(curso_id), Number(semestre_id)]);

        // 🔍 2. CONTAMOS CUÁNTOS DE ESOS ALUMNOS REGISTRAN CALIFICACIONES REALES (Diferentes de NULL o vacío) [30/06/2026]
        const [totalCalificados] = await db.query(`
            SELECT COUNT(*) AS total
            FROM notas_generales_estudiantes
            WHERE curso_id = ? AND configuracion_nota_id = ? 
              AND nota IS NOT NULL AND nota <> ''
        `, [Number(curso_id), Number(configuracion_nota_id)]);

        // Extraemos las métricas puras de los resultados del pool de MySQL [30/06/2026]
        const alumnosInscritos = totalMatriculados[0]?.total || 0;
        const alumnosConNota = totalCalificados[0]?.total || 0;

        // 🔒 3. EL CANDADO DE PROTECCIÓN EN EL SERVIDOR: Tolerancia cero a casilleros en blanco [30/06/2026]
        if (alumnosConNota < alumnosInscritos) {
            console.log(`❌ [RECHAZADO] Intento de firma incompleta: Matriculados: ${alumnosInscritos} | Calificados: ${alumnosConNota}`);
            return res.status(422).json({
                message: `Protección del Servidor: No se puede publicar el acta progresiva. Detectamos que faltan registrar las calificaciones de ${alumnosInscritos - alumnosConNota} alumno(s) en esta unidad.`
            });
        }

        // 🔒 4. LA FIRMA DIGITAL: Si todos tienen nota, MySQL ejecuta el update progresivo de forma segura [30/06/2026]
        const [resultado] = await db.query(`
            UPDATE notas_generales_estudiantes
            SET 
                nota_publicada = 1,
                fecha_publicacion = CURRENT_TIMESTAMP
            WHERE curso_id = ? AND configuracion_nota_id = ?
        `, [Number(curso_id), Number(configuracion_nota_id)]);

        return res.status(200).json({
            message: `¡Evaluación oficial publicada con éxito! Se aplicó un candado institucional a las celdas correspondientes.`
        });

    } catch (error) {
        console.error("🚨 Error crítico en la aduana estricta de publicación:", error);
        return res.status(500).json({ error: error.message });
    }
};






