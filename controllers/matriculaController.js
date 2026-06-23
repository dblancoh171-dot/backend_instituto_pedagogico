const db = require('../config/db');

exports.matricularEstudiante = async (req, res) => {
    const { estudiante_id, semestre_id, ciclo_a_matricular } = req.body;

    try {
          // 1. Obtener datos del semestre, fechas y estado de matrícula
        const [semestreResult] = await db.query(
            'SELECT tipo, estado_matricula, fecha_inicio_matricula, fecha_fin_matricula FROM semestres WHERE id = ?', 
            [semestre_id]
        );
        
        if (semestreResult.length === 0) {
            return res.status(404).json({ message: "Semestre no encontrado." });
        }
        
        const semestre = semestreResult[0];
        const fechaActual = new Date();

        // 🔥 NUEVA VALIDACIÓN 1: Verificar si el administrador abrió la matrícula de manera global
        if (semestre.estado_matricula !== 'abierto') {
            return res.status(400).json({ 
                message: `El proceso de matrícula para este periodo se encuentra actualmente ${semestre.estado_matricula.toUpperCase()}.` 
            });
        }

        // 🔥 NUEVA VALIDACIÓN 2: Verificar si la fecha actual está dentro del plazo permitido
        const inicio = new Date(semestre.fecha_inicio_matricula);
        const fin = new Date(semestre.fecha_fin_matricula);

        if (fechaActual < inicio) {
            return res.status(400).json({ message: "El proceso de matrícula aún no ha comenzado." });
        }
        if (fechaActual > fin) {
            return res.status(400).json({ message: "El plazo límite para matricularse ha vencido. Contacte con administración." });
        }
        
        const tipoSemestre = semestre[0].tipo; // 'I' o 'II'
        const esCicloImpar = ciclo_a_matricular % 2 !== 0;

        // 2. Validar regla de correspondencia de ciclos (Pares / Impares)
        if (tipoSemestre === 'I' && !esCicloImpar) {
            return res.status(400).json({ message: "En el semestre I solo se pueden dictar ciclos IMPARES." });
        }
        if (tipoSemestre === 'II' && esCicloImpar) {
            return res.status(400).json({ message: "En el semestre II solo se pueden dictar ciclos PARES." });
        }

        // ====================================================================
        // 🔥 AQUÍ SE PEGÓ LA NUEVA VALIDACIÓN QUE COMPRUEBA EL CICLO ACTUAL
        // ====================================================================
        
        // 3. Buscamos el ciclo actual del estudiante en la base de datos
        const [estudiante] = await db.query('SELECT ciclo_actual FROM estudiantes WHERE id = ?', [estudiante_id]);
        if (estudiante.length === 0) {
            return res.status(404).json({ message: "Estudiante no encontrado." });
        }

        const cicloAnterior = estudiante[0].ciclo_actual;

        // 4. Comprobamos si desaprobó alguna materia en su último ciclo cursado
        const [notasJaladas] = await db.query(`
            SELECT COUNT(*) as desaprobados 
            FROM notas n
            JOIN cursos c ON n.curso_id = c.id
            WHERE n.estudiante_id = ? AND c.ciclo = ? AND n.resultado = 'desaprobado'
        `, [estudiante_id, cicloAnterior]);

        const tieneCursosJalados = notasJaladas[0].desaprobados > 0;

        // 5. Validar si el ciclo solicitado corresponde a su situación académica
        if (tieneCursosJalados) {
            // Si jaló, debe repetir exactamente el mismo ciclo que ya llevó
            if (ciclo_a_matricular !== cicloAnterior) {
                return res.status(400).json({ 
                    message: `No puedes avanzar. Desaprobaste cursos del ciclo ${cicloAnterior} y debes volver a cursarlo.` 
                });
            }
        } else {
            // Si aprobó todo (o si es su primera matrícula ciclo_actual = 1), debe ir al ciclo siguiente
            // Nota: Permitimos matricularse en ciclo 1 si su ciclo_actual es 1 y no tiene historial de notas aún
            if (ciclo_a_matricular !== (cicloAnterior + 1) && !(cicloAnterior === 1 && ciclo_a_matricular === 1)) {
                return res.status(400).json({ 
                    message: `Operación inválida. Tu ciclo siguiente correcto es el ciclo ${cicloAnterior + 1}.` 
                });
            }
        }

        // ====================================================================
        // FIN DE LA NUEVA VALIDACIÓN
        // ====================================================================

        const estadoMatricula = tieneCursosJalados ? 'repitente' : 'regular';

        // 6. Registrar la matrícula oficial
        await db.query(`
            INSERT INTO matriculas (estudiante_id, semestre_id, ciclo_cursado, estado)
            VALUES (?, ?, ?, ?)
        `, [estudiante_id, semestre_id, ciclo_a_matricular, estadoMatricula]);

        // 7. Actualizar el ciclo actual en la ficha del estudiante
        await db.query('UPDATE estudiantes SET ciclo_actual = ? WHERE id = ?', [ciclo_a_matricular, estudiante_id]);

        res.status(201).json({ 
            message: "Estudiante matriculado con éxito", 
            condicion: estadoMatricula 
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "El estudiante ya está matriculado en este semestre." });
        }
        res.status(500).json({ error: error.message });
    }
};

