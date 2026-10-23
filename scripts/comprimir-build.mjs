// Versões já comprimidas (.br e .gz) dos arquivos de texto do build da interface. O servidor entrega a versão pronta
// conforme o Accept-Encoding do navegador (preCompressed do @fastify/static em server/app.ts): o JavaScript sai com cerca de
// um terço do tamanho, sem gastar CPU a cada pedido e sem comprimir a API nem o tempo real (SSE).
// Chamado pelo plugin do vite.config.ts no fim de todo `vite build` (npm start, npm run build e Docker).
// JavaScript puro e sem dependências (só node:zlib), como scripts/checar-node.mjs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Só texto: imagens, fontes woff2 e mapas já vêm comprimidos. */
const COMPRIMIVEL = /\.(js|mjs|css|html|svg|json|txt|webmanifest)$/i;
/** Abaixo disto o cabeçalho da compressão come o ganho. */
export const TAMANHO_MINIMO = 1024;

function listar(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(pasta, e.name)) : [join(pasta, e.name)]));
}

/**
 * Escreve `arquivo.br` e `arquivo.gz` ao lado de cada arquivo de texto com pelo menos TAMANHO_MINIMO bytes, só quando a
 * versão comprimida fica menor. Devolve o total antes e depois (em bytes, contando o .br) para quem quiser mostrar.
 */
export function comprimirPasta(pasta) {
  let antes = 0;
  let depois = 0;
  for (const arquivo of listar(pasta)) {
    if (!COMPRIMIVEL.test(arquivo)) continue;
    const dados = readFileSync(arquivo);
    if (dados.length < TAMANHO_MINIMO) continue;
    // Qualidade 9 em vez de 11 (máximo): quase o mesmo tamanho, várias vezes mais rápido, e o build roda em todo npm start.
    const br = brotliCompressSync(dados, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: dados.length } });
    const gz = gzipSync(dados, { level: 9 });
    if (br.length < dados.length) writeFileSync(`${arquivo}.br`, br);
    if (gz.length < dados.length) writeFileSync(`${arquivo}.gz`, gz);
    antes += dados.length;
    depois += Math.min(br.length, dados.length);
  }
  return { antes, depois };
}
