const db = require('../config/db');

exports.obtenerCursosParaMatricula = async (req, res) => {
    const { estudiante_id, ciclo_a_matricular, carrera_id } = req.query;

    if (!estudiante_id || !ciclo_a_matricular || !carrera_id) {
        return res.status(400).json({ 
            message: "Faltan parámetros obligatorios en la petición." 
        });
    }

    try {
        const semestre_id = 1; 

        // 1. Obtener cursos regulares de la mañana (Blindado contra Horarios NULL)
        const [cursosRegulares] = await db.query(`
            SELECT 
                c.id, 
                c.nombre, 
                c.ciclo, 
                3 AS creditos,
                IFNULL(CONCAT(p.nombres, ' ', p.apellidos), 'Por Asignar') AS docente,
                IFNULL(
                    (
                        SELECT GROUP_CONCAT(
                            CONCAT(UPPER(SUBSTRING(h2.dia_semana, 1, 1)), SUBSTRING(h2.dia_semana, 2), ' (', DATE_FORMAT(h2.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h2.hora_fin, '%H:%i'), ')')
                            SEPARATOR ' / '
                        )
                        FROM horarios h2
                        WHERE h2.carga_academica_id = ca.id
                    ),
                    'Horario por Definir'
                ) AS horario_completo
            FROM cursos c
            LEFT JOIN carga_academica ca ON ca.curso_id = c.id AND ca.semestre_id = ?
            LEFT JOIN profesores p ON ca.profesor_id = p.id
            WHERE c.ciclo = ? AND c.carrera_id = ?
            GROUP BY c.id, c.nombre, c.ciclo, ca.id, p.nombres, p.apellidos
        `, [semestre_id, ciclo_a_matricular, carrera_id]);

        // 2. Obtener cursos desaprobados (Cargos de la tarde - Blindado)
        let cursosJalados = [];
        
        if (Number(ciclo_a_matricular) > 1) {
            [cursosJalados] = await db.query(`
                SELECT 
                    c.id, 
                    c.nombre, 
                    c.ciclo, 
                    3 AS creditos,
                    IFNULL(CONCAT(p.nombres, ' ', p.apellidos), 'Prof. Subsanación') AS docente,
                    IFNULL(
                        (
                            SELECT GROUP_CONCAT(
                                CONCAT(UPPER(SUBSTRING(h3.dia_semana, 1, 1)), SUBSTRING(h3.dia_semana, 2), ' (', DATE_FORMAT(h3.hora_inicio, '%H:%i'), '-', DATE_FORMAT(h3.hora_fin, '%H:%i'), ')')
                                SEPARATOR ' / '
                            )
                            FROM horarios h3
                            WHERE h3.carga_academica_id = ca.id
                        ),
                        'Horario por Definir (Tarde)'
                    ) AS horario_completo
                FROM notas n
                JOIN cursos c ON n.curso_id = c.id
                LEFT JOIN carga_academica ca ON ca.curso_id = c.id AND ca.semestre_id = ?
                LEFT JOIN profesores p ON ca.profesor_id = p.id
                WHERE n.estudiante_id = ? 
                  AND n.resultado = 'desaprobado' 
                  AND c.ciclo < ? 
                  AND c.carrera_id = ?
                  AND c.id NOT IN (
                      SELECT curso_id FROM notas WHERE estudiante_id = ? AND resultado = 'aprobado'
                  )
                GROUP BY c.id, c.nombre, c.ciclo, ca.id, p.nombres, p.apellidos
            `, [semestre_id, estudiante_id, ciclo_a_matricular, carrera_id, estudiante_id]);
        }

        // 3. Formatear la lista de cursos regulares (Turno Mañana)
        const regularesProcesados = cursosRegulares.map((curso, index) => ({
            id: curso.id,
            codigo: `SI${curso.ciclo}0${index + 1}`,
            nombre: curso.nombre,
            ciclo: curso.ciclo, 
            creditos: curso.creditos,
            horario: curso.horario_completo, 
            docente: curso.docente,          
            tipo: 'regular',
            obligatorio: true
        }));

        // 4. Formatear la lista de cursos jalados (Turno Tarde)
        const cargosProcesados = cursosJalados.map((curso, index) => ({
            id: curso.id,
            codigo: `CARGO-0${index + 1}`,
            nombre: curso.nombre,
            ciclo: curso.ciclo, 
            creditos: curso.creditos,
            horario: curso.horario_completo, 
            docente: curso.docente,
            tipo: 'cargo',
            obligatorio: false
        }));

       // Validamos de forma real en la base de datos si ya tiene una matrícula registrada
        const [registroMatricula] = await db.query(`
            SELECT id FROM matriculas 
            WHERE estudiante_id = ? AND semestre_id = ? AND ciclo_cursado = ?
        `, [estudiante_id, semestre_id, ciclo_a_matricular]);

        const yaMatriculado = registroMatricula.length > 0;

        // Enviamos la bandera hacia el frontend de React
        res.status(200).json({
            cursos: [...regularesProcesados, ...cargosProcesados],
            totalCargosPendientes: cargosProcesados.length,
            yaMatriculado: yaMatriculado // 👈 Le avisa a React si ya completó el proceso
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

