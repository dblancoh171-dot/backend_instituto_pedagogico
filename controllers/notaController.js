const db = require('../config/db');

exports.registrarNota = async (req, res) => {
    const { estudiante_id, curso_id, semestre_id, nota_final } = req.body;

    // Validación básica de rango de nota (0 a 20)
    if (nota_final < 0 || nota_final > 20) {
        return res.status(400).json({ message: "La nota debe estar entre 0 y 20." });
    }

    try {
        // Verificar que el estudiante esté matriculado en este semestre antes de asignarle nota
        const [matricula] = await db.query(
            'SELECT id FROM matriculas WHERE estudiante_id = ? AND semestre_id = ?',
            [estudiante_id, semestre_id]
        );

        if (matricula.length === 0) {
            return res.status(400).json({ message: "El estudiante no está matriculado en este semestre." });
        }

        // Insertar o actualizar la nota (si ya existe)
        await db.query(`
            INSERT INTO notas (estudiante_id, curso_id, semestre_id, nota_final)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE nota_final = VALUES(nota_final)
        `, [estudiante_id, curso_id, semestre_id, nota_final]);

        res.status(200).json({ message: "Nota registrada correctamente." });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
