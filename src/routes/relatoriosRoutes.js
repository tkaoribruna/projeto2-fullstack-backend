
const express = require('express');
const router = express.Router();
const pool = require('../database');
const authMiddleware = require('../middlewares/auth');

function dataValidaISO(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function periodoValido(inicio, fim) {
  return dataValidaISO(inicio) && dataValidaISO(fim) && inicio <= fim;
}

// GET - Relatório por categoria
router.get('/categorias', authMiddleware, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;
    const usuarioId = req.usuarioId;

    if (!periodoValido(inicio, fim)) {
      return res.status(400).json({
        erro: 'Informe inicio e fim válidos (YYYY-MM-DD).'
      });
    }

    const inicioData = new Date(`${inicio}T00:00:00Z`);
    const fimData = new Date(`${fim}T00:00:00Z`);
    const duracaoDias = Math.round((fimData - inicioData) / 86400000) + 1;

    const fimAnterior = new Date(inicioData.getTime() - 86400000);
    const inicioAnterior = new Date(
      fimAnterior.getTime() - (duracaoDias - 1) * 86400000
    );

    const inicioAnteriorStr = inicioAnterior.toISOString().slice(0, 10);
    const fimAnteriorStr = fimAnterior.toISOString().slice(0, 10);

    const querySaidas = `
      SELECT c.id, c.nome,
        COALESCE(SUM(CASE WHEN l.data BETWEEN $2 AND $3
          THEN l.valor ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN l.data BETWEEN $4 AND $5
          THEN l.valor ELSE 0 END), 0) AS periodo_anterior
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1 AND l.tipo = 'saida'
        AND (l.data BETWEEN $2 AND $3 OR l.data BETWEEN $4 AND $5)
      GROUP BY c.id, c.nome
      HAVING SUM(CASE WHEN l.data BETWEEN $2 AND $3
        THEN l.valor ELSE 0 END) > 0
      ORDER BY total DESC
    `;

    const queryEntradas = `
      SELECT c.id, c.nome, SUM(l.valor) AS total
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1 AND l.tipo = 'entrada'
        AND l.data BETWEEN $2 AND $3
      GROUP BY c.id, c.nome
      ORDER BY total DESC
    `;

    const [resSaidas, resEntradas] = await Promise.all([
      pool.query(querySaidas, [
        usuarioId, inicio, fim, inicioAnteriorStr, fimAnteriorStr
      ]),
      pool.query(queryEntradas, [usuarioId, inicio, fim])
    ]);

    const totalSaidas = resSaidas.rows.reduce(
      (acc, row) => acc + Number(row.total), 0
    );
    const totalEntradas = resEntradas.rows.reduce(
      (acc, row) => acc + Number(row.total), 0
    );

    const categorias = resSaidas.rows.map(row => {
      const total = Number(row.total);
      const periodoAnterior = Number(row.periodo_anterior);
      const diferenca = Number((total - periodoAnterior).toFixed(2));

      return {
        id: row.id,
        nome: row.nome,
        total,
        percentual: totalSaidas > 0
          ? Number((total / totalSaidas * 100).toFixed(2))
          : 0,
        periodoAnterior,
        diferenca,
        tendencia: diferenca > 0 ? 'aumento'
          : diferenca < 0 ? 'reducao' : 'estavel'
      };
    });

    return res.json({
      periodo: { inicio, fim },
      periodoAnterior: {
        inicio: inicioAnteriorStr,
        fim: fimAnteriorStr
      },
      totalSaidas: Number(totalSaidas.toFixed(2)),
      totalEntradas: Number(totalEntradas.toFixed(2)),
      categorias,
      entradasPorCategoria: resEntradas.rows.map(row => ({
        id: row.id,
        nome: row.nome,
        total: Number(row.total)
      }))
    });
  } catch (erro) {
    next(erro);
  }
});

