// C — Sala de controle. A chave "Sala de controle" liga na faixa, o monitor acende (linha laranja que se abre em
// tela), os indicadores entram em placas de cor cheia contando até os valores reais e um anel vermelho pulsa no
// acidente. A câmera da tela começa abaixo da faixa de indicadores da captura (que é de outro momento).
import { Broadcast, Gauge, IdentificationBadge, TrafficCone } from '@phosphor-icons/react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Capitulo } from '../componentes/Capitulo';
import { FaixaTopo, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Indicador } from '../componentes/Indicador';
import { Legenda } from '../componentes/Legenda';
import { PlacaTela } from '../componentes/PlacaTela';
import { Pulso } from '../componentes/Pulso';
import { criticidade, curva, escuro, fonte, forma, marca, situacao } from '../tema';
import { progresso } from '../tempo';

const TELA = { src: 'telas/central-acidente-escuro-1366.png', largura: 1366, altura: 768 };
const MONITOR = { x: 720, y: 128, largura: 1128, faixa: 52, borda: 16 };
const TELA_L = MONITOR.largura - 2 * MONITOR.borda;
const TELA_A = Math.round((TELA_L * 768) / 1366);
/** Marcador do acidente no mapa, em px da captura. */
const ACIDENTE = { x: 612, y: 482 };
const ROTULO_CRITICIDADE = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;

export function EstiloC() {
  const frame = useCurrentFrame();
  const chave = progresso(frame, 4, 10, curva.app);
  const moldura = progresso(frame, 8, 16);
  const linha = progresso(frame, 14, 8);
  const liga = progresso(frame, 20, 14);

  return (
    <AbsoluteFill style={{ background: escuro.fundo, color: escuro.texto, fontFamily: fonte.familia, overflow: 'hidden' }}>
      <FaixaTopo tema={escuro} entrada={0} centro={<SubtituloFaixa tema={escuro} />} direita={<StatusFaixa tema={escuro} chave={chave} hora="17:44" segundos="10" />} />

      <div style={{ position: 'absolute', left: 72, top: 128 }}>
        <Capitulo estilo="sala" numero="2" linhas={['Central de', 'Operações']} inicio={6} tema={escuro} />
      </div>

      <div style={{ position: 'absolute', left: 72, top: 352, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Indicador valor={351} rotulo="Equipamentos" Icone={TrafficCone} fundo={escuro.blocoNeutro} cor={escuro.sobreBlocoNeutro} largura={600} altura={196} inicio={18} />
        <Indicador valor={96.1} casas={1} sufixo="%" rotulo="Disponibilidade" Icone={Gauge} fundo={marca.fogo} cor={marca.sobreFogo} largura={600} altura={196} inicio={26} />
        <Indicador valor={21} rotulo="Agentes em atividade" Icone={IdentificationBadge} fundo={escuro.blocoNeutro} cor={escuro.sobreBlocoNeutro} largura={600} altura={196} inicio={34} />
      </div>

      {/* monitor: moldura em degrau de tom (superfície grafite), faixa com "ao vivo" e a régua de criticidade */}
      <div
        style={{
          position: 'absolute',
          left: MONITOR.x,
          top: MONITOR.y,
          width: MONITOR.largura,
          boxSizing: 'border-box',
          padding: `0 ${MONITOR.borda}px ${MONITOR.borda}px`,
          borderRadius: forma.raio,
          background: escuro.superficie,
          clipPath: `inset(${(1 - moldura) * 50}% 0 ${(1 - moldura) * 50}% 0)`,
        }}
      >
        <div style={{ height: MONITOR.faixa, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 10px',
                borderRadius: forma.raio,
                background: situacao.operacional,
                color: '#1E1E1F',
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <Broadcast weight="fill" size={18} />
              Ao vivo
            </span>
            <span style={{ color: escuro.textoSuave, fontSize: 17, fontWeight: 600 }}>Central de Operações · Marília</span>
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
        <div style={{ position: 'relative', width: TELA_L, height: TELA_A, background: escuro.fundo }}>
          <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${(1 - liga) * 50}% 0 ${(1 - liga) * 50}% 0)` }}>
            <PlacaTela
              src={TELA.src}
              imgLargura={TELA.largura}
              imgAltura={TELA.altura}
              largura={TELA_L}
              altura={TELA_A}
              // só o mapa (x 253–987 da captura): sem a lateral nem o feed cortados, aviso "Alerta crítico" inteiro
              camera={[
                { f: 20, x: 0.4539, y: 0.552, zoom: 1.86 },
                { f: 120, x: 0.4597, y: 0.54, zoom: 1.95 },
              ]}
            >
              <Pulso {...ACIDENTE} de={10} ate={48} cor={criticidade.critica} espessura={3} inicio={30} periodo={22} vezes={4} />
            </PlacaTela>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: TELA_A / 2 - 3,
              width: `${linha * 100}%`,
              height: 6,
              background: marca.fogo,
              opacity: 1 - progresso(frame, 24, 8),
            }}
          />
        </div>
      </div>

      <div style={{ position: 'absolute', left: MONITOR.x, top: 862 }}>
        <Legenda
          estilo="marcador"
          tamanho={44}
          inicio={56}
          cor={escuro.texto}
          linhas={[{ texto: 'Se algo acontece na cidade agora,', destaque: 'agora' }, { texto: 'a central percebe.' }]}
        />
      </div>
    </AbsoluteFill>
  );
}
