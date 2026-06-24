const db = require('../config/db');

// Obtener todos los estudiantes con sus carreras
exports.listarEstudiantes = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.id, e.nombres, e.apellidos, e.dni, e.carrera_id, c.nombre AS carrera, e.ciclo_actual 
            FROM estudiantes e
            JOIN carreras c ON e.carrera_id = c.id
            ORDER BY e.apellidos ASC
        `);
        
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Obtener los datos de un estudiante específico por su ID
exports.obtenerPerfilEstudiante = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.query(`
            SELECT e.id, e.nombres, e.apellidos, e.carrera_id, c.nombre AS carrera, e.ciclo_actual
            FROM estudiantes e
            JOIN carreras c ON e.carrera_id = c.id
            WHERE e.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Estudiante no encontrado." });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