// GET - Relatório por fonte/destino
router.get('/fontes-destinos', authMiddleware, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;

    if (!periodoValido(inicio, fim)) {
      return res.status(400).json({
        erro: 'Informe inicio e fim válidos (YYYY-MM-DD).'
      });
    }

    const { rows } = await pool.query(`
      SELECT f.id, f.nome, f.tipo,
        COALESCE(SUM(CASE WHEN l.tipo = 'entrada'
          THEN l.valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN l.tipo = 'saida'
          THEN l.valor ELSE 0 END), 0) AS saidas
      FROM fontes_destinos f
      LEFT JOIN lancamentos l
        ON l.fonte_destino_id = f.id
        AND l.usuario_id = $1
        AND l.data BETWEEN $2 AND $3
      WHERE f.usuario_id = $1
      GROUP BY f.id, f.nome, f.tipo
      ORDER BY f.nome
    `, [req.usuarioId, inicio, fim]);

    return res.json({
      periodo: { inicio, fim },
      fontesDestinos: rows.map(row => ({
        id: row.id,
        nome: row.nome,
        tipo: row.tipo,
        entradas: Number(row.entradas),
        saidas: Number(row.saidas),
        saldo: Number((
          Number(row.entradas) - Number(row.saidas)
        ).toFixed(2))
      }))
    });
  } catch (erro) {
    next(erro);
  }
});

// GET - Previsão das faturas dos cartões de crédito
router.get('/faturas', authMiddleware, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;

    if (!periodoValido(inicio, fim)) {
      return res.status(400).json({
        erro: 'Informe inicio e fim válidos (YYYY-MM-DD).'
      });
    }

    const { rows } = await pool.query(`
      SELECT f.id, f.nome, f.dia_fechamento, f.dia_vencimento,
        l.id AS lancamento_id, l.descricao, l.valor,
        l.data::text AS data
      FROM fontes_destinos f
      JOIN lancamentos l ON l.fonte_destino_id = f.id
      WHERE f.usuario_id = $1
        AND l.usuario_id = $1
        AND f.tipo = 'cartao_credito'
        AND l.tipo = 'saida'
      ORDER BY f.id, l.data, l.id
    `, [req.usuarioId]);

    const faturas = new Map();

    for (const row of rows) {
      const [ano, mes, dia] = row.data.split('-').map(Number);

      const ciclo = new Date(Date.UTC(
        ano,
        mes - 1 + (dia > row.dia_fechamento ? 1 : 0),
        1
      ));

      const vencimento = new Date(Date.UTC(
        ciclo.getUTCFullYear(),
        ciclo.getUTCMonth(),
        1
      ));

      if (row.dia_vencimento <= row.dia_fechamento) {
        vencimento.setUTCMonth(vencimento.getUTCMonth() + 1);
      }

      const ultimoDia = new Date(Date.UTC(
        vencimento.getUTCFullYear(),
        vencimento.getUTCMonth() + 1,
        0
      )).getUTCDate();

      vencimento.setUTCDate(
        Math.min(row.dia_vencimento, ultimoDia)
      );

      const dataVencimento = vencimento.toISOString().slice(0, 10);

      if (dataVencimento < inicio || dataVencimento > fim) {
        continue;
      }

      const chave = `${row.id}:${dataVencimento}`;

      if (!faturas.has(chave)) {
        faturas.set(chave, {
          cartaoId: row.id,
          cartao: row.nome,
          vencimento: dataVencimento,
          total: 0,
          lancamentos: []
        });
      }

      const fatura = faturas.get(chave);

      fatura.total = Number((
        fatura.total + Number(row.valor)
      ).toFixed(2));

      fatura.lancamentos.push({
        id: row.lancamento_id,
        descricao: row.descricao,
        valor: Number(row.valor),
        data: row.data
      });
    }

    return res.json({
      periodo: { inicio, fim },
      faturas: [...faturas.values()].sort(
        (a, b) => a.vencimento.localeCompare(b.vencimento)
          || a.cartaoId - b.cartaoId
      )
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
