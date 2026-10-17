// Mostra o token de um equipamento do banco LOCAL, para testar `POST /api/telemetria` com curl.
// Uso: npm run token -- FOGO-RAD-0001   (banco: FOGO_DB ou data/fogo.db)
// O token só existe no seu banco (gerado na semente); a API nunca o devolve.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TokenEncontrado {
  codigo: string;
  tipo: string;
  token: string;
}

/** Lê o token do equipamento no banco (somente leitura). `null` se o código não existir. */
export function buscarToken(caminhoBanco: string, codigo: string): TokenEncontrado | null {
  const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true });
  try {
    const linha = db.prepare('SELECT codigo, tipo, token_dispositivo AS token FROM equipamentos WHERE codigo = ?').get(codigo.trim().toUpperCase()) as
      | TokenEncontrado
      | undefined;
    return linha ?? null;
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
  const achado = buscarToken(caminho, codigo);
  if (!achado) {
    console.error(`Nenhum equipamento com o código ${codigo}. Veja os códigos na tela Equipamentos.`);
    return 1;
  }
  console.log(achado.token);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = principal();
