// Imprime a narração (src/demo/narracao.ts) já com os números dos JSONs da gravação, para o gerador de voz.
// Uso: node --experimental-strip-types scripts/narracao-json.mjs > narracao.json
import { readFileSync } from 'node:fs';

const { narracao } = await import('../src/demo/narracao.ts');
const ler = (nome) => JSON.parse(readFileSync(new URL(`../public/gravacoes/dados/${nome}.json`, import.meta.url), 'utf8')).dados;
const lista = (d) => (Array.isArray(d) ? d : (d.itens ?? []));
const backtest = ler('previsoes-backtest');

const numeros = {
  equipamentos: ler('equipamentos').total,
  tipos: lista(ler('tipos-equipamento')).length,
  agentes: ler('agentes').total,
  ganhoPct: backtest.ganhoPct,
  diasTeste: backtest.dias,
};
process.stdout.write(JSON.stringify(narracao(numeros), null, 1));
