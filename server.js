const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const matriculaRoutes = require('./routes/matriculaRoutes');
const notaRoutes = require('./routes/notaRoutes');
const estudianteRoutes = require('./routes/estudianteRoutes');
const cursoRoutes = require('./routes/cursoRoutes');
const entregaRoutes = require('./routes/entregaRoutes');
const profesorRoutes = require('./routes/profesorRoutes');
const horarioRoutes = require('./routes/horarioRoutes'); 


dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); // Permite leer JSON en las peticiones

// Rutas de la API
app.use('/api/matriculas', matriculaRoutes);
app.use('/api/notas', notaRoutes);
app.use('/api/estudiantes', estudianteRoutes);
app.use('/api/cursos', cursoRoutes);

app.use('/uploads', express.static('uploads'));

app.use('/api/entregas', entregaRoutes);

app.use('/uploads/entregas', express.static(path.join(__dirname, 'uploads/entregas')));

app.use('/api/profesores', profesorRoutes);

app.use('/api/horarios', horarioRoutes); 

// Ruta de prueba local
app.get('/', (req, res) => {
    res.json({ mensaje: "¡El backend del instituto está vivo y funcionando localmente!" });
});


// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
