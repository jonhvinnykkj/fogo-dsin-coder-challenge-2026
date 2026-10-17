import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { criarApp } from './app';
import { abrirBanco } from './db/conexao';
import { migrar } from './db/migrar';
import { carregarGeo } from './geo/marilia';
import { contarBairros, inserirBairros } from './repositorios/bairros';
import { relogioReal, type ContextoApp } from './contexto';

const porta = Number(process.env.PORT ?? 3333);
const caminhoBanco = resolve(process.env.FOGO_DB ?? 'data/fogo.db');

mkdirSync(dirname(caminhoBanco), { recursive: true });

const geo = carregarGeo();
const db = abrirBanco(caminhoBanco);
migrar(db);
if (contarBairros(db) === 0) inserirBairros(db, geo);

const ctx: ContextoApp = {
  db,
  barramento: null, // Tarefa 6
  relogio: relogioReal,
  geo,
};

const app = await criarApp(ctx);
await app.listen({ port: porta, host: '0.0.0.0' });
console.log(`F.O.G.O. no ar em http://localhost:${porta} (banco: ${caminhoBanco})`);

const encerrar = () => {
  void app.close().finally(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
