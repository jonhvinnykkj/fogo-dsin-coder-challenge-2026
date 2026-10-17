// Confere a versão do Node antes de compilar e subir o F.O.G.O. Roda dentro do próprio `npm start` (e do `npm run dev`):
// o .npmrc tem ignore-scripts=true, então um "prestart" não rodaria.
// Por que 22.14: o better-sqlite3 13 traz o binário pronto para a Node-API 10, que chegou no Node 22.14; Vite 8 e Vitest 5
// pedem 22.12. Em versão mais velha o erro seria em inglês e confuso; aqui sai uma frase só, com o que fazer.
// Sem dependências e sem sintaxe nova: precisa rodar em Node antigo para conseguir avisar.
import { pathToFileURL } from 'node:url';

export const MINIMA = '22.14.0';

const numeros = (versao) => String(versao).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);

/** true se `versao` ("v22.14.0" ou "22.14.0") é igual ou mais nova que `minima`, comparando número a número. */
export function versaoAtende(versao, minima = MINIMA) {
  const a = numeros(versao);
  const b = numeros(minima);
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function mensagem(versao) {
  return `O F.O.G.O. precisa do Node.js 22.14 ou mais novo (você tem ${versao}). Instale a versão LTS em https://nodejs.org ou rode com Docker: docker compose up --build`;
}

// Rodado direto (node scripts/checar-node.mjs): sai com código 1 e a mensagem se a versão não serve.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && !versaoAtende(process.version)) {
  console.error(mensagem(process.version));
  process.exit(1);
}
