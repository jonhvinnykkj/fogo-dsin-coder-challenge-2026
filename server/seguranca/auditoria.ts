// Trilha de auditoria: quem fez o quê, quando, de onde, e como o registro estava antes e ficou depois.
import type { Database } from 'better-sqlite3';
import type { Papel, RegistroAuditoria } from '../../shared/seguranca';

/** Nome legível de cada escrita. Rota de escrita fora desta lista aparece como "MÉTODO /rota". */
const ACOES: Record<string, string> = {
  'POST /api/equipamentos': 'Cadastro de equipamento',
  'PUT /api/equipamentos/:id': 'Edição de equipamento',
  'DELETE /api/equipamentos/:id': 'Exclusão de equipamento',
  'PATCH /api/equipamentos/:id/situacao': 'Mudança de situação do equipamento',
  'POST /api/equipamentos/:id/manutencoes': 'Registro de manutenção',
  'POST /api/equipamentos/:id/token': 'Novo token do dispositivo',
  'POST /api/agentes': 'Cadastro de agente',
  'PUT /api/agentes/:id': 'Edição de agente',
  'DELETE /api/agentes/:id': 'Exclusão de agente',
  'PATCH /api/agentes/:id/situacao': 'Mudança de situação do agente',
  'PATCH /api/alertas/:id/reconhecer': 'Reconhecimento de alerta',
  'PATCH /api/alertas/:id/resolver': 'Resolução de alerta',
  'PATCH /api/simulacao': 'Mudança na simulação',
  'POST /api/simulacao/eventos': 'Evento injetado na simulação',
  'POST /api/auth/entrar': 'Entrada no sistema',
  'POST /api/auth/demo': 'Entrada no sistema (demonstração)',
  'POST /api/auth/sair': 'Saída do sistema',
};

export const nomeDaAcao = (chave: string) => ACOES[chave] ?? chave;

/** Tabelas que dá para fotografar antes e depois (nome vem desta lista, nunca da requisição). */
const TABELAS: Record<string, string> = { equipamentos: 'equipamentos', agentes: 'agentes', alertas: 'alertas' };
/** Segredos nunca entram na trilha. */
const COLUNAS_SECRETAS = new Set(['token_dispositivo', 'senha_hash']);
const CHAVE_SECRETA = /senha|token|segredo/i;
const LIMITE_JSON = 4000;

/** "/api/equipamentos/:id/situacao" → "equipamentos". */
export function entidadeDaRota(rota: string): string | null {
  return /^\/api\/([a-z-]+)/.exec(rota)?.[1] ?? null;
}

export function fotografar(db: Database, entidade: string | null, id: number | null): Record<string, unknown> | null {
  const tabela = entidade ? TABELAS[entidade] : undefined;
  if (!tabela || id === null) return null;
  const linha = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!linha) return null;
  for (const c of COLUNAS_SECRETAS) delete linha[c];
  return linha;
}

/** Corpo da requisição sem senhas e tokens, e cortado se for grande. */
export function limparDados(corpo: unknown): unknown {
  if (corpo === undefined || corpo === null) return null;
  const limpo = JSON.parse(JSON.stringify(corpo, (chave, valor) => (chave && CHAVE_SECRETA.test(chave) ? '[omitido]' : valor)));
  return limpo;
}

const paraJson = (v: unknown) => {
  if (v === undefined || v === null) return null;
  const texto = JSON.stringify(v);
  return texto.length > LIMITE_JSON ? JSON.stringify({ cortado: true, inicio: texto.slice(0, LIMITE_JSON) }) : texto;
};

export interface NovoRegistro {
  em: string;
  usuarioId: number | null;
  login: string | null;
  papel: Papel | null;
  chave: string;
  rota: string;
  entidadeId: number | null;
  status: number;
  antes?: unknown;
  depois?: unknown;
  dados?: unknown;
  ip: string | null;
}

export function registrar(db: Database, r: NovoRegistro): void {
  const [metodo] = r.chave.split(' ');
  db.prepare(
    `INSERT INTO auditoria (em, usuario_id, login, papel, acao, metodo, rota, entidade, entidade_id, status, antes, depois, dados, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.em, r.usuarioId, r.login, r.papel, nomeDaAcao(r.chave), metodo, r.rota, entidadeDaRota(r.rota), r.entidadeId, r.status,
    paraJson(r.antes), paraJson(r.depois), paraJson(limparDados(r.dados)), r.ip,
  );
}

export interface FiltrosAuditoria {
  login?: string;
  entidade?: string;
  pagina: number;
  porPagina: number;
}

interface LinhaAuditoria {
  id: number; em: string; login: string | null; papel: Papel | null; acao: string; metodo: string; rota: string;
  entidade: string | null; entidade_id: number | null; status: number; antes: string | null; depois: string | null; dados: string | null; ip: string | null;
}

const lerJson = (t: string | null) => (t === null ? null : (JSON.parse(t) as unknown));

export function listarAuditoria(db: Database, f: FiltrosAuditoria): { itens: RegistroAuditoria[]; total: number; pagina: number; porPagina: number } {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.login) {
    cond.push('login = ?');
    params.push(f.login.trim().toLowerCase());
  }
  if (f.entidade) {
    cond.push('entidade = ?');
    params.push(f.entidade);
  }
  const onde = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM auditoria${onde}`).get(...params) as { n: number }).n;
  const linhas = db
    .prepare(`SELECT * FROM auditoria${onde} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, f.porPagina, (f.pagina - 1) * f.porPagina) as LinhaAuditoria[];
  return {
    total,
    pagina: f.pagina,
    porPagina: f.porPagina,
    itens: linhas.map((l) => ({
      id: l.id, em: l.em, login: l.login, papel: l.papel, acao: l.acao, metodo: l.metodo, rota: l.rota, entidade: l.entidade,
      entidadeId: l.entidade_id, status: l.status, antes: lerJson(l.antes), depois: lerJson(l.depois), dados: lerJson(l.dados), ip: l.ip,
    })),
  };
}
