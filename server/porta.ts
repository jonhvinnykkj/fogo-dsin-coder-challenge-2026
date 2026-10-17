// Porta do servidor: lida de PORT, com mensagens claras em português para o que mais atrapalha quem roda o projeto pela primeira vez.
export const PORTA_PADRAO = 3333;

export class ErroDePorta extends Error {}

/** `PORT` ausente ou vazio vale 3333; texto que não seja um inteiro de 1 a 65535 é recusado com uma explicação. */
export function lerPorta(valor: string | undefined): number {
  if (valor === undefined || valor.trim() === '') return PORTA_PADRAO;
  const texto = valor.trim();
  const numero = Number(texto);
  if (!/^\d+$/.test(texto) || numero < 1 || numero > 65535) {
    throw new ErroDePorta(`PORT="${valor}" não é uma porta válida. Use um número de 1 a 65535, por exemplo: PORT=3334 npm start`);
  }
  return numero;
}

export function mensagemPortaOcupada(porta: number): string {
  return `A porta ${porta} está em uso. Rode com PORT=${porta === 65535 ? porta - 1 : porta + 1} npm start`;
}
