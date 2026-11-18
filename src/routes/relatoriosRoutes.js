// relatoriosRoutes.js => Gera os relatórios e a previsão de faturas.

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

// mes começa em zero. O Date também ajusta a virada de ano.
function dataNoMes(ano, mes, dia) {
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)))
    .toISOString()
    .slice(0, 10);
}

function mesDaFatura(data, diaFechamento) {
  const [ano, numeroMes, dia] = data.split('-').map(Number);
  const mes = numeroMes - 1;
  const fechamento = Number(dataNoMes(ano, mes, diaFechamento).slice(-2));

  return {
    ano,
    mes: mes + (dia >= fechamento ? 1 : 0)
  };
}

function datasDaFatura(ano, mes, cartao) {
  const mesVencimento = mes +
    (cartao.dia_vencimento <= cartao.dia_fechamento ? 1 : 0);

  return {
    fechamento: dataNoMes(ano, mes, cartao.dia_fechamento),
    vencimento: dataNoMes(ano, mesVencimento, cartao.dia_vencimento)
  };
}

// GET - Previsão das faturas dos cartões de crédito
router.get('/faturas', authMiddleware, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;
    const filtrarPeriodo = inicio !== undefined || fim !== undefined;
    const meses = Number(req.query.meses ?? 3);

    if (filtrarPeriodo && !periodoValido(inicio, fim)) {
      return res.status(400).json({
        erro: 'Informe inicio e fim válidos (YYYY-MM-DD).'
      });
    }

    if (!Number.isInteger(meses) || meses < 3 || meses > 48) {
      return res.status(400).json({
        erro: 'Informe de 3 a 48 meses de previsão.'
      });
    }

    const [resultadoCartoes, resultadoLancamentos] = await Promise.all([
      pool.query(`
        SELECT id, nome, dia_fechamento, dia_vencimento, limite
        FROM fontes_destinos
        WHERE usuario_id = $1 AND tipo = 'cartao_credito'
        ORDER BY nome, id
      `, [req.usuarioId]),
      pool.query(`
        SELECT l.id, l.fonte_destino_id, l.descricao, l.valor,
          l.data::text AS data, l.parcela_atual, l.total_parcelas,
          primeira.data::text AS data_compra
        FROM lancamentos l
        JOIN fontes_destinos f ON f.id = l.fonte_destino_id
        LEFT JOIN lancamentos primeira
          ON primeira.usuario_id = l.usuario_id
          AND primeira.fonte_destino_id = l.fonte_destino_id
          AND primeira.grupo_parcelamento = l.grupo_parcelamento
          AND primeira.parcela_atual = 1
        WHERE l.usuario_id = $1
          AND f.usuario_id = $1
          AND f.tipo = 'cartao_credito'
          AND l.tipo = 'saida'
        ORDER BY l.data, l.id
      `, [req.usuarioId])
    ]);

    const hoje = new Date().toISOString().slice(0, 10);

    const cartoes = resultadoCartoes.rows.map(cartao => {
      const faturas = new Map();
      const cicloAtual = mesDaFatura(hoje, cartao.dia_fechamento);
      const limiteCentavos = Math.round(Number(cartao.limite) * 100);
      let utilizadoCentavos = 0;

      // Cria a fatura aberta e as próximas, inclusive quando estiverem vazias.
      for (let i = 0; i <= meses; i++) {
        const datas = datasDaFatura(cicloAtual.ano, cicloAtual.mes + i, cartao);
        faturas.set(datas.fechamento, {
          cartaoId: cartao.id,
          cartao: cartao.nome,
          ...datas,
          atual: i === 0,
          totalCentavos: 0,
          lancamentos: []
        });
      }

      for (const lancamento of resultadoLancamentos.rows) {
        if (lancamento.fonte_destino_id !== cartao.id) continue;

        // A data de cada parcela já foi avançada ao gravar o lançamento.
        // Quando a primeira existe, usamos a data original para achar o ciclo.
        const ciclo = mesDaFatura(
          lancamento.data_compra ?? lancamento.data,
          cartao.dia_fechamento
        );
        const deslocamento = lancamento.data_compra
          ? lancamento.parcela_atual - 1
          : 0;

        const datas = datasDaFatura(ciclo.ano, ciclo.mes + deslocamento, cartao);
        const valorCentavos = Math.round(Number(lancamento.valor) * 100);

        if (datas.vencimento >= hoje) {
          utilizadoCentavos += valorCentavos;
        }

        if (filtrarPeriodo) {
          if (datas.vencimento < inicio || datas.vencimento > fim) continue;

          if (!faturas.has(datas.fechamento)) {
            faturas.set(datas.fechamento, {
              cartaoId: cartao.id,
              cartao: cartao.nome,
              ...datas,
              atual: false,
              totalCentavos: 0,
              lancamentos: []
            });
          }
        }

        const fatura = faturas.get(datas.fechamento);
        if (!fatura) continue;

        fatura.totalCentavos += valorCentavos;
        fatura.lancamentos.push({
          id: lancamento.id,
          descricao: lancamento.descricao,
          valor: valorCentavos / 100,
          data: lancamento.data,
          parcelaAtual: lancamento.parcela_atual,
          totalParcelas: lancamento.total_parcelas
        });
      }

      return {
        id: cartao.id,
        nome: cartao.nome,
        limite: limiteCentavos / 100,
        limiteUtilizado: utilizadoCentavos / 100,
        limiteDisponivel: (limiteCentavos - utilizadoCentavos) / 100,
        faturas: [...faturas.values()]
          .filter(fatura => !filtrarPeriodo ||
            (fatura.vencimento >= inicio && fatura.vencimento <= fim))
          .sort((a, b) => a.fechamento.localeCompare(b.fechamento))
          .map(({ totalCentavos, ...fatura }) => ({
            ...fatura,
            total: totalCentavos / 100
          }))
      };
    });

    return res.json({
      ...(filtrarPeriodo ? { periodo: { inicio, fim } } : {}),
      cartoes,
      faturas: cartoes.flatMap(cartao => cartao.faturas).sort(
        (a, b) => a.vencimento.localeCompare(b.vencimento)
          || a.cartaoId - b.cartaoId
      )
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;