const { Router } = require('express');
const db = require('../database');
const autenticar = require('../middlewares/auth');

const router = Router();
router.use(autenticar);

const COLUNAS = 'id, nome, tipo, dia_fechamento, dia_vencimento, limite';

const paraApi = (l) => ({
  id: l.id,
  nome: l.nome,
  tipo: l.tipo,
  diaFechamento: l.dia_fechamento,
  diaVencimento: l.dia_vencimento,
  limite: l.limite === null ? null : Number(l.limite),
});

async function listar(usuarioId) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM fontes_destinos WHERE usuario_id = $1 ORDER BY nome`,
    [usuarioId]
  );
  return rows.map(paraApi);
}

async function buscarPorId(id, usuarioId) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM fontes_destinos WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );
  return rows[0] ? paraApi(rows[0]) : null;
}

async function criar(usuarioId, d) {
  const { rows } = await db.query(
    `INSERT INTO fontes_destinos (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUNAS}`,
    [usuarioId, d.nome, d.tipo, d.diaFechamento, d.diaVencimento, d.limite]
  );
  return paraApi(rows[0]);
}

async function atualizar(id, usuarioId, d) {
  const { rows } = await db.query(
    `UPDATE fontes_destinos
        SET nome = $3, tipo = $4, dia_fechamento = $5, dia_vencimento = $6, limite = $7
      WHERE id = $1 AND usuario_id = $2
      RETURNING ${COLUNAS}`,
    [id, usuarioId, d.nome, d.tipo, d.diaFechamento, d.diaVencimento, d.limite]
  );
  return rows[0] ? paraApi(rows[0]) : null;
}

async function possuiLancamentos(id, usuarioId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM lancamentos WHERE fonte_destino_id = $1 AND usuario_id = $2
     ) AS existe`,
    [id, usuarioId]
  );
  return rows[0].existe;
}

async function excluir(id, usuarioId) {
  const { rowCount } = await db.query(
    'DELETE FROM fontes_destinos WHERE id = $1 AND usuario_id = $2',
    [id, usuarioId]
  );
  return rowCount > 0;
}

const TIPOS = ['renda', 'conta', 'cartao_credito'];

const diaValido = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

function validarFonteDestino(req, res, next) {
  const { nome, tipo, diaFechamento, diaVencimento, limite } = req.body ?? {};
  const campos = {};

  const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
  if (!nomeLimpo) campos.nome = 'O nome é obrigatório.';
  else if (nomeLimpo.length > 60) campos.nome = 'O nome deve ter no máximo 60 caracteres.';

  if (!TIPOS.includes(tipo)) campos.tipo = 'O tipo deve ser renda, conta ou cartao_credito.';

  const dados = { nome: nomeLimpo, tipo, diaFechamento: null, diaVencimento: null, limite: null };

  if (tipo === 'cartao_credito') {
    dados.diaFechamento = diaValido(diaFechamento);
    if (dados.diaFechamento === null) campos.diaFechamento = 'Informe o dia de fechamento (1 a 31).';

    dados.diaVencimento = diaValido(diaVencimento);
    if (dados.diaVencimento === null) campos.diaVencimento = 'Informe o dia de vencimento (1 a 31).';

    const lim = Number(String(limite ?? '').replace(',', '.'));
    if (limite === undefined || limite === null || limite === '' || !Number.isFinite(lim) || lim <= 0) {
      campos.limite = 'Informe o limite do cartão (maior que zero).';
    } else if (lim >= 1e10) {
      campos.limite = 'Limite fora do intervalo permitido.';
    } else {
      dados.limite = Math.round(lim * 100) / 100;
    }
  }
  if (Object.keys(campos).length > 0) {
    return res.status(400).json({ erro: 'Dados inválidos.', campos });
  }
  req.dados = dados;
  return next();
}

const lerId = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const naoEncontrado = (res) => res.status(404).json({ erro: 'Fonte/destino não encontrada.' });

const duplicado = (res) =>
  res.status(409).json({
    erro: 'Fonte/destino já cadastrada.',
    campos: { nome: 'Já existe uma fonte/destino com este nome.' },
  });

router.get('/', async (req, res, next) => {
  try {
    res.json(await listar(req.usuarioId));
  } catch (erro) {
    next(erro);
  }
});

router.post('/', validarFonteDestino, async (req, res, next) => {
  try {
    return res.status(201).json(await criar(req.usuarioId, req.dados));
  } catch (erro) {
    if (erro.code === '23505') return duplicado(res);
    return next(erro);
  }
});

router.put('/:id', validarFonteDestino, async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrado(res);
  try {
    const atualizada = await atualizar(id, req.usuarioId, req.dados);
    if (!atualizada) return naoEncontrado(res);
    return res.json(atualizada);
  } catch (erro) {
    if (erro.code === '23505') return duplicado(res);
    return next(erro);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrado(res);

  const vinculo = {
    erro: 'Não é possível excluir: existem lançamentos vinculados a esta fonte/destino.',
  };

  try {
    if (!(await buscarPorId(id, req.usuarioId))) return naoEncontrado(res);
    if (await possuiLancamentos(id, req.usuarioId)) return res.status(409).json(vinculo);

    await excluir(id, req.usuarioId);
    return res.status(204).send();
  } catch (erro) {
    if (erro.code === '23503') return res.status(409).json(vinculo);
    return next(erro);
  }
});

module.exports = router;
