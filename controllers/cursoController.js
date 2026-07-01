const db = require('../config/db');

exports.obtenerCursosParaMatricula = async (req, res) => {
    const { estudiante_id, ciclo_a_matricular, carrera_id } = req.query;

    if (!estudiante_id || !ciclo_a_matricular || !carrera_id) {
        return res.status(400).json({
            message: "Faltan parámetros obligatorios en la petición."
        });
    }

    try {
        const semestre_id = 1;
        
        // 🔥 EL TRADUCTOR MÁGICO: Si React envía "I CICLO", "II CICLO" o texto romano, 
        // lo convertimos instantáneamente al número entero (1, 2, etc.) que exige tu tabla física de cursos.
        let cicloNumeroFinal = 1;
        const textoCicloLimpio = String(ciclo_a_matricular).toUpperCase().trim();

        if (textoCicloLimpio.includes('I CICLO') || textoCicloLimpio === '1' || textoCicloLimpio.includes('IMPAR')) {
            cicloNumeroFinal = 1;
        } else if (textoCicloLimpio.includes('II CICLO') || textoCicloLimpio === '2' || textoCicloLimpio.includes('PAR')) {
            cicloNumeroFinal = 2;
        } else {
            // Soporte genérico por si viene el número puro
            cicloNumeroFinal = Number(parseInt(ciclo_a_matricular) || 1);
        }

        const idEstudianteSeguro = Number(estudiante_id);
        const idCarreraSegura = Number(carrera_id);

        console.log(`-> [AIVEN.IO] Buscando Cursos. Ciclo Original: "${ciclo_a_matricular}" | Traducido a Entero: ${cicloNumeroFinal}`);

        // 1. Obtener cursos regulares de la mañana (Filtrando con el ciclo número final legítimo)
        const [cursosRegulares] = await db.query(`
            SELECT 
                c.id, 
                c.nombre, 
                c.ciclo, 
                3 AS creditos,
                IFNULL(CONCAT(u.nombres, ' ', u.apellidos), 'Por Asignar') AS docente,
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(UPPER(SUBSTRING(h2.dia_semana, 1, 1)), SUBSTRING(h2.dia_semana, 2), ' (', DATE_FORMAT(h2.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h2.hora_fin, '%H:%i'), ')')
                            SEPARATOR ' / '
                        )
                        FROM horarios h2
                        WHERE h2.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario_completo
            FROM cursos c
            LEFT JOIN carga_academica ca ON ca.curso_id = c.id AND ca.semestre_id = ?
            LEFT JOIN profesores p ON ca.profesor_id = p.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE c.ciclo = ? AND c.carrera_id = ?
            GROUP BY c.id, c.nombre, c.ciclo, ca.id, u.nombres, u.apellidos
        `, [semestre_id, cicloNumeroFinal, idCarreraSegura]);

        // 2. Obtener cursos desaprobados (Cargos de la tarde)
        let cursosJalados = [];

        if (cicloNumeroFinal > 1) {
            [cursosJalados] = await db.query(`
                SELECT 
                    c.id, 
                    c.nombre, 
                    c.ciclo, 
                    3 AS creditos,
                    IFNULL(CONCAT(u.nombres, ' ', u.apellidos), 'Prof. Subsanación') AS docente,
                    IFNULL(
                        (
                            SELECT GROUP_CONCAT(
                                CONCAT(UPPER(SUBSTRING(h3.dia_semana, 1, 1)), SUBSTRING(h3.dia_semana, 2), ' (', DATE_FORMAT(h3.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h3.hora_fin, '%H:%i'), ')')
                                SEPARATOR ' / '
                            )
                            FROM horarios h3
                            WHERE h3.carga_academica_id = ca.id
                        ),
                        'Horario por Definir (Tarde)'
                    ) AS horario_completo
                FROM notas n
                JOIN cursos c ON n.curso_id = c.id
                LEFT JOIN carga_academica ca ON ca.curso_id = c.id AND ca.semestre_id = ?
                LEFT JOIN profesores p ON ca.profesor_id = p.id
                LEFT JOIN usuarios u ON p.usuario_id = u.id
                WHERE n.estudiante_id = ? 
                  AND n.resultado = 'desaprobado' 
                  AND c.ciclo < ? 
                  AND c.carrera_id = ?
                  AND c.id NOT IN (
                      SELECT curso_id FROM notas WHERE estudiante_id = ? AND resultado = 'aprobado'
                  )
                GROUP BY c.id, c.nombre, c.ciclo, ca.id, u.nombres, u.apellidos
            `, [semestre_id, idEstudianteSeguro, cicloNumeroFinal, idCarreraSegura, idEstudianteSeguro]);
        }

        // 3. Formatear la lista de cursos regulares (Turno Mañana)
        const regularesProcesados = cursosRegulares.map((curso, index) => ({
            id: curso.id,
            codigo: `SI${curso.ciclo}0${index + 1}`,
            nombre: curso.nombre,
            ciclo: curso.ciclo,
            creditos: curso.creditos,
            horario: curso.horario_completo,
            docente: curso.docente,
            tipo: 'regular',
            obligatorio: true
        }));

        // 4. Formatear la lista de cursos jalados (Turno Tarde)
        const cargosProcesados = cursosJalados.map((curso, index) => ({
            id: curso.id,
            codigo: `CARGO-0${index + 1}`,
            nombre: curso.nombre,
            ciclo: curso.ciclo,
            creditos: curso.creditos,
            horario: curso.horario_completo,
            docente: curso.docente,
            tipo: 'cargo',
            obligatorio: false
        }));

        // Validamos duplicados usando el entero limpio
        const [registroMatricula] = await db.query(`
            SELECT id FROM matriculas 
            WHERE estudiante_id = ? AND semestre_id = ? AND ciclo_cursado = ?
        `, [idEstudianteSeguro, semestre_id, cicloNumeroFinal]);

        const yaMatriculado = registroMatricula.length > 0;

        return res.status(200).json({
            cursos: [...regularesProcesados, ...cargosProcesados],
            totalCargosPendientes: cargosProcesados.length,
            yaMatriculado: yaMatriculado
        });

    } catch (error) {
        console.error("🚨 Error crítico en obtenerCursosParaMatricula:", error);
        return res.status(500).json({ error: error.message });
    }
};


