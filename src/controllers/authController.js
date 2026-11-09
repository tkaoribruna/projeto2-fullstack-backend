// authController.js => Trata o cadastro e o login dos usuários.

const bcrypt = require('bcrypt');
const db = require('../database');

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
