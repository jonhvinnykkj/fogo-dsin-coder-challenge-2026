// LGPD e segurança operacional: o que cada papel vê dos agentes.
// - Telefone e matrícula (dados pessoais): inteiros só para o gestor; os demais veem mascarado. O agente vê os PRÓPRIOS dados inteiros.
// - Posição ao vivo de guardas e policiais: exata para quem opera (gestor, operador, agente); aproximada (~500 m)
//   para "somente consulta". Vale para a API e para o tempo real (SSE). A moto ou a viatura vinculada a um agente anda
//   com ele: a posição do VEÍCULO vale como a do agente e recebe o mesmo arredondamento, em toda saída em que aparece.
import type { Database } from 'better-sqlite3';
import { pode, type Papel } from '../../shared/seguranca';
import type { EventoFogo } from '../../shared/modelos';

/** "(14) 99876-5432" → "(14) •••••-••32". Mantém o DDD e os dois últimos dígitos. */
export function mascararTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '').length;
  let visto = 0;
  return telefone.replace(/\d/g, (d) => {
    visto += 1;
    return visto <= 2 || visto > digitos - 2 ? d : '•';
  });
}

/** "AT-1001" → "AT-••01". Mantém o prefixo de letras e os dois últimos caracteres. */
export function mascararMatricula(matricula: string): string {
  const prefixo = /^[A-Za-z]+[-\s]?/.exec(matricula)?.[0] ?? '';
  const resto = matricula.slice(prefixo.length);
  if (resto.length <= 2) return prefixo + '•'.repeat(resto.length);
  return prefixo + '•'.repeat(resto.length - 2) + resto.slice(-2);
}

// 0,005° ≈ 550 m de latitude em Marília: dá o bairro, não a esquina.
const GRADE = 0.005;
export const aproximar = (valor: number) => Math.round(valor / GRADE) * GRADE;

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `proprioId`: o agente de quem pediu (papel `agente`); a máscara protege os dados dos OUTROS, não os dele. */
function protegerAgente(agente: Objeto, papel: Papel, proprioId: number | null): Objeto {
  const copia = { ...agente };
  const ehOProprio = papel === 'agente' && proprioId !== null && agente.id === proprioId;
  if (!pode(papel, 'verDadosPessoais') && !ehOProprio) {
    if (typeof copia.telefone === 'string') copia.telefone = mascararTelefone(copia.telefone);
    if (typeof copia.matricula === 'string') copia.matricula = mascararMatricula(copia.matricula);
  }
  if (!pode(papel, 'verPosicaoExata')) {
    for (const campo of ['latAtual', 'lngAtual']) if (typeof copia[campo] === 'number') copia[campo] = aproximar(copia[campo] as number);
  }
  return copia;
}

function protegerPontoAgente(ponto: Objeto, papel: Papel): Objeto {
  if (pode(papel, 'verPosicaoExata')) return ponto;
  return { ...ponto, lat: aproximar(ponto.lat as number), lng: aproximar(ponto.lng as number) };
}

/** Ids dos equipamentos que são o veículo de um agente (agentes.equipamento_id). Consulta barata: roda só para quem não vê a posição exata. */
export function veiculosDeAgentes(db: Database): ReadonlySet<number> {
  const linhas = db.prepare('SELECT equipamento_id AS id FROM agentes WHERE equipamento_id IS NOT NULL').all() as { id: number }[];
  return new Set(linhas.map((l) => l.id));
}

function aproximarCampos(o: Objeto, campos: readonly string[]): Objeto {
  const copia = { ...o };
  for (const c of campos) if (typeof copia[c] === 'number') copia[c] = aproximar(copia[c] as number);
  return copia;
}

/**
 * Procura, em qualquer ponto do corpo, o que carrega a posição de um veículo de agente e a arredonda:
 * o equipamento (tem `codigo`; campos `lat`/`lng` e `latAtual`/`lngAtual`) e o alerta dele (tem `criticidade` e `equipamentoId`).
 */