// 🟢 NUEVO: Obtener el cronograma de sesiones de un curso con el historial de asistencia del alumno
exports.obtenerSesionesParaEstudiante = async (req, res) => {
    const { curso_id, semestre_id, estudiante_id } = req.query;

    if (!curso_id || !semestre_id || !estudiante_id) {
        return res.status(400).json({
            message: "Faltan parámetros obligatorios (curso_id, semestre_id y estudiante_id)."
        });
    }

    try {
        console.log(`-> [AIVEN.IO] Extrayendo cronograma dinámico del Curso ID: ${curso_id}`);

        // 1. Jalamos el esqueleto principal de las sesiones dictadas
        const [sesiones] = await db.query(`
            SELECT 
                s.id AS sesion_id,
                s.numero_sesion,
                s.titulo AS sesion_titulo,
                DATE_FORMAT(s.fecha_clase, '%d/%m/%Y') AS fecha_clase_formateada,
                (SELECT url_archivo FROM sesion_materiales sm WHERE sm.sesion_id = s.id ORDER BY sm.id DESC LIMIT 1) AS url_material,
                (SELECT nombre_archivo FROM sesion_materiales sm WHERE sm.sesion_id = s.id ORDER BY sm.id DESC LIMIT 1) AS nombre_material,
                IFNULL(
                    (SELECT CASE WHEN ca.asistio = 1 THEN 'asistio' ELSE 'falto' END 
                     FROM control_asistencias ca WHERE ca.sesion_id = s.id AND ca.estudiante_id = ?),
                    'no_registrado'
                ) AS mi_asistencia
            FROM sesiones s
            WHERE s.curso_id = ? AND s.semestre_id = ?
            ORDER BY s.numero_sesion ASC
        `, [Number(estudiante_id), Number(curso_id), Number(semestre_id)]);

        // 2. 🔥 LA MAGIA MULTI-ACTIVIDADES: Barremos cada sesión y le incrustamos sus tareas reales de la BD
        for (let i = 0; i < sesiones.length; i++) {
          const [actividades] = await db.query(`
                SELECT 
                    ae.id,
                    ae.titulo,
                    ae.tipo_documento,
                    ae.descripcion AS \`desc\`,
                    DATE_FORMAT(ae.fecha_limite, '%d %b %Y, %H:%i') AS fecha,
                    'PENDIENTE' AS estado,
                    
                    -- 🔥 CORRECCIÓN QUIRÚRGICA: Leemos tu columna real de la BD
                    ae.archivo_adjunto_url AS archivo_guia
                FROM actividades_evaluativas ae
                WHERE ae.sesion_id = ?
                ORDER BY ae.id ASC
            `, [sesiones[i].sesion_id]);

            // Se lo inyectamos de forma dinámica al objeto de la sesión
            sesiones[i].actividades = actividades;
        }

        return res.status(200).json(sesiones);

    } catch (error) {
        console.error("🚨 Error crítico en obtenerSesionesParaEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};

