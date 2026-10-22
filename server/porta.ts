// Porta do servidor: lida de PORT, com mensagens claras em português para o que mais atrapalha quem roda o projeto pela primeira vez.
// O código mora em scripts/checar-porta.mjs (que o `npm start` roda antes do build); aqui só o reexportamos para o servidor.
export { ErroDePorta, lerPorta, mensagemPortaOcupada, PORTA_PADRAO } from '../scripts/checar-porta.mjs';

/**
 * Linha de "no ar" do log. No Docker o servidor escuta numa porta do contêiner (3333) e o navegador entra por outra, a
 * publicada em `ports` (o docker-compose.yml manda `FOGO_PORTA_PUBLICADA`): dizer "localhost:3333" mandaria a pessoa para o lugar errado.
 */
export function mensagemNoAr(porta: number, caminhoBanco: string, publicada?: string): string {
  const fora = publicada?.trim();
  if (fora) return `F.O.G.O. no ar. Abra http://localhost:${fora} (porta ${porta} dentro do contêiner; banco: ${caminhoBanco})`;
  return `F.O.G.O. no ar em http://localhost:${porta} (banco: ${caminhoBanco})`;
}