function aproximarVeiculos(valor: unknown, veiculos: ReadonlySet<number>): unknown {
  if (Array.isArray(valor)) return valor.map((v) => aproximarVeiculos(v, veiculos));
  if (!ehObjeto(valor)) return valor;
  let o: Objeto = valor;
  if (typeof o.codigo === 'string' && typeof o.id === 'number' && veiculos.has(o.id)) o = aproximarCampos(o, ['lat', 'lng', 'latAtual', 'lngAtual']);
  else if (typeof o.criticidade === 'string' && typeof o.equipamentoId === 'number' && veiculos.has(o.equipamentoId)) o = aproximarCampos(o, ['lat', 'lng']);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' && v !== null ? aproximarVeiculos(v, veiculos) : v]));
}

/** Rotas cuja resposta traz equipamentos (ou alertas deles): onde um veículo de agente pode aparecer. */
const ROTAS_COM_EQUIPAMENTO = ['/api/equipamentos', '/api/central/mapa', '/api/alertas', '/api/manutencao'];

/**
 * Ajusta a resposta da API ao papel de quem pediu (`agenteId`: o agente vinculado à sessão, se houver). `rota` é o padrão registrado (ex.: /api/agentes/:id).
 * `veiculos`: ids dos equipamentos que são veículo de agente (só consultado para quem não vê a posição exata).
 * Devolve o mesmo objeto quando nada precisa mudar.
 */
export function protegerResposta(
  rota: string, papel: Papel, corpo: unknown, agenteId: number | null = null, veiculos: () => ReadonlySet<number> = () => new Set(),
): unknown {
  if (pode(papel, 'verDadosPessoais')) return corpo; // gestor vê tudo
  if (rota.startsWith('/api/agentes') && ehObjeto(corpo)) {
    if (Array.isArray(corpo.itens)) return { ...corpo, itens: corpo.itens.map((a) => (ehObjeto(a) ? protegerAgente(a, papel, agenteId) : a)) };
    return protegerAgente(corpo, papel, agenteId);
  }
  let resposta = corpo;
  if (rota === '/api/central/mapa' && ehObjeto(resposta) && Array.isArray(resposta.agentes)) {
    resposta = { ...resposta, agentes: resposta.agentes.map((a) => (ehObjeto(a) ? protegerPontoAgente(a, papel) : a)) };
  }
  if (!pode(papel, 'verPosicaoExata') && ROTAS_COM_EQUIPAMENTO.some((r) => rota === r || rota.startsWith(`${r}/`))) {
    resposta = aproximarVeiculos(resposta, veiculos());
  }
  return resposta;
}

/** O mesmo, para cada evento do tempo real. */
export function protegerEvento(evento: EventoFogo, papel: Papel, veiculos: () => ReadonlySet<number> = () => new Set()): EventoFogo {
  if (pode(papel, 'verPosicaoExata')) return evento;
  if (evento.tipo === 'posicoes') {
    const doAgente = veiculos();
    return {
      ...evento,
      itens: evento.itens.map((i) => (i.tipo === 'agente' || doAgente.has(i.id) ? { ...i, lat: aproximar(i.lat), lng: aproximar(i.lng) } : i)),
    };
  }
  if (evento.tipo === 'agente') return { ...evento, dados: { ...evento.dados, lat: aproximar(evento.dados.lat), lng: aproximar(evento.dados.lng) } };
  if (evento.tipo === 'equipamento' && veiculos().has(evento.dados.id)) {
    return { ...evento, dados: { ...evento.dados, lat: aproximar(evento.dados.lat), lng: aproximar(evento.dados.lng) } };
  }
  if (evento.tipo === 'alerta' && evento.dados.equipamentoId !== undefined && evento.dados.lat !== undefined && evento.dados.lng !== undefined && veiculos().has(evento.dados.equipamentoId)) {
    return { ...evento, dados: { ...evento.dados, lat: aproximar(evento.dados.lat), lng: aproximar(evento.dados.lng) } };
  }
  return evento;
}
