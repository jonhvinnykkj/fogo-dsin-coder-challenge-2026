// Capítulo no estilo C ("Sala de controle"): abre com número, título e três placas de indicador contando até os
// valores reais, ao lado de um monitor que já mostra a gravação. Depois o monitor abre para a tela cheia (a faixa do
// vídeo sobe e a faixa do próprio app aparece na gravação) e seguem os planos com câmera e legendas.
import type { Icon } from '@phosphor-icons/react';
import { Broadcast } from '@phosphor-icons/react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Capitulo } from '../componentes/Capitulo';
import { ALTURA_FAIXA, FaixaTopo, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Indicador } from '../componentes/Indicador';
import { criticidade, curva, escuro, fonte, forma, marca, situacao, video } from '../tema';
import { mistura, progresso } from '../tempo';
import { linhaDoTempo, Montagem, type Plano, type Retangulo } from './Montagem';

export interface IndicadorCapitulo {
  valor: number;
  casas?: number;
  sufixo?: string;
  rotulo: string;
  Icone: Icon;
  destaque?: boolean;
}

interface Props {
  numero: string;
  linhas: string[];
  rotuloMonitor: string;
  indicadores: IndicadorCapitulo[];
  planos: Plano[];
}

/** Quanto a abertura fica parada antes de o monitor abrir, e quanto dura a abertura. */
export const ABERTURA_CAPITULO = 138;
const EXPANDE = 24;

const MONITOR = { x: 720, y: 128, largura: 1128, faixa: 52, borda: 16 };
const TELA: Retangulo = {
  x: MONITOR.x + MONITOR.borda,
  y: MONITOR.y + MONITOR.faixa,
  largura: MONITOR.largura - 2 * MONITOR.borda,
  altura: Math.round(((MONITOR.largura - 2 * MONITOR.borda) * 1080) / 1920),
};
const ROTULO_CRITICIDADE = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;

export const duracaoCapitulo = (planos: Plano[]) => linhaDoTempo(planos).total;

export function CenaCapitulo({ numero, linhas, rotuloMonitor, indicadores, planos }: Props) {
  const frame = useCurrentFrame();
  const abre = progresso(frame, ABERTURA_CAPITULO, EXPANDE, curva.camera);
  const liga = progresso(frame, 6, 16);
  const tela: Retangulo = {
    x: mistura(TELA.x, 0, abre),
    y: mistura(TELA.y, 0, abre),
    largura: mistura(TELA.largura, video.largura, abre),
    altura: mistura(TELA.altura, video.altura, abre),
  };
  const borda = MONITOR.borda * (1 - abre);
  const faixaMonitor = MONITOR.faixa * (1 - abre);
  const sai = progresso(frame, ABERTURA_CAPITULO, EXPANDE * 0.8, curva.saida);

  return (
    <AbsoluteFill style={{ background: escuro.fundo, color: escuro.texto, fontFamily: fonte.familia }}>
      {abre < 1 && (
        <>
          <div style={{ position: 'absolute', left: 72, top: 128, translate: `${-sai * 760}px 0` }}>
            <Capitulo estilo="sala" numero={numero} linhas={linhas} inicio={4} tema={escuro} />
          </div>
          <div style={{ position: 'absolute', left: 72, top: 352, display: 'flex', flexDirection: 'column', gap: 14, translate: `${-sai * 760}px 0` }}>
            {indicadores.map((ind, i) => (
              <Indicador
                key={ind.rotulo}
                valor={ind.valor}
                casas={ind.casas}
                sufixo={ind.sufixo}
                rotulo={ind.rotulo}
                Icone={ind.Icone}
                fundo={ind.destaque ? marca.fogo : escuro.blocoNeutro}
                cor={ind.destaque ? marca.sobreFogo : escuro.sobreBlocoNeutro}
                largura={600}
                altura={196}
                inicio={14 + i * 8}
                duracao={40}
              />
            ))}
          </div>
          {/* moldura do monitor: some para fora da tela enquanto a gravação abre */}
          <div
            style={{
              position: 'absolute',
              left: tela.x - borda,
              top: tela.y - faixaMonitor,
              width: tela.largura + 2 * borda,
              height: tela.altura + faixaMonitor + borda,
              borderRadius: forma.raio,
              background: escuro.superficie,
              clipPath: `inset(${(1 - liga) * 50}% 0 ${(1 - liga) * 50}% 0)`,
            }}
          >
            <div
              style={{
                height: faixaMonitor,
                padding: `0 ${borda}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                overflow: 'hidden',
                opacity: 1 - sai,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: forma.raio, background: situacao.operacional, color: '#1E1E1F', fontSize: 15, fontWeight: 800 }}>
                  <Broadcast weight="fill" size={18} />
                  Ao vivo
                </span>
                <span style={{ color: escuro.textoSuave, fontSize: 17, fontWeight: 600 }}>{rotuloMonitor}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                {(Object.keys(ROTULO_CRITICIDADE) as (keyof typeof ROTULO_CRITICIDADE)[]).map((nivel) => (
                  <span key={nivel} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: escuro.textoSuave, fontSize: 16, fontWeight: 700 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: criticidade[nivel] }} />
                    {ROTULO_CRITICIDADE[nivel]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <AbsoluteFill style={{ clipPath: abre > 0 ? undefined : `inset(${TELA.y + (1 - progresso(frame, 16, 14)) * (TELA.altura / 2)}px ${video.largura - TELA.x - TELA.largura}px ${video.altura - TELA.y - TELA.altura + (1 - progresso(frame, 16, 14)) * (TELA.altura / 2)}px ${TELA.x}px)` }}>
        <Montagem planos={planos} retanguloPrimeiro={() => tela} />
      </AbsoluteFill>
      {/* faixa do vídeo: igual à do app; sobe quando a gravação (que tem a própria faixa) toma a tela */}
      {abre < 1 && (
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: ALTURA_FAIXA, translate: `0 ${-abre * ALTURA_FAIXA}px`, zIndex: 10 }}>
          <FaixaTopo tema={escuro} centro={<SubtituloFaixa tema={escuro} />} direita={<StatusFaixa tema={escuro} chave={1} hora="" segundos="" mostrarRelogio={false} />} />
        </div>
      )}
    </AbsoluteFill>
  );
}
