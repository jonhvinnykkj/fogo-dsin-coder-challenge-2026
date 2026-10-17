import { z } from 'zod';
import './erros-zod';
import {
  CATEGORIAS_AGENTE, NECESSIDADES_MANUTENCAO, ORGAOS, REGIOES, SITUACOES_AGENTE, SITUACOES_EQUIPAMENTO, TURNOS,
} from './dominio';
import { dentroDeMarilia } from './geo';
import { TIPOS_EQUIPAMENTO, schemaCaracteristicas, type TipoEquipamentoId } from './tipos-equipamento';

const opcaoDe = <T extends readonly [string, ...string[]]>(valores: T, rotulo: string) =>
  z.enum(valores, { errorMap: () => ({ message: `${rotulo}: valor inválido` }) });

const IDS_TIPO = TIPOS_EQUIPAMENTO.map((t) => t.id) as [TipoEquipamentoId, ...TipoEquipamentoId[]];

const MSG_FORA = 'A coordenada precisa ficar dentro de Marília';

const dataIso = (rotulo: string) =>
  z
    .string({ invalid_type_error: `${rotulo}: informe uma data` })
    .regex(/^\d{4}-\d{2}-\d{2}/, `${rotulo}: use o formato aaaa-mm-dd`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${rotulo}: data inválida`);

const latitude = z.number({ required_error: 'Informe a latitude', invalid_type_error: 'A latitude precisa ser um número' }).min(-90).max(90);
const longitude = z.number({ required_error: 'Informe a longitude', invalid_type_error: 'A longitude precisa ser um número' }).min(-180).max(180);

const cep = z
  .string({ required_error: 'Informe o CEP' })
  .regex(/^\d{5}-?\d{3}$/, 'CEP inválido: use o formato 00000-000')
  .transform((v) => (v.includes('-') ? v : `${v.slice(0, 5)}-${v.slice(5)}`))
  .refine((v) => v >= '17500-000' && v <= '17539-999', 'O CEP precisa ser de Marília (17500-000 a 17539-999)');

export const equipamentoInputSchema = z
  .object({
    tipo: opcaoDe(IDS_TIPO, 'Tipo'),
    numeroSerie: z.string({ required_error: 'Informe o número de série' }).trim().min(1, 'Informe o número de série').max(60),
    marca: z.string({ required_error: 'Informe a marca' }).trim().min(1, 'Informe a marca').max(60),
    modelo: z.string({ required_error: 'Informe o modelo' }).trim().min(1, 'Informe o modelo').max(60),
    orgao: opcaoDe(ORGAOS, 'Órgão responsável'),
    situacao: opcaoDe(SITUACOES_EQUIPAMENTO, 'Situação'),
    cep,
    logradouro: z.string({ required_error: 'Informe o logradouro' }).trim().min(1, 'Informe o logradouro').max(120),
    referencia: z.string().trim().max(120).default(''),
    bairroId: z.number({ required_error: 'Escolha o bairro', invalid_type_error: 'Escolha o bairro' }).int().positive('Escolha o bairro'),
    lat: latitude,
    lng: longitude,
    manutencaoNecessidade: opcaoDe(NECESSIDADES_MANUTENCAO, 'Necessidade de manutenção'),
    manutencaoPeriodicidadeDias: z.number().int().min(1, 'A periodicidade precisa ser de pelo menos 1 dia').max(3650).optional(),
    ultimaManutencao: dataIso('Última manutenção').optional(),
    proximaManutencao: dataIso('Próxima manutenção').optional(),
    caracteristicas: z.record(z.unknown()).default({}),
    instaladoEm: dataIso('Data de instalação').optional(),
  })
  .superRefine((v, ctx) => {
    if (!dentroDeMarilia(v.lat, v.lng)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: MSG_FORA });
    }
    if ((v.manutencaoNecessidade === 'agendada' || v.manutencaoNecessidade === 'periodica') && !v.proximaManutencao) {
      ctx.addIssue({ code: 'custom', path: ['proximaManutencao'], message: 'Informe a data da próxima manutenção' });
    }
    if (v.manutencaoNecessidade === 'periodica' && !v.manutencaoPeriodicidadeDias) {
      ctx.addIssue({ code: 'custom', path: ['manutencaoPeriodicidadeDias'], message: 'Informe a periodicidade em dias' });
    }
    const r = schemaCaracteristicas(v.tipo).safeParse(v.caracteristicas);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['caracteristicas', ...i.path], message: i.message });
    }
  });
export type EquipamentoInput = z.infer<typeof equipamentoInputSchema>;

export const agenteInputSchema = z
  .object({
    nome: z.string({ required_error: 'Informe o nome' }).trim().min(1, 'Informe o nome').max(120),
    matricula: z.string({ required_error: 'Informe a matrícula' }).trim().min(1, 'Informe a matrícula').max(30),
    categoria: opcaoDe(CATEGORIAS_AGENTE, 'Categoria'),
    orgao: opcaoDe(ORGAOS, 'Órgão'),
    situacao: opcaoDe(SITUACOES_AGENTE, 'Situação'),
    turno: opcaoDe(TURNOS, 'Turno'),
    baseLogradouro: z.string({ required_error: 'Informe o logradouro da base' }).trim().min(1, 'Informe o logradouro da base').max(120),
    baseBairroId: z.number({ required_error: 'Escolha o bairro da base', invalid_type_error: 'Escolha o bairro da base' }).int().positive('Escolha o bairro da base'),
    lat: latitude,
    lng: longitude,
    equipamentoId: z.number().int().positive().optional(),
    telefone: z.string().trim().max(30).optional(),
  })
  .superRefine((v, ctx) => {
    if (!dentroDeMarilia(v.lat, v.lng)) ctx.addIssue({ code: 'custom', path: ['lat'], message: MSG_FORA });
  });
export type AgenteInput = z.infer<typeof agenteInputSchema>;

export const mudancaSituacaoSchema = z.object({
  situacao: opcaoDe(SITUACOES_EQUIPAMENTO, 'Situação'),
  motivo: z.string({ required_error: 'Informe o motivo' }).trim().min(3, 'Informe o motivo (mínimo de 3 letras)'),
  recuperado: z.boolean().optional(),
});
export type MudancaSituacao = z.infer<typeof mudancaSituacaoSchema>;

/** Query string: texto vazio vale como "não informado". */
const q = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());

const paginacao = {
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
};

export const filtrosEquipamentoSchema = z.object({
  busca: q(z.string().trim().max(100)),
  tipo: q(opcaoDe(IDS_TIPO, 'Tipo')),
  situacao: q(opcaoDe(SITUACOES_EQUIPAMENTO, 'Situação')),
  bairroId: q(z.coerce.number().int().positive()),
  regiao: q(opcaoDe(REGIOES, 'Região')),
  orgao: q(opcaoDe(ORGAOS, 'Órgão')),
  manutencao: q(z.enum(['imediata', 'proxima', 'atrasada'], { errorMap: () => ({ message: 'Manutenção: valor inválido' }) })),
  ...paginacao,
});
export type FiltrosEquipamento = z.infer<typeof filtrosEquipamentoSchema>;

export const filtrosAgenteSchema = z.object({
  busca: q(z.string().trim().max(100)),
  categoria: q(opcaoDe(CATEGORIAS_AGENTE, 'Categoria')),
  situacao: q(opcaoDe(SITUACOES_AGENTE, 'Situação')),
  turno: q(opcaoDe(TURNOS, 'Turno')),
  bairroId: q(z.coerce.number().int().positive()),
  regiao: q(opcaoDe(REGIOES, 'Região')),
  orgao: q(opcaoDe(ORGAOS, 'Órgão')),
  ...paginacao,
});
export type FiltrosAgente = z.infer<typeof filtrosAgenteSchema>;

export const manutencaoInputSchema = z
  .object({
    tipo: opcaoDe(['corretiva', 'preventiva'] as const, 'Tipo de manutenção'),
    descricao: z.string({ required_error: 'Informe a descrição' }).trim().min(3, 'Informe a descrição (mínimo de 3 letras)').max(500),
    previstaPara: dataIso('Data prevista').optional(),
    concluidaEm: z
      .string({ invalid_type_error: 'Conclusão: informe uma data' })
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Conclusão: data inválida')
      .optional(),
  })
  .refine((v) => v.previstaPara || v.concluidaEm, {
    path: ['previstaPara'],
    message: 'Informe a data prevista ou a data de conclusão',
  });
export type ManutencaoInput = z.infer<typeof manutencaoInputSchema>;
