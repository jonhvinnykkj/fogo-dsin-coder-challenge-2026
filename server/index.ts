import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { formatarNumero } from '../shared/formato';
import { criarApp } from './app';
import { abrirBanco } from './db/conexao';
import { migrar } from './db/migrar';
import { carregarGeo } from './geo/marilia';
import { contarBairros, inserirBairros } from './repositorios/bairros';
import { preencherLacuna, semear, SEMENTE_PADRAO } from './semente/semear';
import { relogioReal, type ContextoApp } from './contexto';
import { ErroDePorta, lerPorta, mensagemNoAr, mensagemPortaOcupada } from './porta';
import { Barramento } from './tempo-real/barramento';
import { MotorAlertas } from './tempo-real/motor-alertas';
import { Simulador } from './tempo-real/simulador';
import { garantirUsuariosDemo } from './seguranca/usuarios';

// Antes de abrir o banco: PORT inválida é erro de uso, não precisa de pilha de erro.
let porta: number;
try {
  porta = lerPorta(process.env.PORT);
} catch (erro) {
  if (!(erro instanceof ErroDePorta)) throw erro;
  console.error(erro.message);
  process.exit(1);
}
const caminhoBanco = resolve(process.env.FOGO_DB ?? 'data/fogo.db');
const host = process.env.HOST ?? 'localhost';

mkdirSync(dirname(caminhoBanco), { recursive: true });

const geo = carregarGeo();
const db = abrirBanco(caminhoBanco);
migrar(db);
if (contarBairros(db) === 0) inserirBairros(db, geo);

const segundos = (inicio: number) => formatarNumero((performance.now() - inicio) / 1000, 1);

// Banco vazio: cria a cidade e 60 dias de histórico. Banco existente: completa o histórico até agora.
let inicio = performance.now();
const semente = semear(db, { agora: relogioReal.agora(), semente: SEMENTE_PADRAO, geo });
if (semente.criado) {
  console.log(
    `Semente criada: ${formatarNumero(semente.equipamentos)} equipamentos, ${formatarNumero(semente.agentes)} agentes, ` +
      `${formatarNumero(semente.ocorrencias)} ocorrências e ${formatarNumero(semente.leiturasTelemetria)} horas de telemetria em ${segundos(inicio)} s`,
  );
}
inicio = performance.now();
const lacuna = preencherLacuna(db, { agora: relogioReal.agora(), semente: SEMENTE_PADRAO, geo });
if (lacuna.horasGeradas > 0) {
  console.log(`Histórico completado até agora: ${formatarNumero(lacuna.horasGeradas)} horas geradas em ${segundos(inicio)} s`);
}
// A carga em massa passa pelo WAL; devolve esse espaço ao disco antes de abrir o servidor.
if (semente.criado || lacuna.horasGeradas > 0) db.pragma('wal_checkpoint(TRUNCATE)');

const barramento = new Barramento();
const ctx: ContextoApp = {
  db,
  barramento,
  motor: new MotorAlertas({ db, barramento, relogio: relogioReal }),
  relogio: relogioReal,
  geo,
};
// Banco antigo: alertas de ocorrência que já terminou (e nunca fecharam) são resolvidos agora, como automáticos.
const legado = ctx.motor.resolverAlertasDeOcorrenciasEncerradas();
if (legado > 0) console.log(`Alertas antigos de ocorrências já encerradas resolvidos: ${formatarNumero(legado)}`);
ctx.simulador = new Simulador(ctx);

// Segurança: banco sem usuários ganha um por papel, com senha aleatória mostrada só agora.
// FOGO_DEMO=0 desliga a entrada com um clique (produção); por padrão ela fica ligada, para a avaliação rodar de primeira.
const demo = process.env.FOGO_DEMO !== '0';
const criados = garantirUsuariosDemo(db);
if (criados.length > 0) {
  console.log('\nUsuários criados (guarde as senhas: elas não aparecem de novo; troque com "npm run senha -- <usuário>"):');
  console.log('Se o PowerShell engolir o "--", use: npx tsx scripts/senha.ts <usuário>');
  for (const u of criados) console.log(`  ${u.login.padEnd(9)} ${u.senha}   (${u.papel})`);
  console.log('');
}

const app = await criarApp(ctx, { demo, cookieSeguro: process.env.FOGO_COOKIE_SEGURO === '1' });
try {
  // Só a própria máquina, por padrão: sem isto qualquer um na mesma rede Wi-Fi chegava ao sistema. "localhost" escuta em 127.0.0.1 E em ::1
  // (o navegador tenta ::1 primeiro; só em 127.0.0.1 um outro app em IPv6 na mesma porta aparecia no lugar do F.O.G.O.). O Docker usa HOST=0.0.0.0.
  await app.listen({ port: porta, host: host });
} catch (erro) {
  if ((erro as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw erro;
  console.error(mensagemPortaOcupada(porta));
  db.close();
  process.exit(1);
}
barramento.iniciarAgrupamento();
ctx.simulador.iniciar();
console.log(mensagemNoAr(porta, caminhoBanco, process.env.FOGO_PORTA_PUBLICADA, demo));

const encerrar = () => {
  ctx.simulador?.parar();
  barramento.parar();
  void app.close().finally(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
