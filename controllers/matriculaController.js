const db = require('../config/db');

exports.matricularEstudiante = async (req, res) => {
    const { estudiante_id, semestre_id, ciclo_a_matricular } = req.body;

    try {
        // 1. Obtener datos del semestre y verificar si la matrícula está abierta por fecha
        const [semestreResult] = await db.query(
            'SELECT tipo, estado_matricula, fecha_inicio_matricula, fecha_fin_matricula FROM semestres WHERE id = ?', 
            [semestre_id]
        );
        
        if (semestreResult.length === 0) {
            return res.status(404).json({ message: "Semestre no encontrado." });
        }
        
        const semestre = semestreResult[0];
        const fechaActual = new Date();

        // Validar si la matrícula está abierta de forma manual o por tiempo
        if (semestre.estado_matricula !== 'abierto') {
            return res.status(400).json({ message: "El proceso de matrícula está CERRADO." });
        }
        if (fechaActual < new Date(semestre.fecha_inicio_matricula) || fechaActual > new Date(semestre.fecha_fin_matricula)) {
            return res.status(400).json({ message: "Fuera de la fecha límite de matrícula." });
        }

        // 2. Validar correspondencia de ciclos (Pares / Impares)
        const tipoSemestre = semestre.tipo; // 'I' o 'II'
        const esCicloImpar = ciclo_a_matricular % 2 !== 0;

        if (tipoSemestre === 'I' && !esCicloImpar) {
            return res.status(400).json({ message: "En el semestre I solo se pueden dictar ciclos IMPARES." });
        }
        if (tipoSemestre === 'II' && esCicloImpar) {
            return res.status(400).json({ message: "En el semestre II solo se pueden dictar ciclos PARES." });
        }

        // 3. Buscar el ciclo actual (último ciclo que cursó el alumno)
        const [estudianteResult] = await db.query('SELECT ciclo_actual FROM estudiantes WHERE id = ?', [estudiante_id]);
        if (estudianteResult.length === 0) {
            return res.status(404).json({ message: "Estudiante no encontrado." });
        }

        const cicloAnterior = estudianteResult[0].ciclo_actual;

        // 4. Contar cuántos cursos desaprobó exactamente en ese ciclo anterior
        const [notasJaladas] = await db.query(`
            SELECT COUNT(*) as total_desaprobados 
            FROM notas n
            JOIN cursos c ON n.curso_id = c.id
            WHERE n.estudiante_id = ? AND c.ciclo = ? AND n.resultado = 'desaprobado'
        `, [estudiante_id, cicloAnterior]);

        const cantidadJalados = notasJaladas[0].total_desaprobados;

        // 🔥 REGLA DE NEGOCIO ACTUALIZADA: Determinar si repite ciclo (3 o más cursos jalados)
        const repiteCicloCompleto = cantidadJalados >= 3;
        const estadoMatricula = repiteCicloCompleto ? 'repitente' : 'regular';

        // 5. Validar si el ciclo solicitado corresponde a su situación académica
        if (repiteCicloCompleto) {
            // Si jaló 3 o más, OBLIGATORIAMENTE debe volver a matricularse en el mismo ciclo
            if (ciclo_a_matricular !== cicloAnterior) {
                return res.status(400).json({ 
                    message: `Repites el ciclo por completo. Tienes ${cantidadJalados} cursos desaprobados en el ciclo ${cicloAnterior}. Debes volver a cursarlo.` 
                });
            }
        } else {
            // Si jaló 0, 1 o 2 cursos, se le permite avanzar al ciclo siguiente inmediato
            // (Excepción: si es su primera matrícula y está en ciclo 1 de origen)
            if (ciclo_a_matricular !== (cicloAnterior + 1) && !(cicloAnterior === 1 && ciclo_a_matricular === 1)) {
                return res.status(400).json({ 
                    message: `Operación inválida. Al tener ${cantidadJalados} cursos desaprobados, puedes avanzar al ciclo ${cicloAnterior + 1}.` 
                });
            }
        }

        // 6. Registrar la matrícula en la base de datos
        await db.query(`
            INSERT INTO matriculas (estudiante_id, semestre_id, ciclo_cursado, estado)
            VALUES (?, ?, ?, ?)
        `, [estudiante_id, semestre_id, ciclo_a_matricular, estadoMatricula]);

        // 7. Actualizar el ciclo asignado en su ficha de estudiante
        await db.query('UPDATE estudiantes SET ciclo_actual = ? WHERE id = ?', [ciclo_a_matricular, estudiante_id]);

        res.status(201).json({ 
            message: "Estudiante matriculado con éxito", 
            condicion: estadoMatricula,
            cursos_en_cargo: repiteCicloCompleto ? 0 : cantidadJalados
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "El estudiante ya está matriculado en este semestre." });
        }
        res.status(500).json({ error: error.message });
    }
};

