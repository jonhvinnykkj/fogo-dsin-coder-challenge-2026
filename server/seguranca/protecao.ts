// LGPD e segurança operacional: o que cada papel vê dos agentes.
// - Telefone e matrícula (dados pessoais): inteiros só para o gestor; os demais veem mascarado.
// - Posição ao vivo de guardas e policiais: exata para quem opera (gestor, operador, agente); aproximada (~500 m)
//   para "somente consulta". Vale para a API e para o tempo real (SSE).
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

function protegerAgente(agente: Objeto, papel: Papel): Objeto {
  const copia = { ...agente };
  if (!pode(papel, 'verDadosPessoais')) {
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

/**
 * Ajusta a resposta da API ao papel de quem pediu. `rota` é o padrão registrado (ex.: /api/agentes/:id).
 * Devolve o mesmo objeto quando nada precisa mudar.
 */
export function protegerResposta(rota: string, papel: Papel, corpo: unknown): unknown {
  if (pode(papel, 'verDadosPessoais')) return corpo; // gestor vê tudo
  if (rota.startsWith('/api/agentes') && ehObjeto(corpo)) {
    if (Array.isArray(corpo.itens)) return { ...corpo, itens: corpo.itens.map((a) => (ehObjeto(a) ? protegerAgente(a, papel) : a)) };
    return protegerAgente(corpo, papel);
  }
  if (rota === '/api/central/mapa' && ehObjeto(corpo) && Array.isArray(corpo.agentes)) {
    return { ...corpo, agentes: corpo.agentes.map((a) => (ehObjeto(a) ? protegerPontoAgente(a, papel) : a)) };
  }
  return corpo;
}

/** O mesmo, para cada evento do tempo real. */
export function protegerEvento(evento: EventoFogo, papel: Papel): EventoFogo {
  if (pode(papel, 'verPosicaoExata')) return evento;
  if (evento.tipo === 'posicoes') {
    return { ...evento, itens: evento.itens.map((i) => (i.tipo === 'agente' ? { ...i, lat: aproximar(i.lat), lng: aproximar(i.lng) } : i)) };
  }
  if (evento.tipo === 'agente') return { ...evento, dados: { ...evento.dados, lat: aproximar(evento.dados.lat), lng: aproximar(evento.dados.lng) } };
  return evento;
}
