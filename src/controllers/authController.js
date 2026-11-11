// authController.js => Trata o cadastro e o login dos usuários.

const bcrypt = require('bcrypt');
const db = require('../database');
const jwt = require('jsonwebtoken');//Verificar essa linha

function cpfValido(cpf){
    const digitos = String(cpf).replace(/\D/g, '');

    if(digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)){
        return false;
    }

    //Esta função serve para conferir se os dois últimos digitos do CPF estão corretos.
    function calcularDigito(tamanho){
        let soma = 0;

        // Multiplica cada dígito pelo peso correspondente e acumula o resultado em soma.
        for(let i = 0; i < tamanho; i++){
            soma += Number(digitos[i]) * (tamanho + 1 -i);// (tamanho + 1 -i) => peso do dígito
        }

        const resto = (soma * 10) % 11;

        return resto === 10 ? 0: resto;

    }

    return calcularDigito(9) === Number(digitos[9]) && calcularDigito(10) === Number(digitos[10]);
}

function validarCadastro(dados = {}){
    //Objeto que reunirá os erros dos campos, enviados no formulário
    const campos = {};

    const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
    const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
    const cpf = typeof dados.cpf === 'string' ? dados.cpf.replace(/\D/g, '') : '';
    const senha = typeof dados.senha === 'string' ? dados.senha : '';

    //Verificações
    if(!nome){
        campos.nome = 'O nome é obrigatório.';
    }else if(nome.length > 120){
        campos.nome = 'O nome deve ter no máximo 120 caracteres.';
    }

    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        campos.email = 'Informe um email válido.';
    }else if(email.length > 160){
        campos.email = 'O email deve ter no máximo 160 caracteres.';
    }

    if(!cpfValido(cpf)){
        campos.cpf = 'Informe o CPF válido';
    }

    if(senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)){
        campos.senha = 'A senha deve ter no mínimo 8 caracteres, com letras e números.';
    }else if(Buffer.byteLength(senha, 'utf8') > 72){
        campos.senha = 'A senha é muito longa. Use uma senha mais curta.';
    }

    if(dados.confirmacaoSenha !== senha){
        campos.confirmacaoSenha = 'A confirmação deve ser igual à senha.';
    }

    return {
        campos,
        dados: { nome, email, cpf, senha}
    };
}

async function cadastrar(req, res, next){
    const {campos, dados} = validarCadastro(req.body ?? {});
    let cliente;
    let descartarCliente = false;

    if(Object.keys(campos).length > 0){
        return res.status(400).json({
            erro: 'Dados inválidos.',
            campos,
        });
    }

    try{
        const senhaHash = await bcrypt.hash(dados.senha, 10);
        cliente = await db.connect();
        await cliente.query('BEGIN');   

        const {rows} = await cliente.query(
            `INSERT INTO usuarios (nome, email, cpf, senha_hash)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nome, email`,
            [dados.nome, dados.email, dados.cpf, senhaHash]
        );

        const usuario = rows[0];

        await cliente.query(
            `INSERT INTO categorias (usuario_id, nome, tipo)
            VALUES ($1, 'salario', 'entrada'),
            ($1, 'Alimentação', 'saida'),
            ($1, 'Transporte', 'saida')`,
            [usuario.id]
        );

        await cliente.query(
            `INSERT INTO fontes_destinos (usuario_id, nome, tipo)
            VALUES ($1, 'Conta corrente', 'conta')`,
            [usuario.id]
        );

        await cliente.query('COMMIT');

        return res.status(201).json(usuario);

    } catch (erro){

        if(cliente){
            try{
                await cliente.query('ROLLBACK');
            }catch{
                descartarCliente = true;
            }
        }

        //postgreSQL retorna 23505 quando uma restrição UNIQUE é violada.
        if(erro.code === '23505'){
            if(erro.constraint === 'usuarios_email_key'){
                return res.status(409).json({
                    erro: 'Cadastro em conflito.',
                    campos: { email: 'Este e-mail ja está cadastrado.'},
                });
            }

            if(erro.constraint === 'usuarios_cpf_key'){
                return res.status(409).json({
                    erro: 'Cadastro em conflito',
                    campos: { cpf: 'Este CPF ja está cadastrado.'},
                });
            }
        }

        return next(erro);
    } finally{
            if(cliente){
                cliente.release(descartarCliente);
            }
        }

}

//Estudar esta função
async function login(req, res, next) {
    const corpo = req.body ?? {};
    const email = typeof corpo.email === 'string'
        ? corpo.email.trim().toLowerCase()
        : '';
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

    if (!email || !senha || Buffer.byteLength(senha, 'utf8') > 72) {
        return res.status(400).json({
            erro: 'Informe um e-mail e uma senha válidos.',
        });
    }

    try {
        const { rows } = await db.query(
            `SELECT id, nome, email, senha_hash
             FROM usuarios
             WHERE email = $1`,
            [email]
        );

        const usuario = rows[0];

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
            return res.status(401).json({
                erro: 'E-mail ou senha inválidos.',
            });
        }

        const token = jwt.sign(
            { sub: String(usuario.id) },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '1h' }
        );

        return res.status(200).json({
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
            },
        });
    } catch (erro) {
        return next(erro);
    }
}

module.exports = { cadastrar, login};
