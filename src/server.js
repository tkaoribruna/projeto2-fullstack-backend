//server.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));

app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json({
        mensagem: 'API de controle financeiro funcionando!',
    });
});

app.listen(port, () => {
    console.log(`Servidor disponível em http://localhost:${port}`);
});
