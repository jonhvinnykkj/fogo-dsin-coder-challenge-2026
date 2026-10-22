import { z } from 'zod';
import './erros-zod';
import {
  CATEGORIAS_AGENTE, NECESSIDADES_MANUTENCAO, ORGAOS, REGIOES, SITUACOES_AGENTE, SITUACOES_EQUIPAMENTO, TURNOS,
} from './dominio';
import { CIDADE, MSG_CIDADE_UF, UF } from './formato';
import { dentroDeMarilia } from './geo';
import { TIPOS_EQUIPAMENTO, schemaCaracteristicas, type TipoEquipamentoId } from './tipos-equipamento';

/** `vazio` é a mensagem de campo não escolhido ("Escolha o tipo"); sem ele, vazio e errado dizem "valor inválido". */
const opcaoDe = <T extends readonly [string, ...string[]]>(valores: T, rotulo: string, vazio?: string) =>
  z.enum(valores, {
    errorMap: (issue) => {
      const naoEscolhido = issue.code === 'invalid_type' || (issue.code === 'invalid_enum_value' && issue.received === '');
      return { message: naoEscolhido && vazio ? vazio : `${rotulo}: valor inválido` };
    },
  });

const IDS_TIPO = TIPOS_EQUIPAMENTO.map((t) => t.id) as [TipoEquipamentoId, ...TipoEquipamentoId[]];

const MSG_FORA = 'A coordenada precisa ficar dentro de Marília';

/** Data de calendário que existe de verdade: `2026-02-30` passa no Date.parse do V8 (vira 02/03), aqui não. */
export function dataExiste(v: string): boolean {
  if (Number.isNaN(Date.parse(v))) return false;
  const [a, m, d] = v.slice(0, 10).split('-').map(Number) as [number, number, number];
  const dia = new Date(Date.UTC(a, m - 1, d));
  return dia.getUTCFullYear() === a && dia.getUTCMonth() === m - 1 && dia.getUTCDate() === d;
}

const dataIso = (rotulo: string) =>
  z
    .string({ invalid_type_error: `${rotulo}: informe uma data` })
    .regex(/^\d{4}-\d{2}-\d{2}/, `${rotulo}: use o formato aaaa-mm-dd`)
    .refine(dataExiste, `${rotulo}: data inválida`);

const latitude = z.number({ required_error: 'Informe a latitude', invalid_type_error: 'A latitude precisa ser um número' }).min(-90).max(90);
const longitude = z.number({ required_error: 'Informe a longitude', invalid_type_error: 'A longitude precisa ser um número' }).min(-180).max(180);

const cep = z
  .string({ required_error: 'Informe o CEP' })
  .trim()
  .min(1, 'Informe o CEP')
  .regex(/^\d{5}-?\d{3}$/, 'CEP inválido: use o formato 00000-000')
  .transform((v) => (v.includes('-') ? v : `${v.slice(0, 5)}-${v.slice(5)}`))
  .refine((v) => v >= '17500-000' && v <= '17539-999', 'O CEP precisa ser de Marília (17500-000 a 17539-999)');

// Opcionais: quem manda precisa mandar Marília/SP; o servidor grava sempre Marília/SP.
const cidadeFixa = z.string().optional().refine((v): boolean => v === undefined || v === CIDADE, MSG_CIDADE_UF);
const ufFixa = z.string().optional().refine((v): boolean => v === undefined || v === UF, MSG_CIDADE_UF);

const camposEquipamento = z.object({
    tipo: opcaoDe(IDS_TIPO, 'Tipo', 'Escolha o tipo'),
    numeroSerie: z.string({ required_error: 'Informe o número de série' }).trim().min(1, 'Informe o número de série').max(60),
    marca: z.string({ required_error: 'Informe a marca' }).trim().min(1, 'Informe a marca').max(60),
    modelo: z.string({ required_error: 'Informe o modelo' }).trim().min(1, 'Informe o modelo').max(60),
    orgao: opcaoDe(ORGAOS, 'Órgão responsável', 'Escolha o órgão'),
    situacao: opcaoDe(SITUACOES_EQUIPAMENTO, 'Situação', 'Escolha a situação'),
    cep,
    logradouro: z.string({ required_error: 'Informe o logradouro' }).trim().min(1, 'Informe o logradouro').max(120),
    referencia: z.string().trim().max(120).default(''),
    bairroId: z.number({ required_error: 'Escolha o bairro', invalid_type_error: 'Escolha o bairro' }).int().positive('Escolha o bairro'),
    cidade: cidadeFixa,
    uf: ufFixa,
    lat: latitude,
    lng: longitude,
    manutencaoNecessidade: opcaoDe(NECESSIDADES_MANUTENCAO, 'Necessidade de manutenção', 'Escolha a necessidade de manutenção'),
    manutencaoPeriodicidadeDias: z.number().int().min(1, 'A periodicidade precisa ser de pelo menos 1 dia').max(3650).optional(),
    ultimaManutencao: dataIso('Última manutenção').optional(),
    proximaManutencao: dataIso('Próxima manutenção').optional(),
    caracteristicas: z.record(z.unknown()).default({}),
    instaladoEm: dataIso('Data de instalação').optional(),
  });

