// O Swagger descreve o que a API de fato pede e responde, sem mudar a validação.
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarAppDeTeste } from '../test/app';
import { criarCtxDeTeste } from '../test/ctx';
import { REGRAS } from '../seguranca/permissoes';

interface Operacao {
  summary?: string;
  description?: string;
  parameters?: { name: string; in: string }[];
  requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> };
  responses: Record<string, unknown>;
}
let app: FastifyInstance;
let paths: Record<string, Record<string, Operacao>>;

beforeEach(async () => {
  app = await criarAppDeTeste(criarCtxDeTeste());
  paths = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json().paths;
});
afterEach(async () => {
  await app.close();
});

const op = (metodo: string, rota: string) => paths[rota.replace(/:(\w+)/g, '{$1}')]![metodo.toLowerCase()]!;
const parametros = (metodo: string, rota: string) => (op(metodo, rota).parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);

describe('Swagger', () => {
  it('toda escrita com corpo validado pelo zod tem requestBody com os campos', () => {
    const comCorpo = [
      'POST /api/equipamentos', 'PUT /api/equipamentos/:id', 'PATCH /api/equipamentos/:id/situacao', 'POST /api/equipamentos/:id/manutencoes',
      'POST /api/agentes', 'PUT /api/agentes/:id', 'PATCH /api/agentes/:id/situacao', 'POST /api/auth/entrar', 'POST /api/auth/demo',
      'PATCH /api/simulacao', 'POST /api/simulacao/eventos', 'POST /api/telemetria', 'POST /api/campo/agentes/:id/reportes',
    ];
    for (const chave of comCorpo) {
      const [metodo, rota] = chave.split(' ') as [string, string];
      const campos = op(metodo, rota).requestBody?.content['application/json']?.schema.properties;
      expect(campos, chave).toBeDefined();
      expect(Object.keys(campos!).length, chave).toBeGreaterThan(0);
    }
    expect(Object.keys(op('POST', '/api/equipamentos').requestBody!.content['application/json']!.schema.properties!)).toEqual(expect.arrayContaining(['tipo', 'numeroSerie', 'bairroId', 'lat', 'lng']));
    expect(Object.keys(op('POST', '/api/auth/entrar').requestBody!.content['application/json']!.schema.properties!)).toEqual(['login', 'senha']);
  });

  it('GETs com filtros documentam os parâmetros de consulta', () => {
    expect(parametros('GET', '/api/equipamentos')).toEqual(expect.arrayContaining(['busca', 'tipo', 'situacao', 'bairroId', 'pagina', 'porPagina']));
    expect(parametros('GET', '/api/agentes')).toEqual(expect.arrayContaining(['busca', 'categoria', 'turno', 'pagina']));
    expect(parametros('GET', '/api/alertas')).toEqual(expect.arrayContaining(['status', 'criticidade', 'limite']));
    expect(parametros('GET', '/api/central/mapa')).toEqual(expect.arrayContaining(['tipo', 'categoriaAgente', 'situacaoAgente']));
    expect(parametros('GET', '/api/central/ocorrencias')).toEqual(['horas']);
    expect(parametros('GET', '/api/equipamentos/:id/telemetria')).toEqual(['horas']);
    expect(parametros('GET', '/api/previsoes/risco')).toEqual(['horas']);
    expect(parametros('GET', '/api/auditoria')).toEqual(expect.arrayContaining(['login', 'entidade', 'pagina', 'porPagina']));
    expect(parametros('GET', '/api/campo/agentes/:id/equipamentos-proximos')).toEqual(['limite']);
  });

  it('documenta os códigos de verdade: 201 na criação, 204 na exclusão, e os erros 400/401/403/404/409', () => {
    const codigos = (m: string, r: string) => Object.keys(op(m, r).responses);
    expect(codigos('POST', '/api/equipamentos')).toEqual(expect.arrayContaining(['201', '400', '401', '403', '409']));
    expect(codigos('POST', '/api/equipamentos')).not.toContain('200');
    expect(codigos('DELETE', '/api/equipamentos/:id')).toEqual(expect.arrayContaining(['204', '401', '403', '404', '409']));
    expect(codigos('DELETE', '/api/agentes/:id')).toContain('204');
    expect(codigos('POST', '/api/agentes')).toContain('201');
    expect(codigos('POST', '/api/equipamentos/:id/manutencoes')).toContain('201');
    expect(codigos('POST', '/api/campo/agentes/:id/reportes')).toContain('201');
    expect(codigos('POST', '/api/auth/sair')).toContain('204');
    expect(codigos('POST', '/api/auth/entrar')).toEqual(expect.arrayContaining(['200', '400', '401', '429']));
    expect(codigos('POST', '/api/telemetria')).toEqual(expect.arrayContaining(['202', '400', '401', '429']));
    expect(codigos('GET', '/api/auditoria')).toEqual(expect.arrayContaining(['200', '401', '403']));
    expect(codigos('PATCH', '/api/alertas/:id/reconhecer')).toContain('404');
  });

  it('toda rota da tabela de permissões tem resumo e ao menos um código de erro documentado', () => {
    for (const chave of Object.keys(REGRAS)) {
      const [metodo, rota] = chave.split(' ') as [string, string];
      const o = op(metodo, rota);
      expect(o.summary, chave).toBeTruthy();
      expect(Object.keys(o.responses).length, chave).toBeGreaterThanOrEqual(1);
    }
    expect(op('GET', '/api/saude').summary).toMatch(/saúde/i);
  });

  it('os textos batem com o comportamento (token devolvido uma vez no cadastro; sem "quem viu" no reconhecimento)', () => {
    expect(op('POST', '/api/equipamentos').summary).toMatch(/token/i);
    expect(op('POST', '/api/equipamentos').description).toMatch(/tokenDispositivo/);
    expect(op('PATCH', '/api/alertas/:id/reconhecer').summary).not.toMatch(/quem viu/i);
    expect(op('PATCH', '/api/alertas/:id/reconhecer').summary).toMatch(/hora/);
  });

  it('documentar não muda a validação: o zod continua mandando (sem coerção do Fastify, sem poda da resposta)', async () => {
    const lista = await app.inject({ method: 'GET', url: '/api/equipamentos?pagina=abc' });
    expect(lista.statusCode).toBe(400);
    expect(lista.json().campos).toHaveProperty('pagina');
    const criar = await app.inject({ method: 'POST', url: '/api/equipamentos', payload: { tipo: 'radar' } });
    expect(criar.statusCode).toBe(400);
    expect(criar.json().campos).toHaveProperty('numeroSerie'); // mensagem do zod, não do ajv
    const agentes = await app.inject({ method: 'GET', url: '/api/agentes?porPagina=2' });
    expect(agentes.json()).toHaveProperty('porPagina', 2);
  });
});
