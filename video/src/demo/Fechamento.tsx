// Fechamento: como foi feito (IA declarada), a stack numa linha, os dois jeitos de rodar e a marca.
// `equipe` fica vazia por padrão: os nomes entram depois, pela prop, sem mexer no layout.
import { TerminalWindow } from '@phosphor-icons/react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { FaixaTopo, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Marca } from '../componentes/Marca';
import { Revelar } from '../componentes/Revelar';
import { curva, escuro, fonte, forma, marca } from '../tema';
import { mistura, progresso } from '../tempo';

export const DURACAO_FECHAMENTO = 240;

const STACK = 'React · TypeScript · Vite · Fastify · SQLite · Leaflet · Recharts';
const COMANDOS = ['npm install && npm start', 'docker compose up'];

export function Fechamento({ equipe = [] }: { equipe?: string[] }) {
  const frame = useCurrentFrame();
  const placa = progresso(frame, 20, 26, curva.entrada);
  return (
    <AbsoluteFill style={{ background: escuro.fundo, color: escuro.texto, fontFamily: fonte.familia }}>
      <FaixaTopo tema={escuro} centro={<SubtituloFaixa tema={escuro} />} direita={<StatusFaixa tema={escuro} chave={1} mostrarRelogio={false} />} />

      <div style={{ position: 'absolute', left: 120, top: 210 }}>
        <Revelar inicio={6} duracao={14}>
          <div style={{ color: escuro.fogoTexto, fontSize: 26, fontWeight: 800, fontStretch: fonte.expandida, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Feito com</div>
        </Revelar>
        <Revelar inicio={10} duracao={18}>
          <div style={{ marginTop: 10, fontSize: 132, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.96 }}>Claude Code</div>
        </Revelar>
        <Revelar inicio={18} duracao={16}>
          <div style={{ marginTop: 14, color: escuro.textoSuave, fontSize: 34, fontWeight: 700 }}>IA declarada no README</div>
        </Revelar>

        <div style={{ marginTop: 64, color: escuro.textoSuave, fontSize: 30, fontWeight: 700, opacity: progresso(frame, 34, 14), translate: `0 ${mistura(16, 0, progresso(frame, 34, 18))}px` }}>{STACK}</div>

        <div style={{ marginTop: 26, display: 'flex', gap: 16 }}>
          {COMANDOS.map((comando, i) => {
            const p = progresso(frame, 46 + i * 8, 16);
            return (
              <div
                key={comando}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 14,
                  height: 76,
                  padding: '0 26px',
                  borderRadius: forma.raio,
                  background: escuro.superficie,
                  fontSize: 34,
                  fontWeight: 800,
                  clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
                }}
              >
                <TerminalWindow weight="fill" size={34} color={marca.fogo} />
                {comando}
              </div>
            );
          })}
        </div>

        {equipe.length > 0 && (
          <div style={{ marginTop: 40, fontSize: 30, fontWeight: 700, opacity: progresso(frame, 64, 14) }}>
            <span style={{ color: escuro.textoSuave }}>Equipe: </span>
            {equipe.join(' · ')}
          </div>
        )}
      </div>

      {/* a marca grande, de volta ao centro da cena */}
      <div style={{ position: 'absolute', right: 120, bottom: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ transformOrigin: '100% 100%', scale: `${mistura(2.1, 2.5, placa)}`, clipPath: `inset(0 0 0 ${(1 - placa) * 100}%)` }}>
          <Marca />
        </div>
        <div style={{ color: escuro.textoSuave, fontSize: 24, fontWeight: 800, fontStretch: fonte.expandida, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: progresso(frame, 40, 14) }}>
          Marília-SP · DSIN Coder Challenge 2026
        </div>
      </div>
    </AbsoluteFill>
  );
}
