const express = require('express');
const router = express.Router();
const pool = require('../database'); 
const authMiddleware = require('../middlewares/auth'); 

router.get('/categorias', authMiddleware, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;
    const usuarioId = req.usuarioId || req.user?.id || req.usuario?.id; 

    if (!inicio || !fim) {
      return res.status(400).json({ erro: 'Os parâmetros inicio e fim são obrigatórios (YYYY-MM-DD).' });
    }

    const dataInicio = new Date(`${inicio}T00:00:00`);
    const dataFim = new Date(`${fim}T00:00:00`);

    if (isNaN(dataInicio) || isNaN(dataFim) || dataInicio > dataFim) {
      return res.status(400).json({ erro: 'Período inválido.' });
    }

    const umDiaMs = 1000 * 60 * 60 * 24;
    const duracaoDias = Math.round((dataFim - dataInicio) / umDiaMs) + 1;

    const fimAnterior = new Date(dataInicio.getTime() - umDiaMs);
    const inicioAnterior = new Date(fimAnterior.getTime() - (duracaoDias - 1) * umDiaMs);

    const inicioAnteriorStr = inicioAnterior.toISOString().split('T')[0];
    const fimAnteriorStr = fimAnterior.toISOString().split('T')[0];

    
    const querySaidas = `
      SELECT 
        c.id, 
        c.nome,
        COALESCE(SUM(CASE WHEN l.data BETWEEN $2 AND $3 THEN l.valor ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN l.data BETWEEN $4 AND $5 THEN l.valor ELSE 0 END), 0) AS periodo_anterior
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1
        AND l.tipo = 'saida'
        AND (l.data BETWEEN $2 AND $3 OR l.data BETWEEN $4 AND $5)
      GROUP BY c.id, c.nome
      HAVING SUM(CASE WHEN l.data BETWEEN $2 AND $3 THEN l.valor ELSE 0 END) > 0
      ORDER BY total DESC;
    `;

    
    const queryEntradas = `
      SELECT 
        c.id, 
        c.nome, 
        SUM(l.valor) AS total
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1
        AND l.tipo = 'entrada'
        AND l.data BETWEEN $2 AND $3
      GROUP BY c.id, c.nome
      ORDER BY total DESC;
    `;

    const [resSaidas, resEntradas] = await Promise.all([
      pool.query(querySaidas, [usuarioId, inicio, fim, inicioAnteriorStr, fimAnteriorStr]),
      pool.query(queryEntradas, [usuarioId, inicio, fim])
    ]);

    const totalSaidas = resSaidas.rows.reduce((acc, row) => acc + parseFloat(row.total), 0);
    const totalEntradas = resEntradas.rows.reduce((acc, row) => acc + parseFloat(row.total), 0);

    const categoriasSaida = resSaidas.rows.map((row) => {
      const total = parseFloat(row.total);
      const periodoAnterior = parseFloat(row.periodo_anterior);
      const percentual = totalSaidas > 0 ? Number(((total / totalSaidas) * 100).toFixed(2)) : 0;
      const diferenca = Number((total - periodoAnterior).toFixed(2));

      return {
        id: row.id,
        nome: row.nome,
        total,
        percentual,
        periodoAnterior,
        diferenca,
        tendencia: diferenca > 0 ? 'aumento' : diferenca < 0 ? 'reducao' : 'estavel'
      };
    });

    const categoriasEntrada = resEntradas.rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      total: parseFloat(row.total)
    }));

    return res.json({
      periodo: { inicio, fim },
      periodoAnterior: { inicio: inicioAnteriorStr, fim: fimAnteriorStr },
      totalSaidas: Number(totalSaidas.toFixed(2)),
      totalEntradas: Number(totalEntradas.toFixed(2)),
      categorias: categoriasSaida,
      entradasPorCategoria: categoriasEntrada
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
