-- seed.sql => Cria duas contas de demonstração com três meses de lançamentos.

BEGIN;

-- Senha das duas contas de demonstração: Demo@12345
INSERT INTO usuarios (nome, email, cpf, senha_hash)
VALUES
    ('Demo Ana', 'ana.demo@example.com', '52998224725',
     '$2b$10$abcdefghijklmnopqrstuu5T5CeOYs.j2nvgXERisBCwZwIaJ.8QO'),
    ('Demo Bruno', 'bruno.demo@example.com', '11144477735',
     '$2b$10$abcdefghijklmnopqrstuu5T5CeOYs.j2nvgXERisBCwZwIaJ.8QO')
ON CONFLICT (email) DO NOTHING;

INSERT INTO categorias (usuario_id, nome, tipo)
SELECT u.id, c.nome, c.tipo
FROM usuarios u
CROSS JOIN (VALUES ('Salário', 'entrada'), ('Alimentação', 'saida')) AS c(nome, tipo)
WHERE u.email IN ('ana.demo@example.com', 'bruno.demo@example.com')
ON CONFLICT (usuario_id, nome, tipo) DO NOTHING;

INSERT INTO fontes_destinos (usuario_id, nome, tipo)
SELECT id, 'Conta corrente', 'conta'
FROM usuarios
WHERE email IN ('ana.demo@example.com', 'bruno.demo@example.com')
ON CONFLICT (usuario_id, nome) DO NOTHING;

INSERT INTO lancamentos (
    usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id
)
SELECT u.id, c.tipo, exemplo.descricao, exemplo.valor,
       mes.data, c.id, f.id
FROM usuarios u
JOIN categorias c ON c.usuario_id = u.id
JOIN fontes_destinos f ON f.usuario_id = u.id AND f.nome = 'Conta corrente'
JOIN (VALUES
    ('Salário', 'entrada', 'Demo: salário', 3500.00),
    ('Alimentação', 'saida', 'Demo: supermercado', 450.00)
) AS exemplo(categoria, tipo, descricao, valor)
    ON exemplo.categoria = c.nome AND exemplo.tipo = c.tipo
CROSS JOIN generate_series(0, 2) AS meses(numero)
CROSS JOIN LATERAL (
    SELECT (date_trunc('month', CURRENT_DATE) - meses.numero * INTERVAL '1 month')::date AS data
) AS mes
WHERE u.email IN ('ana.demo@example.com', 'bruno.demo@example.com')
  AND NOT EXISTS (
      SELECT 1
      FROM lancamentos l
      WHERE l.usuario_id = u.id
        AND l.descricao = exemplo.descricao
        AND l.data = mes.data
  );

COMMIT;