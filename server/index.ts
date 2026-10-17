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
import { Barramento } from './tempo-real/barramento';
import { MotorAlertas } from './tempo-real/motor-alertas';
import { Simulador } from './tempo-real/simulador';

const porta = Number(process.env.PORT ?? 3333);
const caminhoBanco = resolve(process.env.FOGO_DB ?? 'data/fogo.db');

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
ctx.simulador = new Simulador(ctx);

const app = await criarApp(ctx);
await app.listen({ port: porta, host: '0.0.0.0' });
console.log(`F.O.G.O. no ar em http://localhost:${porta} (banco: ${caminhoBanco})`);
barramento.iniciarAgrupamento();
ctx.simulador.iniciar();

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
