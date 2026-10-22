// Confere a porta ANTES de compilar e semear: com a porta ocupada, o aviso saía só depois do build e da semente (~17 s).
// Roda dentro do `npm start` e do `npm run dev` (o .npmrc tem ignore-scripts=true, então um "prestart" não rodaria).
// É também a fonte das mensagens de porta do servidor (server/porta.ts reexporta daqui), para o aviso ser o mesmo nos dois lugares.
// JavaScript puro e sem dependências, como scripts/checar-node.mjs.
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';

export const PORTA_PADRAO = 3333;

export class ErroDePorta extends Error {}

/** `PORT` ausente ou vazio vale 3333; texto que não seja um inteiro de 1 a 65535 é recusado com uma explicação. */
export function lerPorta(valor) {
  if (valor === undefined || valor.trim() === '') return PORTA_PADRAO;
  const texto = valor.trim();
  const numero = Number(texto);
  if (!/^\d+$/.test(texto) || numero < 1 || numero > 65535) {
    throw new ErroDePorta(`PORT="${valor}" não é uma porta válida. Use um número de 1 a 65535, por exemplo: PORT=3334 npm start`);
  }
  return numero;
}

/** Sugere a próxima porta, com o comando do macOS/Linux e os do Windows (PowerShell e cmd). */
export function mensagemPortaOcupada(porta) {
  const outra = porta === 65535 ? porta - 1 : porta + 1;
  return `A porta ${porta} está em uso. Rode com PORT=${outra} npm start (Windows PowerShell: $env:PORT=${outra}; npm start · cmd: set PORT=${outra}&& npm start)`;
}

/** Endereços de loopback: nesses, o navegador pode resolver "localhost" para ::1 ou 127.0.0.1, então a porta vale nos dois. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Endereços a testar para o servidor que vai escutar em `host`. Em loopback testa também `::1` e `::`: outro app (Vite, Next)
 * escutando em `::` não impede o bind em 127.0.0.1, mas o navegador resolve `localhost` para `::1` primeiro e mostraria o OUTRO app.
 * Sem IPv6 na máquina, o teste desses endereços falha com outro erro que não EADDRINUSE e é ignorado.
 */
export function enderecosParaTestar(host) {
  return LOOPBACK.has(host) ? ['127.0.0.1', '::1', '::'] : [host];
}

function enderecoLivre(porta, host) {
  return new Promise((resolver) => {
    const teste = createServer();
    teste.once('error', (erro) => resolver(erro.code !== 'EADDRINUSE'));
    teste.once('listening', () => teste.close(() => resolver(true)));
    teste.listen({ port: porta, host });
  });
}

/** false só quando a porta está ocupada (EADDRINUSE) em algum endereço em que o servidor vai ser alcançado; outros erros ficam para o servidor. */
export async function portaLivre(porta, host = 'localhost') {
  for (const endereco of enderecosParaTestar(host)) {
    if (!(await enderecoLivre(porta, endereco))) return false;
  }
  return true;
}

// Rodado direto (node scripts/checar-porta.mjs): sai com código 1 e a mensagem se a porta for inválida ou estiver ocupada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const porta = lerPorta(process.env.PORT);
    if (!(await portaLivre(porta, process.env.HOST ?? 'localhost'))) {
      console.error(mensagemPortaOcupada(porta));
      process.exit(1);
    }
  } catch (erro) {
    if (!(erro instanceof ErroDePorta)) throw erro;
    console.error(erro.message);
    process.exit(1);
  }
}
