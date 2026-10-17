import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CRITICIDADES } from '../../shared/dominio';
import { naoEncontrado } from '../erros';
import { alertaPorId, listarAlertas, reconhecerAlerta, resolverAlerta } from '../repositorios/alertas';
import { lerId } from './id';

const tags = ['Alertas'];
const vazioComoAusente = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());

const filtrosSchema = z.object({
  status: z.enum(['abertos', 'todos'], { errorMap: () => ({ message: 'Status: use abertos ou todos' }) }).default('abertos'),
  criticidade: vazioComoAusente(z.enum(CRITICIDADES, { errorMap: () => ({ message: 'Criticidade: valor inválido' }) })),
  tipo: vazioComoAusente(z.string().trim().min(1).max(60)),
  desde: vazioComoAusente(
    z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), 'Desde: use uma data ISO 8601').transform((v) => new Date(v).toISOString()),
  ),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

export async function rotasAlertas(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const agora = () => ctx.relogio.agora().toISOString();
  const id = (req: { params: unknown }) => lerId((req.params as { id?: string }).id, 'Alerta');

  app.get('/api/alertas', {
    schema: {
      tags,
      summary: 'Lista alertas, mais recentes primeiro',
      description: 'Filtros: status (abertos|todos, padrão abertos), criticidade, tipo, desde (ISO 8601), limite.',
    },
  }, async (req) => listarAlertas(ctx.db, filtrosSchema.parse(req.query)));

  app.patch('/api/alertas/:id/reconhecer', { schema: { tags, summary: 'Reconhece o alerta (registra quem viu e quando)' } }, async (req) => {
    const alerta = reconhecerAlerta(ctx.db, id(req), agora());
    if (!alerta) throw naoEncontrado('Alerta');
    return alerta;
  });

  app.patch('/api/alertas/:id/resolver', { schema: { tags, summary: 'Resolve o alerta (sai da lista de abertos)' } }, async (req) => {
    const alertaId = id(req);
    const antes = alertaPorId(ctx.db, alertaId);
    if (!antes) throw naoEncontrado('Alerta');
    if (antes.resolvidoEm) return antes; // já resolvido (por pessoa ou pelo sistema): mantém a origem e não avisa de novo
    const alerta = resolverAlerta(ctx.db, alertaId, agora(), 'manual')!;
    ctx.barramento.emitir({ tipo: 'alerta', dados: alerta }); // a Central tira dos abertos na hora
    return alerta;
  });
}
