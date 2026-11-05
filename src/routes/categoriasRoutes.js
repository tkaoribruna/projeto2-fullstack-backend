const { Router } = require('express');
const router = Router();
const categoriasController = require('../controllers/categoriasController');
const authMiddleware = require('../middlewares/auth'); // Middleware que injeta req.usuarioId

router.use(authMiddleware);

router.get('/', categoriasController.listar);
router.post('/', categoriasController.criar);
router.put('/:id', categoriasController.atualizar);
router.delete('/:id', categoriasController.deletar);

module.exports = router;
