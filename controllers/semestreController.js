const db = require('../config/db');

// 🟢 ADUANA CRONOLÓGICA EN TU CONTROLADOR DEL BACKEND
exports.registrarOEditarSemestre = async (req, res) => {
    const { 
        nombre_semestre, 
        fecha_inicio_matricula, 
        fecha_fin_matricula, 
        fecha_inicio_clases, 
        fecha_fin_clases 
    } = req.body;

    // 1. Validamos que las cadenas de texto de las fechas existan
    if (!fecha_inicio_matricula || !fecha_fin_matricula || !fecha_inicio_clases || !fecha_fin_clases) {
        return res.status(400).json({ message: "❌ Todas las fechas del cronograma son obligatorias." });
    }

    // 2. Convertimos los strings a objetos Date nativos de JavaScript para poder compararlos matemáticamente
    const inicioMatricula = new Date(fecha_inicio_matricula);
    const finMatricula = new Date(fecha_fin_matricula);
    const inicioClases = new Date(fecha_inicio_clases);
    const finClases = new Date(fecha_fin_clases);

    // 🛡️ FILTRO DE SEGURIDAD 1: Coherencia en el periodo de Matrícula
    if (inicioMatricula >= finMatricula) {
        return res.status(422).json({ 
            message: "⚠️ Error de Cronograma: La fecha de inicio de matrícula debe ser estrictamente anterior a la fecha de cierre." 
        });
    }

    // 🛡️ FILTRO DE SEGURIDAD 2: El conflicto de cruce que detectaste en tu monitor
    if (inicioClases < finMatricula) {
        return res.status(422).json({ 
            message: "⚠️ Error de Cronograma: No se puede iniciar el ciclo académico si el proceso regular de matrícula aún se encuentra abierto." 
        });
    }

    // 🛡️ FILTRO DE SEGURIDAD 3: Coherencia en el periodo de Clases
    if (inicioClases >= finClases) {
        return res.status(422).json({ 
            message: "⚠️ Error de Cronograma: La fecha de apertura de clases debe ser anterior a la fecha de clausura del semestre." 
        });
    }

    try {
        console.log(`-> [AIVEN.IO] Cronograma validado con éxito. Insertando periodo: ${nombre_semestre}`);
        
        // Si pasa todas las aduanas limpias, recién ejecuta el query en MySQL
        await db.query(`
            INSERT INTO semestres 
                (nombre, fecha_inicio_matricula, fecha_fin_matricula, fecha_inicio_clases, fecha_fin_clases)
            VALUES (?, ?, ?, ?, ?)
        `, [nombre_semestre, fecha_inicio_matricula, fecha_fin_matricula, fecha_inicio_clases, fecha_fin_clases]);

        return res.status(201).json({ message: "🚀 Periodo académico configurado con éxito absoluto." });

    } catch (error) {
        console.error("🚨 Error al registrar el semestre:", error);
        return res.status(500).json({ error: error.message });
    }
};
