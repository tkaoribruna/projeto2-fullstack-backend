//server.js

require('dotenv/config');
const express = require('express');
const cors = require('cors');

const categoriasRoutes = require('./routes/categoriasRoutes');
const fontes_destinosRoutes = require('./routes/fontes_destinosRoutes');
const { rotaNaoEncontrada, tratarErros } = require('./middlewares/tratamentodeerros');
const authRoutes = require('./routes/authRoutes');


const app = express();
const port = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.warn('Atenção: JWT_SECRET não definido no .env — rotas protegidas retornarão erro.');
}

//Somente para este trabalho o CORS deve ficar configurado como global a pedido da professora
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json({
        mensagem: 'API de controle financeiro funcionando!',
    });
});

app.use('/api/categorias', categoriasRoutes);
app.use('/api/fontes-destinos', fontes_destinosRoutes);

app.use('/api/auth', authRoutes);

app.use(rotaNaoEncontrada);
app.use(tratarErros);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor disponível em http://localhost:${port}`);
    });
}

module.exports = app;
