// Trilha de auditoria (só gestor) e troca do token de um dispositivo.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { naoEncontrado } from '../erros';
import { listarAuditoria } from '../seguranca/auditoria';
import { gerarTokenDispositivo, hashTokenDispositivo } from '../seguranca/cripto';
import { lerId } from './id';

const vazioComoAusente = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());

const filtrosSchema = z.object({
  login: vazioComoAusente(z.string().trim().max(60)),
  entidade: vazioComoAusente(z.string().trim().max(40)),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

export async function rotasAuditoria(app: FastifyInstance): Promise<void> {
  const db = app.ctx.db;

  app.get('/api/auditoria', {
    schema: {
      tags: ['Acesso'],
      summary: 'Trilha de auditoria: quem fez o quê, antes e depois (só gestor)',
      description: 'Filtros: login, entidade (equipamentos, agentes, alertas, ocorrencias, simulacao, auth), pagina, porPagina. Mais recentes primeiro.',
    },
  }, async (req) => listarAuditoria(db, filtrosSchema.parse(req.query)));

  app.post('/api/equipamentos/:id/token', {
    schema: {
      tags: ['Equipamentos'],
      summary: 'Gera um novo token para o dispositivo (só gestor)',
      description: 'O banco guarda só o hash do token, então o token antigo não pode ser lido de volta: esta rota cria outro, invalida o anterior e o devolve UMA vez. Configure-o no dispositivo.',
    },
  }, async (req) => {
    const id = lerId((req.params as { id?: string }).id, 'Equipamento');
    const equipamento = db.prepare('SELECT codigo FROM equipamentos WHERE id = ?').get(id) as { codigo: string } | undefined;
    if (!equipamento) throw naoEncontrado('Equipamento');
    const token = gerarTokenDispositivo();
    db.prepare('UPDATE equipamentos SET token_dispositivo = ? WHERE id = ?').run(hashTokenDispositivo(token), id);
    return { id, codigo: equipamento.codigo, token };
  });
}
