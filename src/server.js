//server.js

require('dotenv/config');
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*', }));
    
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json({
        mensagem: 'API de controle financeiro funcionando!',
    });
});

app.listen(port, () => {
    console.log(`Servidor disponível em http://localhost:${port}`);
});
