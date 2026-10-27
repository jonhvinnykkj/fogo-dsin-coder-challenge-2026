// Ajusta os planos à narração gravada:
// - cada plano dura max(duração do roteiro, fala + respiros + 0,5 s), mais a transição de saída, se houver;
// - se a gravação não tem trecho suficiente, o plano desacelera (a câmera acompanha a nova velocidade, para os
//   zooms continuarem em cima dos cliques) e termina com uma aproximação lenta, sem quadro parado;
// - cada legenda marcada com `com` passa a acompanhar a(s) frase(s) que ela resume;
// - os efeitos marcados no tempo da gravação viram tempo de tela.
import type { Plano } from './Montagem';
import { TRANSICAO } from './Montagem';

export interface FalaGravada {
  id: string;
  cena: string;
  arquivo: string;
  duracao: number;
  texto: string;
}

export interface FalaNoPlano extends FalaGravada {
  /** segundos desde o início do plano */
  inicio: number;
}

export const RESPIRO = 0.14;
const FOLGA = 0.5;
const VELOCIDADE_MINIMA = 0.6;
/** No 1º plano do capítulo a câmera fica presa à abertura até aqui (monitor abrindo); só o que vem depois acompanha a gravação. */
const FIM_ABERTURA = 6.6;

interface Opcoes {
  /** O 1º plano começa dentro do monitor da abertura do capítulo. */
  primeiroAbre?: boolean;
  duracaoClipe: Record<string, number>;
}

export function sincronizar(planos: Plano[], falas: FalaGravada[], { primeiroAbre = false, duracaoClipe }: Opcoes): Plano[] {
  return planos.map((p, i) => {
    const entrada = p.entrada ?? 'corte';
    const saiComTransicao = (planos[i + 1]?.entrada ?? 'corte') !== 'corte';
    const abre = i === 0 && primeiroAbre;

    let t = p.inicioFala ?? (abre ? 0.6 : entrada === 'corte' ? 0.3 : 0.55);
    const colocadas: FalaNoPlano[] = falas
      .filter((f) => f.cena === (p.id ?? p.clipe))
      .map((f) => {
        const c = { ...f, inicio: t };
        t += f.duracao + RESPIRO;
        return c;
      });
    const fimFala = colocadas.length ? t - RESPIRO : 0;
    const dur = Math.max(p.dur, fimFala + FOLGA + (saiComTransicao ? TRANSICAO / 30 : 0));

    const vel0 = p.velocidade ?? 1;
    // no lado-a-lado vale a menor das duas gravações
    const duracaoGravada = Math.min(duracaoClipe[p.clipe] ?? Number.POSITIVE_INFINITY, p.layout === 'lado-a-lado' ? (duracaoClipe[p.celular ?? ''] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY);
    const disponivel = duracaoGravada - p.de - 0.08;
    const vel = Math.max(VELOCIDADE_MINIMA, Math.min(vel0, disponivel / dur));
    const fator = vel0 / vel;
    const reescala = (tq: number) => (abre ? (tq <= FIM_ABERTURA ? tq : FIM_ABERTURA + (tq - FIM_ABERTURA) * fator) : tq * fator);

    // reescala os quadros-chave e fecha com aproximação lenta, se a câmera para antes do fim
    const reescalaCamera = (cam: Plano['camera']) => {
      let c = cam?.map((q) => ({ ...q, t: reescala(q.t) }));
      if (c && c.length) {
        const ultimo = c[c.length - 1];
        if (ultimo.t < dur - 0.8) c = [...c, { ...ultimo, t: dur, zoom: ultimo.zoom * 1.035 }];
      }
      return c;
    };
    const camera = reescalaCamera(p.camera);
    const cameraCelular = reescalaCamera(p.cameraCelular);

    const legendas = p.legendas?.map((l) => {
      const delas = l.com ? colocadas.filter((c) => l.com!.includes(c.id)) : [];
      if (!delas.length) return l;
      const caracteres = l.linhas.map((x) => x.texto).join(' ').length;
      const de = Math.max(delas[0].inicio - 0.1, l.naoAntes ?? 0);
      const fimDelas = delas[delas.length - 1].inicio + delas[delas.length - 1].duracao;
      const ate = Math.min(dur - 0.45 - (saiComTransicao ? TRANSICAO / 30 : 0), Math.max(fimDelas + 0.35, de + caracteres / 12));
      return { ...l, de, ate };
    });

    const efeitos = p.efeitos?.map((e) => ({ ...e, t: (e.src - p.de) / vel }));
    return { ...p, dur, velocidade: vel, camera, cameraCelular, legendas, efeitos, falas: colocadas };
  });
}
