# Projeto 2 — Controle Financeiro — Backend

Projeto da disciplina Web Full-Stack. A API usa Node.js, Express e PostgreSQL.

## Integrantes

- [Bruna Kaori Takuti](https://github.com/tkaoribruna)
- [Igor Rocha Cantieri](https://github.com/IgorRochaCantieri)

## Como rodar no Windows

### 1. Instalar as dependências

Abra o CMD na raiz deste repositório e execute:

```cmd
npm install
copy .env.example .env
```

### 2. Preparar o PostgreSQL

No pgAdmin, crie um banco vazio chamado `projeto2_financas`. Abra a **Query Tool** desse banco e execute, nesta ordem:

1. `database/schema.sql` para criar as tabelas.
2. `database/seed.sql` para inserir os dados de demonstração.

### 3. Configurar o `.env`

Abra o `.env` e preencha a conexão e o segredo usados pelo backend. Exemplo:

```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/projeto2_financas
JWT_SECRET=SUBSTITUA_POR_UM_SEGREDO_LOCAL
```

Troque `SUA_SENHA` pela senha do PostgreSQL e ajuste o usuário, a porta e o nome do banco conforme sua instalação. Mantenha o `.env` fora do Git.

### 4. Iniciar a API

```cmd
npm run dev
```

Com a configuração padrão, a API fica disponível em `http://localhost:3000`. Para conferir se ela subiu, abra `http://localhost:3000/api/status`.

### 5. Iniciar o frontend

Em outro CMD, abra a raiz do [repositório do frontend](https://github.com/tkaoribruna/projeto2-fullstack-frontend) e execute:

```cmd
npm install
npm run dev
```

Abra o endereço `Local` exibido pelo Vite, normalmente `http://localhost:5173`.

## Contas de demonstração

As duas contas criadas pelo `seed.sql` usam a senha `Demo@12345`.

| E-mail | Dados de exemplo |
|---|---|
| `ana.demo@example.com` | 6 lançamentos em 3 meses |
| `bruno.demo@example.com` | 6 lançamentos em 3 meses |

## Estrutura

```text
database/
├── schema.sql
└── seed.sql
src/
├── database.js
├── middlewares/
├── routes/
└── server.js
```
