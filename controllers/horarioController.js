const db = require('../config/db'); // Tu pool de conexión nativa a MySQL

exports.obtenerHorarioProfesor = async (req, res) => {
    const { profesor_id, semestre_id } = req.query;

    console.log(`-> [AIVEN.IO] Extrayendo agenda horaria para Profesor ID: ${profesor_id} | Semestre ID: ${semestre_id}`);

    if (!profesor_id || !semestre_id) {
        return res.status(400).json({ message: "El ID del profesor y del semestre son obligatorios." });
    }

    try {
        console.log(`-> [AIVEN.IO] Auditoría: Evaluando plazos institucionales para el Profesor ID: ${profesor_id}`);

        // 1. 🔒 CANDADO DE SEGURIDAD INTERNO: Consultamos la fecha límite de actas de este periodo en la BD
        const [cronograma] = await db.query(`
            SELECT fecha_limite_actas FROM semestres WHERE id = ?
        `, [Number(semestre_id)]);

        if (cronograma.length > 0 && cronograma[0].fecha_limite_actas) {
            const ahoraPeruStr = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" });

            // 🔥 CAMBIO COMPROBADO: cronograma[0] asegura la lectura limpia de la primera fila
            const limiteActasStr = new Date(cronograma[0].fecha_limite_actas).toLocaleString("sv-SE", { timeZone: "America/Lima" });

            console.log(`-> [HACK TEST] Server Time: ${ahoraPeruStr} | Limit: ${limiteActasStr}`);

            if (ahoraPeruStr > limiteActasStr) {
                return res.status(403).json({
                    message: "⚠️ Acceso denegado por Auditoría.",
                    horario: [] // Enviamos el cascarón vacío
                });
            }
        }

        // =====================================================================
        // 🔓 ADENTRO DEL PERIODO VIVO: EJECUTAS TU CONSULTA ORIGINAL INTACTA
        // =====================================================================
        const [rows] = await db.query(`
            SELECT 
                h.id AS horario_id,
                c.nombre AS curso_nombre,
                c.ciclo AS curso_ciclo,
                h.dia_semana,
                b.hora_inicio,
                b.hora_fin,
                h.aula
            FROM horarios h
            INNER JOIN carga_academica ca ON h.carga_academica_id = ca.id
            INNER JOIN cursos c ON ca.curso_id = c.id
            INNER JOIN bloques_horarios b ON h.bloque_id = b.id
            WHERE ca.profesor_id = ? AND ca.semestre_id = ?
            ORDER BY 
                FIELD(LOWER(h.dia_semana), 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'), 
                b.hora_inicio ASC
        `, [Number(profesor_id), Number(semestre_id)]);

        return res.status(200).json(rows);

    } catch (error) {
        console.error("🚨 Error crítico interno en la consulta SQL de horarios:", error);
        return res.status(500).json({ error: error.message });
    }
};

