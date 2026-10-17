// Feed de alertas da Central: críticos primeiro e em placa vermelha, o resto do mais novo para o mais velho, "há X min",
// Reconhecer/Resolver e clique no título para levar o mapa até o alerta. Alerta que chega com a tela aberta pisca 3 s; se for crítico, a Central mostra um aviso.
import { MapPin, Tray } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { formatarRelativo } from '../../../shared/formato';
import type { Alerta } from '../../../shared/modelos';
import { mensagemDeErro } from '../api/cliente';
import { useReconhecerAlerta, useResolverAlerta } from '../api/consultas';
import { useAgora } from '../util/useAgora';
import { Botao } from './Botao';
import { EstadoVazio } from './EstadoVazio';
import { EtiquetaCriticidade, ordenarParaFeed, TipoAlerta } from './EtiquetaAlerta';
import estilos from './FeedAlertas.module.css';

const PISCAR_MS = 3000;

interface Props {
  alertas: Alerta[] | undefined;
  carregando?: boolean;
  /** Nome do bairro pelo id (vem do cache de bairros). */
  nomeDoBairro?: (id: number) => string | undefined;
  /** Clique no título: centralizar o mapa no alerta. */
  onSelecionar?: (alerta: Alerta) => void;
  /** Alerta crítico que chegou com a tela aberta (os da primeira carga não contam). */
  onNovoCritico?: (alerta: Alerta) => void;
  /** Todos os alertas que chegaram de uma vez com a tela aberta (para o mapa destacar os bairros). */
  onNovos?: (alertas: Alerta[]) => void;
  /** Quantos mostrar (o resto fica na tela de Alertas). */
  limite?: number;
  /** Alerta que o usuário acabou de provocar ("Injetar evento"): o feed rola até ele. */
  focoId?: number;
  /** Relógio fixo (testes); sem ele, anda sozinho a cada 30 s. */
  agora?: Date;
}

/** Ids que chegaram depois da primeira carga, cada um marcado por 3 s. */
function useAlertasNovos(alertas: Alerta[] | undefined, aoChegar: (novos: Alerta[]) => void): ReadonlySet<number> {
  const conhecidos = useRef<Set<number> | null>(null);
  const [novos, setNovos] = useState<ReadonlySet<number>>(new Set());
  const relogios = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const aoChegarRef = useRef(aoChegar);
  useEffect(() => {
    aoChegarRef.current = aoChegar; // roda antes do efeito abaixo: sempre a função mais nova
  });

  useEffect(() => {
    if (!alertas) return;
    if (conhecidos.current === null) {
      conhecidos.current = new Set(alertas.map((a) => a.id));
      return;
    }
    const chegaram = alertas.filter((a) => !conhecidos.current!.has(a.id));
    if (!chegaram.length) return;
    for (const a of chegaram) conhecidos.current.add(a.id);
    setNovos((atual) => new Set([...atual, ...chegaram.map((a) => a.id)]));
    for (const a of chegaram) {
      clearTimeout(relogios.current.get(a.id));
      relogios.current.set(a.id, setTimeout(() => {
        relogios.current.delete(a.id);
        setNovos((atual) => {
          const sem = new Set(atual);
          sem.delete(a.id);
          return sem;
        });
      }, PISCAR_MS));
    }
    aoChegarRef.current(chegaram);
  }, [alertas]);

  useEffect(() => {
    const ativos = relogios.current;
    return () => {
      for (const t of ativos.values()) clearTimeout(t);
    };
  }, []);

  return novos;
}

export function FeedAlertas({ alertas, carregando = false, nomeDoBairro, onSelecionar, onNovoCritico, onNovos, limite = 40, focoId, agora: agoraFixo }: Props) {
  const relogio = useAgora(30_000);
  const lista = useRef<HTMLOListElement>(null);
  const temFoco = focoId !== undefined && Boolean(alertas?.some((a) => a.id === focoId));
  useEffect(() => {
    if (!temFoco) return;
    lista.current?.querySelector(`[data-id="${focoId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focoId, temFoco]);
  const agora = agoraFixo ?? relogio;
  const reconhecer = useReconhecerAlerta();
  const resolver = useResolverAlerta();

  const novos = useAlertasNovos(alertas, (chegaram) => {
    onNovos?.(chegaram);
    for (const a of chegaram) if (a.criticidade === 'critica') onNovoCritico?.(a);
  });

  if (carregando && !alertas) {
    return (
      <div className={estilos.feed} aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className={estilos.esqueleto} />)}
      </div>
    );
  }

  if (!alertas?.length) {
    return (
      <EstadoVazio
        titulo="Nenhum alerta aberto"
        descricao="Quando um equipamento falhar ou algo acontecer na cidade, o alerta aparece aqui na hora."
        icone={<Tray weight="fill" />}
      />
    );
  }

  const ordenados = ordenarParaFeed(alertas).slice(0, limite);
  const ocupado = (id: number) => (reconhecer.isPending && reconhecer.variables === id) || (resolver.isPending && resolver.variables === id);
  const erro = reconhecer.error ?? resolver.error;

  return (
    <div className={estilos.feed}>
      {erro && (
        <p className={estilos.erro} role="alert">
          Não foi possível atualizar o alerta: {mensagemDeErro(erro)}
        </p>
      )}
      <ol ref={lista} className={estilos.lista} aria-label="Alertas abertos, críticos primeiro e depois os mais novos">
        {ordenados.map((a) => {
          const bairro = a.bairroId !== undefined ? nomeDoBairro?.(a.bairroId) : undefined;
          return (
            <li
              key={a.id}
              className={`${estilos.item} ${estilos[a.criticidade]} ${a.reconhecidoEm ? estilos.reconhecido : ''}`}
              data-id={a.id}
              data-novo={novos.has(a.id) ? 'true' : 'false'}
            >
              <div className={estilos.topo}>
                <EtiquetaCriticidade criticidade={a.criticidade} invertida={a.criticidade === 'critica'} />
                <span className={estilos.tipo}><TipoAlerta tipo={a.tipo} tamanho={14} /></span>
                <time className={estilos.quando} dateTime={a.criadoEm}>{formatarRelativo(a.criadoEm, agora)}</time>
              </div>
              <button type="button" className={estilos.titulo} onClick={() => onSelecionar?.(a)} title={a.descricao}>
                {a.titulo}
              </button>
              <div className={estilos.rodape}>
                <span className={estilos.local}>
                  {bairro && (
                    <>
                      <MapPin weight="fill" size={14} aria-hidden="true" />
                      <span className={estilos.nomeLocal} title={bairro}>{bairro}</span>
                    </>
                  )}
                  {a.reconhecidoEm && <span className={estilos.marca}>Reconhecido</span>}
                </span>
                <span className={estilos.acoes}>
                  {!a.reconhecidoEm && (
                    <Botao tamanho="pequeno" disabled={ocupado(a.id)} onClick={() => reconhecer.mutate(a.id)}>
                      Reconhecer
                    </Botao>
                  )}
                  <Botao tamanho="pequeno" disabled={ocupado(a.id)} onClick={() => resolver.mutate(a.id)}>
                    Resolver
                  </Botao>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
