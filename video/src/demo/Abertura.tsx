// Abertura: uma linha laranja abre e vira a placa da marca no centro; o nome por extenso aparece com as iniciais
// F, O, G, O em laranja; depois a placa encolhe e "encaixa" no canto da faixa, exatamente onde ela fica no app.
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ALTURA_FAIXA, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Marca } from '../componentes/Marca';
import { curva, escuro, fonte, marca } from '../tema';
import { mistura, progresso } from '../tempo';

export const DURACAO_ABERTURA = 180;

const NOME = ['Ferramenta', 'Onisciente', 'de', 'Gestão', 'e', 'Operações'];
const INICIAIS = new Set([0, 1, 3, 5]);
const ESCALA = 3.8;

export function Abertura() {
  const frame = useCurrentFrame();
  const linha = progresso(frame, 2, 12);
  const bloco = progresso(frame, 12, 16);
  const doca = progresso(frame, 118, 32, curva.camera);
  const faixa = progresso(frame, 126, 22);
  const sai = progresso(frame, 150, 18, curva.saida);
  const escala = mistura(ESCALA, 1, doca);
  // grande, a placa abraça o texto (238 px = respiro igual dos dois lados); encaixada, volta aos 326 px do app
  const largura = mistura(238, 326, doca);
  const x = mistura((1920 - 238 * ESCALA) / 2, 0, doca);
  const y = mistura(236, 0, doca);

  return (
    <AbsoluteFill style={{ background: escuro.fundo, color: escuro.texto, fontFamily: fonte.familia }}>
      {/* faixa do app chegando por trás da placa */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: ALTURA_FAIXA,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '0 24px 0 350px',
          background: escuro.faixa,
          color: escuro.sobreFaixa,
          translate: `0 ${(faixa - 1) * ALTURA_FAIXA}px`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <SubtituloFaixa tema={escuro} />
        </div>
        <StatusFaixa tema={escuro} chave={1} mostrarRelogio={false} />
      </div>

      {/* nome por extenso e evento */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 596, textAlign: 'center', clipPath: `inset(0 ${sai * 100}% 0 0)` }}>
        <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
          {NOME.map((palavra, i) => {
            const p = progresso(frame, 30 + i * 4, 16);
            return (
              <span key={palavra} style={{ display: 'inline-block', opacity: p, translate: `0 ${mistura(0.5, 0, p)}em`, marginRight: '0.24em' }}>
                {INICIAIS.has(i) ? (
                  <>
                    <span style={{ color: marca.fogoTextoEscuro }}>{palavra[0]}</span>
                    {palavra.slice(1)}
                  </>
                ) : (
                  palavra
                )}
              </span>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 30,
            color: escuro.textoSuave,
            fontSize: 30,
            fontWeight: 800,
            fontStretch: fonte.expandida,
            letterSpacing: `${mistura(0.4, 0.16, progresso(frame, 56, 30))}em`,
            textTransform: 'uppercase',
            opacity: progresso(frame, 56, 14),
          }}
        >
          Marília-SP · DSIN Coder Challenge 2026
        </div>
      </div>

      {/* a placa da marca: abre do centro e encaixa na faixa (mesmo componente do canto do app, só escalado) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${x}px, ${y}px) scale(${escala})`,
          clipPath: `inset(${(1 - bloco) * 48}% ${(1 - linha) * 50}% ${(1 - bloco) * 48}% ${(1 - linha) * 50}%)`,
          zIndex: 5,
        }}
      >
        <Marca largura={largura} />
      </div>
    </AbsoluteFill>
  );
}
