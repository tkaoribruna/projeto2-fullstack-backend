//server.js

require('dotenv/config');
const express = require('express');
const cors = require('cors');

const categoriasRoutes = require('./routes/categoriasRoutes');
const fontes_destinosRoutes = require('./routes/fontes_destinosRoutes');
const { rotaNaoEncontrada, tratarErros } = require('./middlewares/tratamentodeerros');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.warn('Atenção: JWT_SECRET não definido no .env — rotas protegidas retornarão erro.');
}

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json({
        mensagem: 'API de controle financeiro funcionando!',
    });
});

app.use('/api/categorias', categoriasRoutes);
app.use('/api/fontes-destinos', fontes_destinosRoutes);

app.use(rotaNaoEncontrada);
app.use(tratarErros);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor disponível em http://localhost:${port}`);
    });
}

module.exports = app;