function regrasEquipamento(v: z.infer<typeof camposEquipamento> | z.infer<typeof camposEdicao>, ctx: z.RefinementCtx): void {
  if (!dentroDeMarilia(v.lat, v.lng)) {
    ctx.addIssue({ code: 'custom', path: ['lat'], message: MSG_FORA });
  }
  if ((v.manutencaoNecessidade === 'agendada' || v.manutencaoNecessidade === 'periodica') && !v.proximaManutencao) {
    ctx.addIssue({ code: 'custom', path: ['proximaManutencao'], message: 'Informe a data da próxima manutenção' });
  }
  if (v.ultimaManutencao && v.proximaManutencao && v.proximaManutencao.slice(0, 10) < v.ultimaManutencao.slice(0, 10)) {
    ctx.addIssue({ code: 'custom', path: ['proximaManutencao'], message: 'A próxima manutenção não pode ser anterior à última' });
  }
  if (v.manutencaoNecessidade === 'periodica' && !v.manutencaoPeriodicidadeDias) {
    ctx.addIssue({ code: 'custom', path: ['manutencaoPeriodicidadeDias'], message: 'Informe a periodicidade em dias' });
  }
  const r = schemaCaracteristicas(v.tipo).safeParse(v.caracteristicas);
  if (!r.success) {
    for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['caracteristicas', ...i.path], message: i.message });
  }
}

export const equipamentoInputSchema = camposEquipamento.superRefine(regrasEquipamento);
export type EquipamentoInput = z.infer<typeof equipamentoInputSchema>;

/**
 * Edição (PUT): os mesmos campos, mas o grupo de manutenção (necessidade, periodicidade, última e próxima) pode ficar de
 * fora. Sem `manutencaoNecessidade`, o servidor mantém as quatro datas gravadas: o registro de manutenção e o simulador
 * mudam essas datas, e o formulário aberto antes não pode desfazer. Com ela, o grupo vale inteiro (e é validado junto).
 */
const camposEdicao = camposEquipamento.extend({ manutencaoNecessidade: opcaoDe(NECESSIDADES_MANUTENCAO, 'Necessidade de manutenção').optional() });
export const equipamentoEdicaoSchema = camposEdicao.superRefine(regrasEquipamento);
export type EquipamentoEdicao = z.infer<typeof equipamentoEdicaoSchema>;

export const agenteInputSchema = z
  .object({
    nome: z.string({ required_error: 'Informe o nome' }).trim().min(1, 'Informe o nome').max(120),
    matricula: z.string({ required_error: 'Informe a matrícula' }).trim().min(1, 'Informe a matrícula').max(30),
    categoria: opcaoDe(CATEGORIAS_AGENTE, 'Categoria', 'Escolha a categoria'),
    orgao: opcaoDe(ORGAOS, 'Órgão', 'Escolha o órgão'),
    situacao: opcaoDe(SITUACOES_AGENTE, 'Situação', 'Escolha a situação'),
    turno: opcaoDe(TURNOS, 'Turno', 'Escolha o turno'),
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
      .refine(dataExiste, 'Conclusão: data inválida')
      .optional(),
  })
  .refine((v) => v.previstaPara || v.concluidaEm, {
    path: ['previstaPara'],
    message: 'Informe a data prevista ou a data de conclusão',
  });
export type ManutencaoInput = z.infer<typeof manutencaoInputSchema>;

/** Query string que aceita o valor repetido (`?tipo=a&tipo=b`) ou separado por vírgula (`?tipo=a,b`). */
const lista = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    const partes = (Array.isArray(v) ? v : [v]).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);
    return partes.length ? partes : undefined;
  }, z.array(item).optional());

/** Filtros da Central (mapa e indicadores). */
export const filtrosCentralSchema = z.object({
  tipo: lista(opcaoDe(IDS_TIPO, 'Tipo')),
  situacao: lista(opcaoDe(SITUACOES_EQUIPAMENTO, 'Situação')),
  bairroId: q(z.coerce.number().int().positive()),
  regiao: q(opcaoDe(REGIOES, 'Região')),
  orgao: q(opcaoDe(ORGAOS, 'Órgão')),
  manutencao: q(z.enum(['ok', 'proxima', 'imediata', 'atrasada'], { errorMap: () => ({ message: 'Manutenção: valor inválido' }) })),
  // Só os agentes respondem a estes dois (os filtros de equipamento não escondem agente, e estes não escondem equipamento).
  categoriaAgente: lista(opcaoDe(CATEGORIAS_AGENTE, 'Categoria do agente')),
  situacaoAgente: lista(opcaoDe(SITUACOES_AGENTE, 'Situação do agente')),
});
export type FiltrosCentral = z.infer<typeof filtrosCentralSchema>;

export const filtroOcorrenciasSchema = z.object({
  horas: z.coerce.number({ invalid_type_error: 'Horas: informe um número' }).int('Horas: informe um número inteiro').min(1, 'Horas: de 1 a 168').max(168, 'Horas: de 1 a 168').default(24),
});

/** GET /api/previsoes/risco: próximas 24 horas ou próximos 7 dias. */
export const filtroRiscoSchema = z.object({
  horas: z.coerce.number({ invalid_type_error: 'Horas: use 24 ou 168' }).refine((h) => h === 24 || h === 168, 'Horas: use 24 ou 168').default(24),
});
