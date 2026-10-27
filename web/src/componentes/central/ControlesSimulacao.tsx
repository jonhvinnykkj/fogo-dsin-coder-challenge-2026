// Controles da demonstração, no canto do mapa (no celular, encaixados numa barra embaixo dele): velocidade da simulação (1×, 10×, 60×), pausar/retomar e
// "Injetar evento" (furto, falha, acidente, alagamento, congestionamento) para a comissão ver a cidade reagir.
import {
  CarProfile, Drop, HandGrabbing, HourglassMedium, Lightning, Pause, Play, Plugs, type Icon,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  DESCRICAO_EVENTO_SIMULADO, ROTULO_EVENTO_SIMULADO, TIPOS_EVENTO_SIMULADO, type TipoEventoSimulado,
} from '../../../../shared/dominio';
import type { Alerta, EstadoSimulacao } from '../../../../shared/modelos';
import { mensagemDeErro } from '../../api/cliente';
import { useDefinirSimulacao, useInjetarEvento, useSimulacao } from '../../api/consultas';
import estilos from './ControlesSimulacao.module.css';
import { usePode } from '../../sessao/Sessao';

const ICONE_EVENTO: Record<TipoEventoSimulado, Icon> = {
  furto: HandGrabbing,
  falha: Plugs,
  acidente: CarProfile,
  alagamento: Drop,
  congestionamento: HourglassMedium,
};

const VELOCIDADES: EstadoSimulacao['velocidade'][] = [1, 10, 60];
const CONFIRMACAO_MS = 5000;

interface Props {
  /** Depois que o servidor criou o evento: a Central leva o mapa até ele. */
  onInjetado?: (tipo: TipoEventoSimulado, alertas: Alerta[]) => void;
  /**
   * Barra na largura toda, no fluxo da página (a Central a põe logo abaixo do mapa no celular). Flutuando sobre o
   * mapa ela ficava fora da tela e o dedo que tentava rolar até ela arrastava o mapa.
   */
  encaixado?: boolean;
}

export function ControlesSimulacao({ onInjetado, encaixado = false }: Props) {
  const podeSimular = usePode('simular');
  const { data: simulacao } = useSimulacao();
  const definir = useDefinirSimulacao();
  const injetar = useInjetarEvento();
  const [menuAberto, setMenuAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const idMenu = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  // Menu fecha no Esc (foco volta ao botão) e ao clicar fora.
  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setMenuAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAberto(false);
        botaoMenu.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [menuAberto]);

  useEffect(() => {
    if (!confirmacao) return;
    const t = setTimeout(() => setConfirmacao(null), CONFIRMACAO_MS);
    return () => clearTimeout(t);
  }, [confirmacao]);

  const disparar = (tipo: TipoEventoSimulado) => {
    setMenuAberto(false);
    botaoMenu.current?.focus();
    injetar.mutate({ tipo }, {
      onSuccess: ({ alertas }) => {
        const principal = alertas[0];
        setConfirmacao(principal ? principal.titulo : `${ROTULO_EVENTO_SIMULADO[tipo]} simulado. O alerta chega quando o sensor confirmar.`);
        onInjetado?.(tipo, alertas);
      },
    });
  };

  const pausado = simulacao?.pausado ?? false;

  // Velocidade, pausa e eventos mudam a cidade de todos: só o gestor (o servidor também confere).
  if (!podeSimular) return null;

  return (
    <div className={estilos.controles} ref={raiz} data-encaixado={encaixado || undefined}>
      <div className={estilos.barra} role="group" aria-label="Controles da simulação">
        <div className={estilos.velocidades} role="group" aria-label="Velocidade da simulação">
          {VELOCIDADES.map((v) => (
            <button
              key={v}
              type="button"
              className={estilos.velocidade}
              aria-pressed={simulacao?.velocidade === v}
              disabled={!simulacao || definir.isPending}
              onClick={() => definir.mutate({ velocidade: v })}
              title={v === 1 ? 'Ritmo real da cidade' : `Acontecimentos ${v} vezes mais rápidos`}
            >
              <span className="numeros">{v}×</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={estilos.acao}
          disabled={!simulacao || definir.isPending}
          onClick={() => definir.mutate({ pausado: !pausado })}
        >
          {pausado ? <Play weight="fill" size={16} aria-hidden="true" /> : <Pause weight="fill" size={16} aria-hidden="true" />}
          <span className={estilos.rotuloAcao}>{pausado ? 'Retomar' : 'Pausar'}</span>
        </button>
        <button
          ref={botaoMenu}
          type="button"
          className={`${estilos.acao} ${estilos.injetar}`}
          aria-expanded={menuAberto}
          aria-controls={idMenu}
          disabled={injetar.isPending}
          onClick={() => setMenuAberto((a) => !a)}
        >
          <Lightning weight="fill" size={16} aria-hidden="true" />
          {injetar.isPending ? 'Injetando…' : 'Injetar evento'}
        </button>
      </div>

      {menuAberto && (
        <ul id={idMenu} className={estilos.menu} aria-label="Evento para injetar na cidade">
          {TIPOS_EVENTO_SIMULADO.map((tipo) => {
            const Icone = ICONE_EVENTO[tipo];
            return (
              <li key={tipo}>
                <button type="button" className={estilos.opcao} onClick={() => disparar(tipo)}>
                  <Icone weight="fill" size={18} aria-hidden="true" />
                  <span>
                    <strong>{ROTULO_EVENTO_SIMULADO[tipo]}</strong>
                    <span>{DESCRICAO_EVENTO_SIMULADO[tipo]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div role="status" aria-live="polite" className={estilos.retorno}>
        {injetar.isError ? (
          <span className={estilos.erro}>Não foi possível injetar: {mensagemDeErro(injetar.error)}</span>
        ) : definir.isError ? (
          <span className={estilos.erro}>Não foi possível mudar a simulação: {mensagemDeErro(definir.error)}</span>
        ) : confirmacao ? (
          <span className={estilos.ok}>
            <Lightning weight="fill" size={14} aria-hidden="true" />
            {confirmacao}
          </span>
        ) : null}
      </div>
    </div>
  );
}
