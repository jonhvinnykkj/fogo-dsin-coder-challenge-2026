// Define uma senha nova para um usuário do banco LOCAL e encerra as sessões abertas dele.
// Uso: npm run senha -- gestor            (gera uma senha aleatória e mostra uma vez)
//      npm run senha -- gestor "minha senha forte"
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from '../server/db/conexao';
import { migrar } from '../server/db/migrar';
import { gerarSenhaAleatoria } from '../server/seguranca/cripto';
import { definirSenha } from '../server/seguranca/usuarios';

export const SENHA_MINIMA = 10;

export function trocarSenha(caminhoBanco: string, login: string, senha = gerarSenhaAleatoria()): string | null {
  if (senha.length < SENHA_MINIMA) throw new Error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  const db = abrirBanco(caminhoBanco);
  try {
    migrar(db);
    return definirSenha(db, login, senha) ? senha : null;
  } finally {
    db.close();
  }
}

function principal(): number {
  const [login, senha] = process.argv.slice(2);
  if (!login) {
    console.error('Informe o usuário. Exemplo: npm run senha -- gestor');
    return 1;
  }
  const caminho = resolve(process.env.FOGO_DB ?? 'data/fogo.db');
  if (!existsSync(caminho)) {
    console.error(`Banco não encontrado em ${caminho}. Rode "npm start" uma vez para criá-lo.`);
    return 1;
  }
  try {
    const nova = trocarSenha(caminho, login, senha);
    if (!nova) {
      console.error(`Usuário "${login}" não encontrado. Os de demonstração são: gestor, operador, agente e consulta.`);
      return 1;
    }
    console.log(senha ? `Senha de "${login}" trocada.` : `Nova senha de "${login}": ${nova}`);
    return 0;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = principal();
