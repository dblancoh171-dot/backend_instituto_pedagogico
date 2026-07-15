const db = require('../config/db'); // Tu conexión pool de MySQL

const fs = require('fs');
const path = require('path');

exports.obtenerPerfilCompletoDocente = async (req, res) => {
    const { profesor_id } = req.query;

    console.log(`-> [AIVEN.IO] Extrayendo legajo completo para Profesor ID: ${profesor_id}`);

    if (!profesor_id) {
        return res.status(400).json({ message: "El ID del profesor es estrictamente requerido." });
    }

    try {
        // 1. Jalamos los datos personales unificando la tabla 'usuarios' y 'profesores'
        const [datosBasicos] = await db.query(`
            SELECT 
                p.id AS profesor_id,
                u.id AS usuario_id,
                p.codigo_docente,
                u.nombres,
                u.apellidos,
                u.dni,
                u.email,
                u.telefono,
                u.direccion,
                u.url_foto,
                p.fecha_registro AS miembro_desde
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [Number(profesor_id)]);

        if (!datosBasicos || datosBasicos.length === 0) {
            return res.status(404).json({ message: "No se encontró el perfil del docente especificado." });
        }

        // 2. Jalamos el array elástico de grados académicos (1 a N) con su PDF de sustento
        const [gradosAcademicos] = await db.query(`
            SELECT id, nivel_grado, nombre_mencion, institucion_emisora, ano_graduacion, url_adjunto_pdf
            FROM profesor_grados
            WHERE profesor_id = ?
            ORDER BY nivel_grado DESC
        `, [Number(profesor_id)]);

        // 3. Jalamos el array elástico de su trayectoria laboral (1 a N) con su PDF de sustento
        const [experienciaLaboral] = await db.query(`
            SELECT id, institucion_empresa, cargo_ocupado, fecha_inicio, fecha_fin, url_adjunto_pdf
            FROM profesor_experiencia
            WHERE profesor_id = ?
            ORDER BY fecha_inicio DESC
        `, [Number(profesor_id)]);

        // Despachamos el paquete estructurado al Frontend
        return res.status(200).json({
            datos_personales: datosBasicos[0],
            estudios_grados: gradosAcademicos,
            estudios_experiencia: experienciaLaboral
        });

    } catch (error) {
        console.error("🚨 Error crítico al compilar el perfil docente:", error);
        return res.status(500).json({ error: error.message });
    }
};


// 📸 A) SUBIR O EDITAR FOTO DE PERFIL (Actualiza el string en 'usuarios')
exports.actualizarFotoPerfilDocente = async (req, res) => {
    const { usuario_id } = req.body; // Recibimos el ID de usuario ligado

    console.log(`-> [AIVEN.IO] Procesando carga de avatar para Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El ID de usuario es obligatorio." });
    }

    if (!req.file) {
        return res.status(400).json({ message: "No se ha adjuntado ninguna imagen binaria." });
    }

    try {
        // Estructuramos la ruta relativa lícita para guardar en la base de datos
        const nuevaUrlFoto = `/uploads/perfiles/${req.file.filename}`;

        // 🔍 AUDITORÍA DE LIMPIEZA: Buscamos si el usuario ya tenía una foto vieja para borrarla del disco
        const [usuarioInfo] = await db.query('SELECT url_foto FROM usuarios WHERE id = ?', [Number(usuario_id)]);
        if (usuarioInfo.length > 0 && usuarioInfo[0].url_foto) {
            const rutaFotoVieja = path.join(__dirname, '..', usuarioInfo[0].url_foto);
            if (fs.existsSync(rutaFotoVieja)) {
                fs.unlinkSync(rutaFotoVieja); // Extinguimos el archivo antiguo del disco duro
                console.log(`-> [SISTEMA] Foto anterior eliminada físicamente: ${rutaFotoVieja}`);
            }
        }

        // 🛠️ UPDATE DIRECTO: Asentamos la nueva URL de la imagen en tu tabla usuarios
        await db.query('UPDATE usuarios SET url_foto = ? WHERE id = ?', [nuevaUrlFoto, Number(usuario_id)]);

        return res.status(200).json({
            message: "¡Fotografía de perfil actualizada con éxito!",
            url_foto: nuevaUrlFoto
        });

    } catch (error) {
        console.error("🚨 Error crítico al guardar la foto de perfil:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 🗑️ B) ELIMINAR FOTO DE PERFIL (Devuelve la celda a NULL de forma limpia)
exports.eliminarFotoPerfilDocente = async (req, res) => {
    const { usuario_id } = req.body;

    console.log(`-> [AIVEN.IO] Solicitud de borrado de avatar para Usuario ID: ${usuario_id}`);

    if (!usuario_id) {
        return res.status(400).json({ message: "El ID de usuario es obligatorio." });
    }

    try {
        // 1. Buscamos el registro string en la base de datos
        const [usuarioInfo] = await db.query('SELECT url_foto FROM usuarios WHERE id = ?', [Number(usuario_id)]);

        if (usuarioInfo.length > 0 && usuarioInfo[0].url_foto) {
            const rutaArchivo = path.join(__dirname, '..', usuarioInfo[0].url_foto);

            // 2. Si el archivo físico existe en la carpeta del servidor, lo borramos
            if (fs.existsSync(rutaArchivo)) {
                fs.unlinkSync(rutaArchivo);
            }

            // 3. Reseteamos la celda de la base de datos a NULL de forma impecable
            await db.query('UPDATE usuarios SET url_foto = NULL WHERE id = ?', [Number(usuario_id)]);

            return res.status(200).json({ message: "La fotografía fue eliminada correctamente del repositorio institucional." });
        }

        return res.status(404).json({ message: "El usuario no registra ninguna foto de perfil activa." });

    } catch (error) {
        console.error("🚨 Error al eliminar la foto del servidor:", error);
        return res.status(500).json({ error: error.message });
    }
};


// 🎓 A) AÑADIR NUEVO GRADO ACADÉMICO CON ADJUNTO PDF
exports.crearGradoAcademico = async (req, res) => {
    const { profesor_id, nivel_grado, nombre_mencion, institucion_emisora, ano_graduacion } = req.body;

    console.log(`-> [AIVEN.IO] Insertando Grado Academico para Profesor ID: ${profesor_id}`);

    if (!profesor_id || !nivel_grado || !nombre_mencion || !institucion_emisora || !ano_graduacion) {
        return res.status(400).json({ message: "Todos los campos del formulario son estrictamente obligatorios." });
    }

    try {
        // Si el docente adjunto un archivo, guardamos la ruta string; de lo contrario queda null
        const url_adjunto_pdf = req.file ? `/uploads/grados/${req.file.filename}` : null;

        await db.query(`
            INSERT INTO profesor_grados (profesor_id, nivel_grado, nombre_mencion, institucion_emisora, ano_graduacion, url_adjunto_pdf)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [Number(profesor_id), nivel_grado, nombre_mencion, institucion_emisora, Number(ano_graduacion), url_adjunto_pdf]);

        return res.status(201).json({ message: "Grado academico registrado exitosamente en el legajo docente." });

    } catch (error) {
        console.error("🚨 Error en crearGradoAcademico:", error);
        return res.status(500).json({ error: error.message });
    }
};

// 💼 B) AÑADIR NUEVA EXPERIENCIA LABORAL CON ADJUNTO PDF
exports.crearExperienciaLaboral = async (req, res) => {
    const { profesor_id, institucion_empresa, cargo_ocupado, fecha_inicio, fecha_fin } = req.body;

    console.log(`-> [AIVEN.IO] Insertando Trayectoria Laboral para Profesor ID: ${profesor_id}`);

    if (!profesor_id || !institucion_empresa || !cargo_ocupado || !fecha_inicio) {
        return res.status(400).json({ message: "Faltan parametros obligatorios para registrar la experiencia." });
    }

    try {
        const url_adjunto_pdf = req.file ? `/uploads/experiencias/${req.file.filename}` : null;

        // Controlamos que si la fecha_fin viene vacia desde React viaje como NULL legitimo a MySQL
        const fFin = fecha_fin && fecha_fin !== '' ? fecha_fin : null;

        await db.query(`
            INSERT INTO profesor_experiencia (profesor_id, institucion_empresa, cargo_ocupado, fecha_inicio, fecha_fin, url_adjunto_pdf)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [Number(profesor_id), institucion_empresa, cargo_ocupado, fecha_inicio, fFin, url_adjunto_pdf]);

        return res.status(201).json({ message: "Trayectoria laboral añadida correctamente al historial del docente." });

    } catch (error) {
        console.error("🚨 Error en crearExperienciaLaboral:", error);
        return res.status(500).json({ error: error.message });
    }
};



// =========================================================================
// 🎓 CONTROLADORES PARA GRADOS ACADÉMICOS (EDICIÓN Y ELIMINACIÓN)
// =========================================================================

// 1. EDITAR GRADO ACADÉMICO (PUT)
exports.actualizarGradoAcademico = async (req, res) => {
    const { id } = req.params; // ID del registro a modificar
    const { nivel_grado, nombre_mencion, institucion_emisora, ano_graduacion } = req.body;

    console.log(`-> [AIVEN.IO] Actualizando Grado Academico ID: ${id}`);

    try {
        // Buscamos si el registro tiene un PDF previo guardado
        const [gradoInfo] = await db.query('SELECT url_adjunto_pdf FROM profesor_grados WHERE id = ?', [Number(id)]);
        if (gradoInfo.length === 0) {
            return res.status(404).json({ message: "El registro de grado no existe." });
        }

        let url_adjunto_pdf = gradoInfo[0].url_adjunto_pdf;

        // Si el docente subio un archivo nuevo, borramos el anterior del disco
        if (req.file) {
            if (url_adjunto_pdf) {
                const rutaVieja = path.join(__dirname, '..', url_adjunto_pdf);
                if (fs.existsSync(rutaVieja)) fs.unlinkSync(rutaVieja);
            }
            url_adjunto_pdf = `/uploads/grados/${req.file.filename}`;
        }

        await db.query(`
            UPDATE profesor_grados 
            SET nivel_grado = ?, nombre_mencion = ?, institucion_emisora = ?, ano_graduacion = ?, url_adjunto_pdf = ?
            WHERE id = ?
        `, [nivel_grado, nombre_mencion, institucion_emisora, Number(ano_graduacion), url_adjunto_pdf, Number(id)]);

        return res.status(200).json({ message: "Grado academico actualizado correctamente." });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// 2. ELIMINAR GRADO ACADÉMICO (DELETE)
exports.eliminarGradoAcademico = async (req, res) => {
    const { id } = req.params;
    console.log(`-> [AIVEN.IO] Petición de eliminación para Grado ID: ${id}`);

    try {
        const [gradoInfo] = await db.query('SELECT url_adjunto_pdf FROM profesor_grados WHERE id = ?', [Number(id)]);
        if (gradoInfo.length === 0) {
            return res.status(404).json({ message: "El registro no existe en la base de datos." });
        }

        const urlPdf = gradoInfo[0]?.url_adjunto_pdf; // Reparación de lectura de fila indexada

        if (urlPdf && urlPdf !== '') {
            const rutaArchivo = path.join(__dirname, '..', urlPdf);

            // 🛡️ CANDADO MASTER: Solo borra del disco duro si el archivo REALMENTE existe físicamente
            if (fs.existsSync(rutaArchivo)) {
                fs.unlinkSync(rutaArchivo);
                console.log(`-> [SISTEMA] Archivo PDF borrado con éxito: ${rutaArchivo}`);
            } else {
                console.log(`-> [AVISO] El PDF no existe físicamente en el disco, procediendo solo a borrar la fila de MySQL.`);
            }
        }

        // Ejecuta el borrado por hardware en la nube de Aiven.io sin bloqueos
        await db.query('DELETE FROM profesor_grados WHERE id = ?', [Number(id)]);
        return res.status(200).json({ message: "Grado académico removido del legajo de forma definitiva." });

    } catch (error) {
        console.error("🚨 Error crítico interno en la aduana de eliminación:", error);
        return res.status(500).json({ error: error.message });
    }
};

// =========================================================================
// 💼 CONTROLADORES PARA EXPERIENCIA LABORAL (EDICIÓN Y ELIMINACIÓN)
// =========================================================================

// 3. EDITAR EXPERIENCIA LABORAL (PUT)
exports.actualizarExperienciaLaboral = async (req, res) => {
    const { id } = req.params;
    const { institucion_empresa, cargo_ocupado, fecha_inicio, fecha_fin } = req.body;

    console.log(`-> [AIVEN.IO] Actualizando Trayectoria Laboral ID: ${id}`);

    try {
        const [expInfo] = await db.query('SELECT url_adjunto_pdf FROM profesor_experiencia WHERE id = ?', [Number(id)]);
        if (expInfo.length === 0) return res.status(404).json({ message: "La experiencia no existe." });

        let url_adjunto_pdf = expInfo[0].url_adjunto_pdf;
        if (req.file) {
            if (url_adjunto_pdf) {
                const rutaVieja = path.join(__dirname, '..', url_adjunto_pdf);
                if (fs.existsSync(rutaVieja)) fs.unlinkSync(rutaVieja);
            }
            url_adjunto_pdf = `/uploads/experiencias/${req.file.filename}`;
        }

        const fFin = fecha_fin && fecha_fin !== '' ? fecha_fin : null;

        await db.query(`
            UPDATE profesor_experiencia 
            SET institucion_empresa = ?, cargo_ocupado = ?, fecha_inicio = ?, fecha_fin = ?, url_adjunto_pdf = ?
            WHERE id = ?
        `, [institucion_empresa, cargo_ocupado, fecha_inicio, fFin, url_adjunto_pdf, Number(id)]);

        return res.status(200).json({ message: "Trayectoria laboral actualizada correctamente." });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// 4. ELIMINAR EXPERIENCIA LABORAL (DELETE)
exports.eliminarExperienciaLaboral = async (req, res) => {
    const { id } = req.params;
    console.log(`-> [AIVEN.IO] Peticion de eliminacion para Experiencia ID: ${id}`);

    try {
        // 1. Buscamos si el registro existe y capturamos su columna de PDF
        const [expInfo] = await db.query('SELECT url_adjunto_pdf FROM profesor_experiencia WHERE id = ?', [Number(id)]);
        if (expInfo.length === 0) {
            return res.status(404).json({ message: "El registro de trayectoria laboral no existe." });
        }

        // Extraemos de forma segura la celda indexada de la primera fila
        const urlPdf = expInfo[0]?.url_adjunto_pdf;

        if (urlPdf && urlPdf !== '') {
            const rutaArchivo = path.join(__dirname, '..', urlPdf);

            // 🛡️ CANDADO MASTER: Solo intenta borrar fisicamente del disco si el archivo REALMENTE existe
            if (fs.existsSync(rutaArchivo)) {
                fs.unlinkSync(rutaArchivo);
                console.log(`-> [SISTEMA] Archivo PDF de experiencia borrado con exito: ${rutaArchivo}`);
            } else {
                console.log(`-> [AVISO] El PDF de la experiencia no existe en el disco, procediendo solo a borrar la fila de MySQL.`);
            }
        }

        // 2. Ejecutamos el borrado directo por hardware en la nube de Aiven.io
        await db.query('DELETE FROM profesor_experiencia WHERE id = ?', [Number(id)]);

        return res.status(200).json({ message: "Trayectoria laboral eliminada del historial del docente de forma definitiva." });

    } catch (error) {
        console.error("🚨 Error critico interno en eliminarExperienciaLaboral:", error);
        return res.status(500).json({ error: error.message });
    }
};