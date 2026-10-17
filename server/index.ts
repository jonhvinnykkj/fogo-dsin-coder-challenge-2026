import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { criarApp } from './app';
import { relogioReal, type ContextoApp } from './contexto';

const porta = Number(process.env.PORT ?? 3333);
const caminhoBanco = resolve(process.env.FOGO_DB ?? 'data/fogo.db');

// A pasta do banco precisa existir; a abertura do banco em si vem na Tarefa 4.
mkdirSync(dirname(caminhoBanco), { recursive: true });

const ctx: ContextoApp = {
  db: null, // Tarefa 4
  barramento: null, // Tarefa 6
  relogio: relogioReal,
  geo: null, // Tarefa 3
};

const app = await criarApp(ctx);
await app.listen({ port: porta, host: '0.0.0.0' });
console.log(`F.O.G.O. no ar em http://localhost:${porta} (banco: ${caminhoBanco})`);
