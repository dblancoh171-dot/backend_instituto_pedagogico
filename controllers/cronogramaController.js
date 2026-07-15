const db = require('../config/db'); // Importamos tu conexión híbrida a MySQL

// 📅 REGISTRAR NUEVA EVALUACIÓN EN EL CRONOGRAMA
exports.guardarEvaluacionCronograma = async (req, res) => {
    const { semestre_id, num_evaluacion, nombre_nota, peso_porcentaje, fecha_inicio_ingreso, fecha_fin_ingreso } = req.body;

    if (!semestre_id || !num_evaluacion || !fecha_inicio_ingreso || !fecha_fin_ingreso) {
        return res.status(400).json({ message: "Los campos relacionales y cronológicos son obligatorios." });
    }

    try {
        await db.query(`
            INSERT INTO configuracion_notas_global 
                (semestre_id, num_evaluacion, nombre_nota, peso_porcentaje, fecha_inicio_ingreso, fecha_fin_ingreso)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [Number(semestre_id), Number(num_evaluacion), nombre_nota, parseFloat(peso_porcentaje), fecha_inicio_ingreso, fecha_fin_ingreso]);

        return res.status(200).json({ message: "¡Unidad evaluativa registrada correctamente en el calendario!" });

    } catch (error) {
        console.error("🚨 Error capturado en guardarEvaluacionCronograma:", error);

        // 🛡️ INTERCEPTOR DEL NUEVO TRIGGER DE INSERCIÓN:
        if (error.code === 'ER_TRG_SIGNAL_NOT_HANDLED' || (error.sqlMessage && error.sqlMessage.includes('La fecha de inicio de esta evaluacion debe ser mayor'))) {
            return res.status(422).json({ 
                message: "Error de Secuencialidad: La fecha de inicio de esta evaluación debe ser estrictamente posterior a la fecha de finalización de la unidad anterior." 
            });
        }

        return res.status(500).json({ error: error.message });
    }
};

// ⚙️ ACTUALIZAR EVALUACIÓN EXISTENTE (Para cuando editan en tu monitor)
exports.actualizarEvaluacionCronograma = async (req, res) => {
    const { id } = req.params; // ID de la fila en configuracion_notas_global
    const { fecha_inicio_ingreso, fecha_fin_ingreso, peso_porcentaje, nombre_nota } = req.body;

    try {
        await db.query(`
            UPDATE configuracion_notas_global
            SET 
                fecha_inicio_ingreso = ?,
                fecha_fin_ingreso = ?,
                peso_porcentaje = ?,
                nombre_nota = ?
            WHERE id = ?
        `, [fecha_inicio_ingreso, fecha_fin_ingreso, parseFloat(peso_porcentaje), nombre_nota, Number(id)]);

        return res.status(200).json({ message: "¡Cronograma actualizado de forma conforme!" });

    } catch (error) {
        console.error("🚨 Error capturado en actualizarEvaluacionCronograma:", error);

        // 🛡️ INTERCEPTOR DEL TRIGGER DE UPDATE:
        if (error.code === 'ER_TRG_SIGNAL_NOT_HANDLED' || (error.sqlMessage && error.sqlMessage.includes('La fecha de inicio de esta evaluacion debe ser mayor'))) {
            return res.status(422).json({ 
                message: "Operación Cancelada: MySQL rechazó los cambios. El nuevo rango temporal se cruza de forma ilegal con la fecha de fin de la evaluación anterior." 
            });
        }

        return res.status(500).json({ error: error.message });
    }
};
