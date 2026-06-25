const db = require('../config/db');

// 1. 🔥 NUEVO: Función obligatoria para traer la lista de alumnos inscritos en el curso
exports.obtenerAlumnosPorCurso = async (req, res) => {
    const { curso_id, semestre_id } = req.query;

    if (!curso_id || !semestre_id) {
        return res.status(400).json({ message: "Faltan parámetros obligatorios (curso_id o semestre_id)." });
    }

    try {
        const [alumnos] = await db.query(`
            SELECT 
                e.id AS estudiante_id,
                e.nombres,
                e.apellidos,
                e.dni,
                n.nota_final,
                n.resultado
            FROM matricula_detalles md
            JOIN matriculas m ON md.matricula_id = m.id
            JOIN estudiantes e ON m.estudiante_id = e.id
            LEFT JOIN notas n ON n.estudiante_id = e.id AND n.curso_id = md.curso_id AND n.semestre_id = m.semestre_id
            WHERE md.curso_id = ? AND m.semestre_id = ?
            ORDER BY e.apellidos ASC, e.nombres ASC
        `, [curso_id, semestre_id]);

        res.status(200).json(alumnos);
    } catch (error) {
        res.status(500).json({ error: error.message });
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

