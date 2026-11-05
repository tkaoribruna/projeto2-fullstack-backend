const db = require('../database'); 

module.exports = {
  async listar(req, res) {
    try {
      const usuario_id = req.usuarioId;
      const { rows } = await db.query(
        'SELECT id, nome, tipo FROM categorias WHERE usuario_id = $1 ORDER BY nome ASC',
        [usuario_id]
      );
      return res.json(rows);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ erro: 'Erro interno ao listar categorias.' });
    }
  },

  async criar(req, res) {
    try {
      const usuario_id = req.usuarioId;
      const { nome, tipo } = req.body;

      if (typeof nome !== 'string' || !nome.trim() || !tipo) {
        return res.status(400).json({ erro: 'Nome e tipo são obrigatórios.' });
      }

      if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({ erro: 'O tipo deve ser "entrada" ou "saida".' });
      }

      const nomeFormatado = nome.trim();

      const query = `
        INSERT INTO categorias (usuario_id, nome, tipo) 
        VALUES ($1, $2, $3) 
        RETURNING id, nome, tipo
      `;
      
      const { rows } = await db.query(query, [usuario_id, nomeFormatado, tipo]);
      return res.status(201).json(rows[0]);

    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ erro: 'Já existe uma categoria com este nome e tipo.' });
      }
      console.error(error);
      return res.status(500).json({ erro: 'Erro interno ao criar categoria.' });
    }
  },

  
  async atualizar(req, res) {
    try {
      const usuario_id = req.usuarioId;
      const { id } = req.params;
      const { nome, tipo } = req.body;

      if (typeof nome !== 'string' || !nome.trim() || !tipo) {
        return res.status(400).json({ erro: 'Nome e tipo são obrigatórios.' });
      }

      if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({ erro: 'O tipo deve ser "entrada" ou "saida".' });
      }

      const categoriaCheck = await db.query(
        'SELECT id FROM categorias WHERE id = $1 AND usuario_id = $2',
        [id, usuario_id]
      );

      if (categoriaCheck.rows.length === 0) {
        return res.status(404).json({ erro: 'Categoria não encontrada.' });
      }

      const query = `
        UPDATE categorias 
        SET nome = $1, tipo = $2 
        WHERE id = $3 AND usuario_id = $4 
        RETURNING id, nome, tipo
      `;

      const { rows } = await db.query(query, [nome.trim(), tipo, id, usuario_id]);
      return res.json(rows[0]);

    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ erro: 'Já existe outra categoria com este nome e tipo.' });
      }
      console.error(error);
      return res.status(500).json({ erro: 'Erro interno ao atualizar categoria.' });
    }
  },

  async deletar(req, res) {
    try {
      const usuario_id = req.usuarioId;
      const { id } = req.params;

      const categoriaCheck = await db.query(
        'SELECT id FROM categorias WHERE id = $1 AND usuario_id = $2',
        [id, usuario_id]
      );

      if (categoriaCheck.rows.length === 0) {
        return res.status(404).json({ erro: 'Categoria não encontrada.' });
      }

      const lancamentosCheck = await db.query(
        'SELECT id FROM lancamentos WHERE categoria_id = $1 LIMIT 1',
        [id]
      );

      if (lancamentosCheck.rows.length > 0) {
        return res.status(400).json({ 
          erro: 'Não é possível excluir esta categoria pois existem lançamentos associados a ela.' 
        });
      }

      await db.query('DELETE FROM categorias WHERE id = $1 AND usuario_id = $2', [id, usuario_id]);
      
      return res.status(204).send(); 

    } catch (error) {
      console.error(error);
      return res.status(500).json({ erro: 'Erro interno ao excluir categoria.' });
    }
  }
};
