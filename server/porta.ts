// Porta do servidor: lida de PORT, com mensagens claras em português para o que mais atrapalha quem roda o projeto pela primeira vez.
// O código mora em scripts/checar-porta.mjs (que o `npm start` roda antes do build); aqui só o reexportamos para o servidor.
export { ErroDePorta, lerPorta, mensagemPortaOcupada, PORTA_PADRAO } from '../scripts/checar-porta.mjs';
