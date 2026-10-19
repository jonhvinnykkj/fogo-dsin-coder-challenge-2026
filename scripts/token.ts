// Gera um token NOVO para um equipamento do banco LOCAL, para testar `POST /api/telemetria` com curl.
// Uso: npm run token -- FOGO-RAD-0001   (banco: FOGO_DB ou data/fogo.db)
// O banco guarda só o hash do token, então o antigo não pode ser lido de volta: este script cria outro, grava o hash
// (o anterior deixa de valer) e mostra o token uma única vez. A API faz o mesmo em POST /api/equipamentos/:id/token.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarTokenDispositivo, hashTokenDispositivo } from '../server/seguranca/cripto';

export interface TokenGerado {
  codigo: string;
  tipo: string;
  token: string;
}

/** Troca o token do equipamento e devolve o novo. `null` se o código não existir. */
export function gerarNovoToken(caminhoBanco: string, codigo: string): TokenGerado | null {
  const db = new Database(caminhoBanco, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000'); // o servidor pode estar ligado
    const linha = db.prepare('SELECT id, codigo, tipo FROM equipamentos WHERE codigo = ?').get(codigo.trim().toUpperCase()) as
      | { id: number; codigo: string; tipo: string }
      | undefined;
    if (!linha) return null;
    const token = gerarTokenDispositivo();
    db.prepare('UPDATE equipamentos SET token_dispositivo = ? WHERE id = ?').run(hashTokenDispositivo(token), linha.id);
    return { codigo: linha.codigo, tipo: linha.tipo, token };
  } finally {
    db.close();
  }
}

function principal(): number {
  const codigo = process.argv[2];
  if (!codigo) {
    console.error('Informe o código do equipamento. Exemplo: npm run token -- FOGO-RAD-0001');
    return 1;
  }
  const caminho = resolve(process.env.FOGO_DB ?? 'data/fogo.db');
  if (!existsSync(caminho)) {
    console.error(`Banco não encontrado em ${caminho}. Rode "npm start" uma vez para criá-lo.`);
    return 1;
  }
  const gerado = gerarNovoToken(caminho, codigo);
  if (!gerado) {
    console.error(`Nenhum equipamento com o código ${codigo}. Veja os códigos na tela Equipamentos.`);
    return 1;
  }
  console.log(gerado.token);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = principal();
