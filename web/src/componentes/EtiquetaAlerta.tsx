// Peças dos alertas usadas pelo feed da Central e pela tela de Alertas: criticidade como placa de cor cheia,
// ícone + nome do tipo e a ordem "críticos primeiro".
import {
  CarProfile, ChartLineUp, Drop, HandGrabbing, HourglassMedium, Plugs, Pulse, WarningDiamond, WifiSlash, Wrench, type Icon,
} from '@phosphor-icons/react';
import { COR_CRITICIDADE, ROTULO_CRITICIDADE, rotuloTipoAlerta, type Criticidade } from '../../../shared/dominio';
import type { Alerta } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import estilos from './EtiquetaSituacao.module.css';
import estilosTipo from './IconeTipo.module.css';

const ICONE_TIPO_ALERTA: Record<string, Icon> = {
  acidente: CarProfile,
  alagamento: Drop,
  furto_suspeito: HandGrabbing,
  falha_equipamento: Plugs,
  sem_sinal: WifiSlash,
  anomalia_leitura: Pulse,
  congestionamento: HourglassMedium,
  manutencao_atrasada: Wrench,
  falha_provavel: ChartLineUp,
};

export function iconeDoTipoAlerta(tipo: string): Icon {
  return ICONE_TIPO_ALERTA[tipo] ?? WarningDiamond;
}

export function TipoAlerta({ tipo, tamanho = 16 }: { tipo: string; tamanho?: number }) {
  const Icone = iconeDoTipoAlerta(tipo);
  return (
    <span className={estilosTipo.tipo}>
      <Icone weight="fill" size={tamanho} aria-hidden="true" />
      <span>{rotuloTipoAlerta(tipo)}</span>
    </span>
  );
}

interface PropsCriticidade {
  criticidade: Criticidade;
  tamanho?: 'normal' | 'compacta';
  /** Sobre um bloco da mesma cor (alerta crítico em placa vermelha): fundo branco e texto na cor. */
  invertida?: boolean;
}

export function EtiquetaCriticidade({ criticidade, tamanho = 'compacta', invertida = false }: PropsCriticidade) {
  const cor = COR_CRITICIDADE[criticidade];
  const estilo = invertida
    ? { backgroundColor: '#FFFFFF', color: '#A3170D', borderColor: '#FFFFFF', borderStyle: 'solid' }
    : { backgroundColor: cor, color: corDoTexto(cor), borderColor: cor, borderStyle: 'solid' };
  return (
    <span className={`${estilos.etiqueta} ${tamanho === 'compacta' ? estilos.compacta : ''}`} data-criticidade={criticidade} style={estilo}>
      {ROTULO_CRITICIDADE[criticidade]}
    </span>
  );
}

const ORDEM_CRITICIDADE: Record<Criticidade, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

const maisRecente = (a: Alerta, b: Alerta) => b.criadoEm.localeCompare(a.criadoEm) || b.id - a.id;

/**
 * Ordem do feed ao vivo: os críticos no topo (os que ninguém reconheceu primeiro); abaixo deles, o resto do mais novo
 * para o mais velho, para o que acabou de acontecer aparecer logo — a criticidade de cada um está na barra colorida.
 */
export function ordenarParaFeed(alertas: readonly Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    const ca = a.criticidade === 'critica' ? 0 : 1;
    const cb = b.criticidade === 'critica' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (ca === 0) return Number(Boolean(a.reconhecidoEm)) - Number(Boolean(b.reconhecidoEm)) || maisRecente(a, b);
    return maisRecente(a, b);
  });
}

/** Ordem de triagem (tabela de Alertas, ficha): por criticidade; dentro dela, o não reconhecido e depois o mais recente. */
export function ordenarAlertas(alertas: readonly Alerta[]): Alerta[] {
  return [...alertas].sort(
    (a, b) =>
      ORDEM_CRITICIDADE[a.criticidade] - ORDEM_CRITICIDADE[b.criticidade]
      || Number(Boolean(a.reconhecidoEm)) - Number(Boolean(b.reconhecidoEm))
      || b.criadoEm.localeCompare(a.criadoEm)
      || b.id - a.id,
  );
}
