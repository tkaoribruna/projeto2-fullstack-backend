//authRoutes.js => cria um objeto roteador e registra rotas neste roteador

const {Router} = require('express');
const { cadastrar, login} = require('../routes/authController');
const router = Router();

router.post('/cadastro', cadastrar);
router.post('/login', login);

module.exports = router;
