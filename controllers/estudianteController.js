const db = require('../config/db');

// 🟢 CORREGIDO: Lista todos los estudiantes trayendo sus nombres desde la tabla usuarios
exports.listarEstudiantes = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                e.id, 
                u.nombres, 
                u.apellidos, 
                u.dni, 
                e.carrera_id, 
                c.nombre AS carrera, 
                e.ciclo_actual 
            FROM estudiantes e
            INNER JOIN usuarios u ON e.usuario_id = u.id
            INNER JOIN carreras c ON e.carrera_id = c.id
            ORDER BY u.apellidos ASC
        `);
        
        return res.status(200).json(rows);
    } catch (error) {
        console.error("🚨 Error en listarEstudiantes:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 🟢 VERIFICADO Y BLINDADO: Obtener los datos de un estudiante específico por su ID
exports.obtenerPerfilEstudiante = async (req, res) => {
    const { id } = req.params;

    console.log(`-> [AIVEN.IO] Extrayendo perfil del Estudiante ID: ${id}`);

    try {
        const [rows] = await db.query(`
            SELECT 
                e.id AS estudiante_id,
                e.codigo_estudiante,
                e.carrera_id,
                e.ciclo_actual, 
                e.fecha_ingreso,
                u.id AS usuario_id,
                u.nombres,
                u.apellidos,
                u.dni,
                u.email
            FROM estudiantes e
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE e.id = ?
        `, [Number(id)]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Estudiante no registrado en Aiven.io." });
        }

        // Retornamos el objeto directo para que React no reciba un arreglo de una sola fila
        return res.status(200).json(rows[0]);

    } catch (error) {
        console.error("🚨 Error crítico en obtenerPerfilEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};

