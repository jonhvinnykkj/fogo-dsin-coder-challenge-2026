// Porta do servidor: lida de PORT, com mensagens claras em português para o que mais atrapalha quem roda o projeto pela primeira vez.
// O código mora em scripts/checar-porta.mjs (que o `npm start` roda antes do build); aqui só o reexportamos para o servidor.
export { ErroDePorta, lerPorta, mensagemPortaOcupada, PORTA_PADRAO } from '../scripts/checar-porta.mjs';

/**
 * Bloco final do log: endereço, o que fazer primeiro e como parar. É a última coisa que o terminal mostra, depois do build e das senhas.
 * No Docker o servidor escuta numa porta do contêiner (3333) e o navegador entra por outra, a publicada em `ports`
 * (o docker-compose.yml manda `FOGO_PORTA_PUBLICADA`): dizer "localhost:3333" mandaria a pessoa para o lugar errado.
 */
export function mensagemNoAr(porta: number, caminhoBanco: string, publicada?: string, demo = true): string {
  const fora = publicada?.trim();
  const linhas = [
    '',
    fora ? `F.O.G.O. no ar. Abra http://localhost:${fora}` : `F.O.G.O. no ar em http://localhost:${porta}`,
    fora ? `  Porta ${porta} dentro do contêiner; banco: ${caminhoBanco}` : `  Banco: ${caminhoBanco}`,
    demo
      ? '  Primeiro uso: na tela de entrada, clique em "Gestor" (modo demonstração; FOGO_DEMO=0 desliga).'
      : '  Modo demonstração desligado: entre com usuário e senha.',
    fora ? '  Para parar: Ctrl+C, ou "docker compose down" em outro terminal.' : '  Para parar: Ctrl+C.',
    '',
  ];
  return linhas.join('\n');
}
