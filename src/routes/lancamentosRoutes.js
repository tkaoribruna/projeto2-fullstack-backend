// lancamentosRoutes.js => Gerencia os lançamentos financeiros pela API.

const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../database');
const autenticar = require('../middlewares/auth');

const router = Router();
router.use(autenticar);

const COLUNAS = `
  id, tipo, descricao, valor, data, categoria_id,
  fonte_destino_id, parcela_atual, total_parcelas,
  grupo_parcelamento, criado_em
`;

function paraApi(l) {
  return {
    id: l.id,
    tipo: l.tipo,
    descricao: l.descricao,
    valor: Number(l.valor),
    data: l.data instanceof Date
      ? l.data.toISOString().slice(0, 10)
      : l.data,
    categoriaId: l.categoria_id,
    fonteDestinoId: l.fonte_destino_id,
    parcelaAtual: l.parcela_atual,
    totalParcelas: l.total_parcelas,
    grupoParcelamento: l.grupo_parcelamento,
    criadoEm: l.criado_em,
  };
}

function lerId(req) {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function naoEncontrado(res) {
  return res.status(404).json({
    erro: 'Lançamento não encontrado.',
  });
}

function dataValida(data) {
  if (typeof data !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }

  const d = new Date(`${data}T12:00:00Z`);

  return !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === data;
}

function adicionarMeses(data, meses) {
  const [ano, mes, dia] = data.split('-').map(Number);

  const primeiroDia = new Date(Date.UTC(
    ano, mes - 1 + meses, 1
  ));

  const anoDestino = primeiroDia.getUTCFullYear();
  const mesDestino = primeiroDia.getUTCMonth();

  const ultimoDia = new Date(Date.UTC(
    anoDestino, mesDestino + 1, 0
  )).getUTCDate();

  const resultado = new Date(Date.UTC(
    anoDestino, mesDestino, Math.min(dia, ultimoDia)
  ));

  return resultado.toISOString().slice(0, 10);
}

function validarLancamento(req, res, next) {
  const {
    tipo, descricao, valor, data,
    categoriaId, fonteDestinoId, totalParcelas = 1,
  } = req.body ?? {};

  const campos = {};

  const descricaoLimpa =
    typeof descricao === 'string' ? descricao.trim() : '';

  if (!['entrada', 'saida'].includes(tipo)) {
    campos.tipo = 'Informe entrada ou saida.';
  }

  if (!descricaoLimpa || descricaoLimpa.length > 120) {
    campos.descricao = 'Informe uma descrição de até 120 caracteres.';
  }

  const valorTexto = typeof valor === 'string'
    ? valor.replace(',', '.')
    : String(valor ?? '');

  const formatoValor = /^(?:\d+)(?:\.\d{1,2})?$/.test(valorTexto);
  const valorNumero = Number(valorTexto);
  const valorCentavos = Math.round(valorNumero * 100);

  if (!formatoValor ||
      !Number.isSafeInteger(valorCentavos) ||
      valorCentavos <= 0 ||
      valorNumero >= 1e10) {
    campos.valor = 'Informe um valor positivo com até duas casas decimais.';
  }

  if (!dataValida(data)) {
    campos.data = 'Informe uma data válida (AAAA-MM-DD).';
  }

  const categoriaNumero = Number(categoriaId);
  const fonteNumero = Number(fonteDestinoId);
  const parcelasNumero = Number(totalParcelas);

  if (!Number.isSafeInteger(categoriaNumero) ||
      categoriaNumero <= 0) {
    campos.categoriaId = 'Categoria inválida.';
  }

  if (!Number.isSafeInteger(fonteNumero) ||
      fonteNumero <= 0) {
    campos.fonteDestinoId = 'Fonte/destino inválida.';
  }

  if (!Number.isInteger(parcelasNumero) ||
      parcelasNumero < 1 ||
      parcelasNumero > 48) {
    campos.totalParcelas = 'Informe de 1 a 48 parcelas.';
  }

  if (Object.keys(campos).length) {
    return res.status(400).json({
      erro: 'Dados inválidos.',
      campos,
    });
  }

  req.dados = {
    tipo,
    descricao: descricaoLimpa,
    valorCentavos,
    data,
    categoriaId: categoriaNumero,
    fonteDestinoId: fonteNumero,
    totalParcelas: parcelasNumero,
  };

  return next();
}

async function validarVinculos(cliente, usuarioId, dados) {
  const { rows: categorias } = await cliente.query(
    `SELECT id FROM categorias
     WHERE id = $1 AND usuario_id = $2 AND tipo = $3`,
    [dados.categoriaId, usuarioId, dados.tipo]
  );

  const { rows: fontes } = await cliente.query(
    `SELECT id FROM fontes_destinos
     WHERE id = $1 AND usuario_id = $2`,
    [dados.fonteDestinoId, usuarioId]
  );

  const campos = {};

  if (!categorias.length) {
    campos.categoriaId = 'Categoria inexistente ou incompatível.';
  }

  if (!fontes.length) {
    campos.fonteDestinoId = 'Fonte/destino não encontrada.';
  }

  return campos;
}

function erroVinculos(res, campos) {
  return res.status(400).json({
    erro: 'Dados inválidos.',
    campos,
  });
}

// GET - Listar, filtrar e paginar lançamentos
router.get('/', async (req, res, next) => {
  try {
    const { inicio, fim, tipo, categoriaId, fonteDestinoId, pagina, limite } = req.query;
    const dataOk = (v) => typeof v === 'string' && dataValida(v);
    if ((inicio !== undefined && !dataOk(inicio)) ||
        (fim !== undefined && !dataOk(fim)) ||
        (inicio && fim && inicio > fim) ||
        (tipo !== undefined && !['entrada', 'saida'].includes(tipo))) {
      return res.status(400).json({ erro: 'Filtros inválidos.' });
    }

    const params = [req.usuarioId];
    const condicoes = ['usuario_id = $1'];

    function adicionar(coluna, valor) {
      params.push(valor);
      condicoes.push(`${coluna} = $${params.length}`);
    }

    if (tipo) adicionar('tipo', tipo);

    for (const [campo, coluna] of [['categoriaId', 'categoria_id'], ['fonteDestinoId', 'fonte_destino_id']]) {
      const valor = req.query[campo];
      if (valor !== undefined) {
        if (!/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor))) {
          return res.status(400).json({ erro: `${campo} inválido.` });
        }
        adicionar(coluna, Number(valor));
      }
    }

    if (inicio) {
      params.push(inicio);
      condicoes.push(`data >= $${params.length}`);
    }

    if (fim) {
      params.push(fim);
      condicoes.push(`data <= $${params.length}`);
    }

    const where = condicoes.join(' AND ');
    const paginar = pagina !== undefined || limite !== undefined;

    if (!paginar) {
      const { rows } = await db.query(
        `SELECT ${COLUNAS} FROM lancamentos WHERE ${where} ORDER BY data DESC, id DESC`,
        params
      );
      return res.json(rows.map(paraApi));
    }

    const numPagina = Number(pagina ?? 1);
    const numLimite = Number(limite ?? 20);

    if (!Number.isSafeInteger(numPagina) || numPagina < 1 ||
        !Number.isSafeInteger(numLimite) || numLimite < 1 || numLimite > 100 ||
        !Number.isSafeInteger((numPagina - 1) * numLimite)) {
      return res.status(400).json({
        erro: 'Paginação inválida (pagina >= 1; limite entre 1 e 100).',
      });
    }

    const { rows: contagem } = await db.query(
      `SELECT COUNT(*)::int AS total,
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0) AS saidas,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS saldo
       FROM lancamentos WHERE ${where}`,
      params
    );

    const offset = (numPagina - 1) * numLimite;
    const { rows } = await db.query(
      `SELECT ${COLUNAS} FROM lancamentos WHERE ${where}
       ORDER BY data DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, numLimite, offset]
    );

    const { total, entradas, saidas, saldo } = contagem[0];

    return res.json({
      lancamentos: rows.map(paraApi),
      paginacao: {
        pagina: numPagina,
        limite: numLimite,
        total,
        totalPaginas: Math.ceil(total / numLimite),
      },
      totais: {
        entradas: Number(entradas),
        saidas: Number(saidas),
        saldo: Number(saldo),
      },
    });
  } catch (erro) {
    return next(erro);
  }
});

// GET - Buscar lançamento por ID
router.get('/:id', async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrado(res);

  try {
    const { rows } = await db.query(
      `SELECT ${COLUNAS}
       FROM lancamentos
       WHERE id = $1 AND usuario_id = $2`,
      [id, req.usuarioId]
    );

    if (!rows.length) return naoEncontrado(res);

    return res.json(paraApi(rows[0]));
  } catch (erro) {
    return next(erro);
  }
});

// POST - Criar lançamento e parcelas
router.post('/', validarLancamento, async (req, res, next) => {
  const dados = req.dados;
  let cliente;

  try {
    cliente = await db.connect();
    await cliente.query('BEGIN');

    const campos = await validarVinculos(
      cliente, req.usuarioId, dados
    );

    if (Object.keys(campos).length) {
      await cliente.query('ROLLBACK');
      return erroVinculos(res, campos);
    }

    const total = dados.totalParcelas;

    if (dados.valorCentavos < total) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({
        erro: 'O valor deve permitir parcelas de pelo menos R$ 0,01.',
      });
    }

    const grupo = total > 1 ? randomUUID() : null;
    const valorBase = Math.floor(dados.valorCentavos / total);
    const resto = dados.valorCentavos % total;

    const lancamentos = [];

    for (let i = 0; i < total; i++) {
      const centavos = valorBase + (i < resto ? 1 : 0);
      const valorParcela = (centavos / 100).toFixed(2);
      const dataParcela = adicionarMeses(dados.data, i);

      const { rows } = await cliente.query(
        `INSERT INTO lancamentos
          (usuario_id, tipo, descricao, valor, data,
           categoria_id, fonte_destino_id, parcela_atual,
           total_parcelas, grupo_parcelamento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${COLUNAS}`,
        [
          req.usuarioId,
          dados.tipo,
          dados.descricao,
          valorParcela,
          dataParcela,
          dados.categoriaId,
          dados.fonteDestinoId,
          i + 1,
          total,
          grupo,
        ]
      );

      lancamentos.push(paraApi(rows[0]));
    }

    await cliente.query('COMMIT');

    return res.status(201).json({
      mensagem: 'Lançamento cadastrado com sucesso.',
      lancamentos,
    });
  } catch (erro) {
    if (cliente) {
      try {
        await cliente.query('ROLLBACK');
      } catch (_) {}
    }
    return next(erro);
  } finally {
    if (cliente) cliente.release();
  }
});

// PUT - Atualizar um lançamento individual
router.put('/:id', validarLancamento, async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrado(res);

  const dados = req.dados;

  if (dados.totalParcelas !== 1) {
    return res.status(400).json({
      erro: 'Não é possível alterar o parcelamento pelo PUT.',
    });
  }

  let cliente;

  try {
    cliente = await db.connect();
    await cliente.query('BEGIN');

    const { rows: existentes } = await cliente.query(
      `SELECT id FROM lancamentos
       WHERE id = $1 AND usuario_id = $2
       FOR UPDATE`,
      [id, req.usuarioId]
    );

    if (!existentes.length) {
      await cliente.query('ROLLBACK');
      return naoEncontrado(res);
    }

    const campos = await validarVinculos(
      cliente, req.usuarioId, dados
    );

    if (Object.keys(campos).length) {
      await cliente.query('ROLLBACK');
      return erroVinculos(res, campos);
    }

    const { rows } = await cliente.query(
      `UPDATE lancamentos
       SET tipo = $3,
           descricao = $4,
           valor = $5,
           data = $6,
           categoria_id = $7,
           fonte_destino_id = $8
       WHERE id = $1 AND usuario_id = $2
       RETURNING ${COLUNAS}`,
      [
        id,
        req.usuarioId,
        dados.tipo,
        dados.descricao,
        (dados.valorCentavos / 100).toFixed(2),
        dados.data,
        dados.categoriaId,
        dados.fonteDestinoId,
      ]
    );

    await cliente.query('COMMIT');
    return res.json(paraApi(rows[0]));
  } catch (erro) {
    if (cliente) {
      try {
        await cliente.query('ROLLBACK');
      } catch (_) {}
    }
    return next(erro);
  } finally {
    if (cliente) cliente.release();
  }
});

// DELETE - Excluir um lançamento ou todas as parcelas da compra
router.delete('/:id', async (req, res, next) => {
  const id = lerId(req);
  if (!id) return naoEncontrado(res);

  const excluirTodas = req.query.escopo === 'todas';

  try {
    const { rowCount } = await db.query(
      `DELETE FROM lancamentos AS alvo
       USING lancamentos AS selecionado
       WHERE selecionado.id = $1
         AND selecionado.usuario_id = $2
         AND alvo.usuario_id = $2
         AND (
           alvo.id = selecionado.id
           OR (
             $3::boolean
             AND alvo.grupo_parcelamento = selecionado.grupo_parcelamento
           )
         )`,
      [id, req.usuarioId, excluirTodas]
    );

    if (!rowCount) return naoEncontrado(res);

    return res.status(204).send();
  } catch (erro) {
    return next(erro);
  }
});

module.exports = router;