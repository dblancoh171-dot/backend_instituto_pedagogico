const db = require('../config/db');

// Obtener todos los estudiantes con sus carreras
exports.listarEstudiantes = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.id, e.nombres, e.apellidos, e.dni, c.nombre AS carrera, e.ciclo_actual 
            FROM estudiantes e
            JOIN carreras c ON e.carrera_id = c.id
            ORDER BY e.apellidos ASC
        `);
        
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
