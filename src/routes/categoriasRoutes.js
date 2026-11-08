const { Router } = require('express');
const db = require('../database');
const autenticar = require('../middlewares/auth');

const router = Router();
router.use(autenticar);

const COLUNAS = 'id, nome, tipo';

async function listar(usuarioId) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM categorias WHERE usuario_id = $1 ORDER BY nome ASC`,
    [usuarioId]
  );
  return rows;
}

async function buscarPorId(id, usuarioId) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM categorias WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );
  return rows[0] ?? null;
}

async function criar(usuarioId, d) {
  const { rows } = await db.query(
    `INSERT INTO categorias (usuario_id, nome, tipo)
     VALUES ($1, $2, $3) RETURNING ${COLUNAS}`,
    [usuarioId, d.nome, d.tipo]
  );
  return rows[0];
}

async function atualizar(id, usuarioId, d) {
  const { rows } = await db.query(
    `UPDATE categorias SET nome = $3, tipo = $4
      WHERE id = $1 AND usuario_id = $2
      RETURNING ${COLUNAS}`,
    [id, usuarioId, d.nome, d.tipo]
  );
  return rows[0] ?? null;
}

async function possuiLancamentos(id, usuarioId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM lancamentos WHERE categoria_id = $1 AND usuario_id = $2
     ) AS existe`,
    [id, usuarioId]
  );
  return rows[0].existe;
}

async function excluir(id, usuarioId) {
  const { rowCount } = await db.query(
    'DELETE FROM categorias WHERE id = $1 AND usuario_id = $2',
    [id, usuarioId]
  );
  return rowCount > 0;
}

const TIPOS = ['entrada', 'saida'];

function validarCategoria(req, res, next) {
  const { nome, tipo } = req.body ?? {};
  const campos = {};

  const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
  if (!nomeLimpo) campos.nome = 'O nome é obrigatório.';
  else if (nomeLimpo.length > 60) campos.nome = 'O nome deve ter no máximo 60 caracteres.';

  if (!TIPOS.includes(tipo)) campos.tipo = 'O tipo deve ser "entrada" ou "saida".';

  if (Object.keys(campos).length > 0) {
    return res.status(400).json({ erro: 'Dados inválidos.', campos });
  }
  req.dados = { nome: nomeLimpo, tipo };
  return next();
}

const lerId = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const naoEncontrada = (res) => res.status(404).json({ erro: 'Categoria não encontrada.' });

const duplicada = (res) =>
  res.status(409).json({
    erro: 'Categoria já cadastrada.',
    campos: { nome: 'Já existe uma categoria com este nome e tipo.' },
  });

const MSG_VINCULO =
  'Não é possível excluir: existem lançamentos associados a esta categoria.';

router.get('/', async (req, res, next) => {
  try {
    res.json(await listar(req.usuarioId));
  } catch (erro) {
    next(erro);
  }
});

router.post('/', validarCategoria, async (req, res, next) => {
  try {
    return res.status(201).json(await criar(req.usuarioId, req.dados));
  } catch (erro) {
    if (erro.code === '23505') return duplicada(res);
    return next(erro);
  }
});

router.put('/:id', validarCategoria, async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrada(res);

  try {
    const atual = await buscarPorId(id, req.usuarioId);
    if (!atual) return naoEncontrada(res);

    if (atual.tipo !== req.dados.tipo && (await possuiLancamentos(id, req.usuarioId))) {
      return res.status(409).json({
        erro: 'Não é possível alterar o tipo: existem lançamentos associados a esta categoria.',
        campos: { tipo: 'O tipo não pode ser alterado enquanto houver lançamentos associados.' },
      });
    }

    const atualizada = await atualizar(id, req.usuarioId, req.dados);
    return res.json(atualizada);
  } catch (erro) {
    if (erro.code === '23505') return duplicada(res);
    return next(erro);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrada(res);

  try {
    if (!(await buscarPorId(id, req.usuarioId))) return naoEncontrada(res);
    if (await possuiLancamentos(id, req.usuarioId)) {
      return res.status(409).json({ erro: MSG_VINCULO });
    }

    await excluir(id, req.usuarioId);
    return res.status(204).send();
  } catch (erro) {
    if (erro.code === '23503') return res.status(409).json({ erro: MSG_VINCULO });
    return next(erro);
  }
});

module.exports = router;
