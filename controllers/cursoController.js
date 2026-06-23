const db = require('../config/db');

exports.obtenerCursosParaMatricula = async (req, res) => {
    const { estudiante_id, ciclo_a_matricular } = req.query;

    try {
        // 1. Traer todos los cursos que pertenecen al ciclo que el alumno quiere matricular
        const [cursosCiclo] = await db.query(
            'SELECT id, nombre, ciclo FROM cursos WHERE ciclo = ?', 
            [ciclo_a_matricular]
        );

        // 2. Traer el historial de notas del alumno en los ciclos anteriores
        const [historial] = await db.query(`
            SELECT curso_id, nota_final, resultado 
            FROM notas 
            WHERE estudiante_id = ?
        `, [estudiante_id]);

        // 3. Procesar cada curso para enviarle las "órdenes" a React
        const cursosProcesados = cursosCiclo.map(curso => {
            // Buscamos si el alumno ya tiene una nota registrada para este curso
            const notaHistorica = historial.find(h => h.curso_id === curso.id);

            let estadoVisual = 'disponible'; // Puede ser: disponible, aprobado, jalado_bloqueado
            let mensaje = 'Listo para agregar';

            if (notaHistorica) {
                if (notaHistorica.resultado === 'aprobado') {
                    estadoVisual = 'aprobado';
                    mensaje = `Ya aprobado con nota: ${notaHistorica.nota_final}`;
                } else if (notaHistorica.resultado === 'desaprobado') {
                    // 🔥 AQUÍ SE DETECTA TU CASO: Si está jalado, se marca para ponerse en rojo
                    estadoVisual = 'jalado_bloqueado';
                    mensaje = `Desaprobado con ${notaHistorica.nota_final}. Debe repetirse en el semestre correspondiente.`;
                }
            }

            return {
                id: curso.id,
                nombre: curso.nombre,
                ciclo: curso.ciclo,
                estadoVisual: estadoVisual, // React usará esto para pintar en rojo o deshabilitar
                mensaje: mensaje
            };
        });

        res.status(200).json(cursosProcesados);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
