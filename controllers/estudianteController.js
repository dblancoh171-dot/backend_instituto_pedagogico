const db = require('../config/db');

const fs = require('fs');
const path = require('path');

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




exports.obtenerPerfilCompletoEstudiante = async (req, res) => {
    // Capturamos el estudiante_id enviado por Axios desde el Frontend
    const { estudiante_id } = req.query;

    console.log(`-> [AIVEN.IO] Aduana Alumno: Compilando legajo para Estudiante ID: ${estudiante_id}`);

    if (!estudiante_id) {
        return res.status(400).json({ message: "El ID del estudiante es requerido." });
    }

    try {
        // 🔥 QUERY ADAPTADO 100% A TU MONITOR DE LA CAPTURA
        const [rows] = await db.query(`
            SELECT 
                e.id AS estudiante_id,
                u.id AS usuario_id,
                e.codigo_estudiante,
                u.nombres,
                u.apellidos,
                u.dni,
                u.email,
                u.telefono,
                u.direccion,
                u.url_foto,
                e.ciclo_actual,
                e.fecha_ingreso AS miembro_desde
            FROM estudiantes e
            INNER JOIN usuarios u ON e.usuario_id = u.id
            WHERE e.id = ?
        `, [Number(estudiante_id)]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: "No se encontro el historial del estudiante." });
        }

        return res.status(200).json(rows[0]); // Retorna la fila limpia desestructurada

    } catch (error) {
        console.error("🚨 Error critico en obtenerPerfilCompletoEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};


// 📸 A) SUBIR O EDITAR FOTO DE PERFIL DEL ESTUDIANTE
exports.actualizarFotoPerfilEstudiante = async (req, res) => {
    const { usuario_id } = req.body;

    console.log(`-> [AIVEN.IO] Procesando carga de avatar para Estudiante - Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El ID de usuario es obligatorio." });
    }

    if (!req.file) {
        return res.status(400).json({ message: "No se ha adjuntado ninguna imagen binaria." });
    }

    try {
        const nuevaUrlFoto = `/uploads/perfiles/${req.file.filename}`;

        // 🔍 LIMPIEZA DE DISCO: Eliminamos la foto anterior si existía
        const [usuarioInfo] = await db.query('SELECT url_foto FROM usuarios WHERE id = ?', [Number(usuario_id)]);
        if (usuarioInfo.length > 0 && usuarioInfo[0].url_foto) {
            const rutaFotoVieja = path.join(__dirname, '..', usuarioInfo[0].url_foto);
            if (fs.existsSync(rutaFotoVieja)) {
                fs.unlinkSync(rutaFotoVieja);
            }
        }

        // Asentamos el nuevo string en tu tabla usuarios
        await db.query('UPDATE usuarios SET url_foto = ? WHERE id = ?', [nuevaUrlFoto, Number(usuario_id)]);

        return res.status(200).json({
            message: "¡Fotografia de perfil estudiantil actualizada con exito!",
            url_foto: nuevaUrlFoto
        });

    } catch (error) {
        console.error("🚨 Error critico al guardar la foto del alumno:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 🗑️ B) ELIMINAR FOTO DE PERFIL DEL ESTUDIANTE
exports.eliminarFotoPerfilEstudiante = async (req, res) => {
    const { usuario_id } = req.body;

    console.log(`-> [AIVEN.IO] Solicitud de borrado de avatar para Alumno - Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El ID de usuario es obligatorio." });
    }

    try {
        const [usuarioInfo] = await db.query('SELECT url_foto FROM usuarios WHERE id = ?', [Number(usuario_id)]);
        
        if (usuarioInfo.length > 0 && usuarioInfo[0].url_foto) {
            const rutaArchivo = path.join(__dirname, '..', usuarioInfo[0].url_foto);
            
            if (fs.existsSync(rutaArchivo)) {
                fs.unlinkSync(rutaArchivo);
            }

            await db.query('UPDATE usuarios SET url_foto = NULL WHERE id = ?', [Number(usuario_id)]);
            return res.status(200).json({ message: "La fotografia fue eliminada correctamente del perfil estudiantil." });
        }

        return res.status(404).json({ message: "El alumno no registra ninguna foto de perfil activa." });

    } catch (error) {
        console.error("🚨 Error al eliminar la foto del estudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};


// ✏️ ACTUALIZAR EXCLUSIVAMENTE TELÉFONO Y DIRECCIÓN DEL ESTUDIANTE (USUARIO)
// ✏️ ACTUALIZAR CONTACTO CON CANDADOS ESTRICTOS POR HARDWARE
exports.actualizarContactoEstudiante = async (req, res) => {
    const { usuario_id, telefono, direccion } = req.body;

    console.log(`-> [AIVEN.IO] Aduana Contacto: Procesando actualizacion para Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El ID de usuario es estrictamente obligatorio." });
    }

    // =========================================================================
    // 🛡️ ADUANA DEL BACKEND: VALIDACIÓN Y CANDADO NUMÉRICO ESTRICTO
    // =========================================================================
    if (telefono && telefono !== '') {
        // Candado 1: Validamos que contenga UNICAMENTE digitos numericos
        const soloDigitos = /^\d+$/;
        if (!soloDigitos.test(telefono)) {
            return res.status(400).json({ message: "Seguridad: El telefono solo debe contener digitos numericos, sin letras ni simbolos." });
        }

        // Candado 2: Validamos que tenga EXACTAMENTE 9 caracteres (Formato celular)
        if (telefono.length !== 9) {
            return res.status(400).json({ message: "Seguridad: El numero de telefono celular debe tener exactamente 9 digitos." });
        }
    }
    // =========================================================================

    try {
        // Ejecutamos el UPDATE seguro sobre la tabla usuarios
        await db.query(`
            UPDATE usuarios 
            SET telefono = ?, direccion = ? 
            WHERE id = ?
        `, [telefono || null, direccion || null, Number(usuario_id)]);

        return res.status(200).json({ message: "¡Datos de contacto validados y actualizados de forma segura!" });

    } catch (error) {
        console.error("🚨 Error critico en la aduana de actualizarContactoEstudiante:", error);
        return res.status(500).json({ error: error.message });
    }
};




// ⏳ ENDPOINT HISTORIAL ACADÉMICO: ADAPTADO A TUS CELDAS 'NULL' EN CURSO
// ⏳ ENDPOINT HISTORIAL ACADÉMICO: ADAPTADO AL 100% A TU HARDWARE REAL DE APERTURA
exports.obtenerHistorialAcademicoEstudiante = async (req, res) => {
    const { usuario_id, estudiante_id } = req.query;
    const idIdentificador = usuario_id || estudiante_id;

    console.log(`-> [AIVEN.IO] Generando Sabana Historica para ID: ${idIdentificador}`);

    if (!idIdentificador) {
        return res.status(400).json({ message: "El identificador es obligatorio." });
    }

    try {
        // 🚀 CORRECCIÓN MÁXIMA: Removido 'c.creditos' que no existe en tu tabla física de cursos
        const [rows] = await db.query(`
            SELECT 
                s.codigo AS semestre_nombre,
                c.codigo AS curso_codigo,
                c.nombre AS curso_nombre,
                c.creditos,
                m.ciclo_cursado AS curso_ciclo,
                COALESCE(md.promedio_final, 0.00) AS promedio_final,
                IFNULL(md.estado_aprobacion, 'En Curso') AS estado_aprobacion
            FROM matricula_detalles md
            INNER JOIN matriculas m ON md.matricula_id = m.id
            INNER JOIN cursos c ON md.curso_id = c.id
            INNER JOIN semestres s ON m.semestre_id = s.id
            INNER JOIN estudiantes e ON m.estudiante_id = e.id
            WHERE e.usuario_id = ? OR e.id = ?
            ORDER BY s.id DESC, m.ciclo_cursado ASC, c.nombre ASC
        `, [Number(idIdentificador), Number(idIdentificador)]);

        return res.status(200).json(rows);

    } catch (error) {
        console.error("🚨 Error critico en la consulta SQL de historial:", error);
        return res.status(500).json({ error: error.message });
    }
};



/// 📅 ENDPOINT ACTUALIZADO: HORARIO ESTUDIANTIL CON DATA COMPLETA DEL DOCENTE
exports.obtenerHorarioEstudiante = async (req, res) => {
    const { usuario_id } = req.query;

    console.log(`-> [AIVEN.IO] Agenda Detallada: Compilando clases para Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El parametro usuario_id es obligatorio." });
    }

    try {
        // 🔥 QUERY REDISEÑADO: Extrae las horas desde bloques_horarios (bh)
        const [rows] = await db.query(`
            SELECT DISTINCT
                h.id AS horario_id,
                c.nombre AS curso_nombre,
                c.codigo AS curso_codigo,
                c.ciclo AS curso_ciclo,
                h.dia_semana,
                bh.hora_inicio,
                bh.hora_fin,
                bh.cantidad_horas_acad,
                h.aula,
                CONCAT(u_prof.nombres, ' ', u_prof.apellidos) AS profesor_nombre
            FROM horarios h
            INNER JOIN bloques_horarios bh ON h.bloque_id = bh.id
            INNER JOIN carga_academica ca ON h.carga_academica_id = ca.id
            INNER JOIN cursos c ON ca.curso_id = c.id
            INNER JOIN profesores p ON ca.profesor_id = p.id
            INNER JOIN usuarios u_prof ON p.usuario_id = u_prof.id
            INNER JOIN matricula_detalles md ON c.id = md.curso_id
            INNER JOIN matriculas m ON md.matricula_id = m.id
            INNER JOIN estudiantes e ON m.estudiante_id = e.id
            WHERE e.usuario_id = ? AND m.semestre_id = ca.semestre_id
            ORDER BY 
                FIELD(LOWER(h.dia_semana), 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'), 
                bh.hora_inicio ASC
        `, [Number(usuario_id)]);

        return res.status(200).json(rows);

    } catch (error) {
        console.error("🚨 Error critico SQL en obtenerHorarioEstudiante normalizado:", error);
        return res.status(500).json({ error: error.message });
    }
};



