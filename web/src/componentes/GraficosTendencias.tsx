// Tendências: disponibilidade de cada tipo nos últimos 30 dias com a projeção de 7 (quadros pequenos na mesma escala,
// linha cheia = medido, tracejada = projeção), uso de patinetes por bairro e falhas por 100 equipamentos de cada modelo.
import { ArrowDownRight, ArrowRight, ArrowUpRight } from '@phosphor-icons/react';
import { useSyncExternalStore } from 'react';
import { Bar, BarChart, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarNumero } from '../../../shared/formato';
import type { Tendencias } from '../../../shared/modelos';
import { tipoPorId } from '../../../shared/tipos-equipamento';
import { IconeTipo } from './IconeTipo';
import estilos from './GraficosTendencias.module.css';

const pct = (n: number) => `${formatarNumero(n, 1)}%`;
const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const MODELOS_NO_GRAFICO = 10;

/** Tela estreita (celular): eixo dos nomes mais curto e nomes longos abreviados. */
const ESTREITA = '(max-width: 720px)';
function useEstreita(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia?.(ESTREITA);
      m?.addEventListener('change', avisar);
      return () => m?.removeEventListener('change', avisar);
    },
    () => window.matchMedia?.(ESTREITA).matches ?? false,
    () => false,
  );
}
const abreviar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
/** Frota pequena: o próprio servidor avisa que a taxa varia muito (menos de 5 equipamentos). */
const FROTA_PEQUENA = 5;

export function GraficosTendencias({ tendencias }: { tendencias: Tendencias }) {
  return (
    <div className={estilos.tendencias}>
      <Disponibilidade itens={tendencias.disponibilidadePorTipo} />
      <div className={estilos.duas}>
        <Patinetes itens={tendencias.usoPatinetesPorBairro} />
        <FalhasPorModelo itens={tendencias.falhasPorModelo} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- disponibilidade

type ItemDisponibilidade = Tendencias['disponibilidadePorTipo'][number];

function Disponibilidade({ itens }: { itens: ItemDisponibilidade[] }) {
  // Mesma escala em todos os quadros (comparar tipos de olho é o ponto dos quadros pequenos).
  const minimo = Math.min(...itens.flatMap((i) => [...i.serie.map((p) => p.pct), i.projecao7d]), 100);
  const piso = Math.max(0, Math.floor((minimo - 1) / 5) * 5);
  const ordenados = [...itens].sort((a, b) => a.projecao7d - b.projecao7d);

  return (
    <section className={estilos.bloco} aria-labelledby="tendencia-disponibilidade">
      <div className={estilos.cabeca}>
        <h3 id="tendencia-disponibilidade" className={estilos.titulo}>Disponibilidade por tipo</h3>
        <p className={estilos.nota}>
          Últimos 30 dias e projeção para daqui a 7, do tipo que mais deve cair para o que menos. Todos os quadros vão de {piso}% a 100%.
        </p>
        <span className={estilos.chaves} aria-hidden="true">
          <span className={estilos.chave}><span className={estilos.amostraMedido} />Medido</span>
          <span className={estilos.chave}><span className={estilos.amostraProjecao} />Projeção</span>
        </span>
      </div>
      <ul className={estilos.quadros}>
        {ordenados.map((i) => <QuadroTipo key={i.tipo} item={i} piso={piso} />)}
      </ul>
    </section>
  );
}

interface PontoSerie {
  x: number;
  data: string;
  pct?: number;
  proj?: number;
}

function QuadroTipo({ item, piso }: { item: ItemDisponibilidade; piso: number }) {
  const ultimo = item.serie.length - 1;
  const hoje = item.serie[ultimo]?.pct ?? 0;
  const dados: PontoSerie[] = item.serie.map((p, x) => ({ x, data: p.data, pct: p.pct, ...(x === ultimo ? { proj: p.pct } : {}) }));
  dados.push({ x: ultimo + 7, data: '', proj: item.projecao7d });
  const diferenca = item.projecao7d - hoje;
  const Seta = diferenca <= -1 ? ArrowDownRight : diferenca >= 1 ? ArrowUpRight : ArrowRight;
  const nome = tipoPorId(item.tipo).rotulo;

  return (
    <li className={estilos.quadro}>
      <div className={estilos.nomeTipo} title={nome}><IconeTipo tipo={item.tipo} rotulo="curto" tamanho={16} /></div>
      <div className={estilos.numerosTipo}>
        <span className={estilos.valorTipo}>
          <span className={estilos.rotuloValor}>hoje</span>
          <strong className="numeros">{pct(hoje)}</strong>
        </span>
        <span className={estilos.valorTipo} data-queda={diferenca <= -1 || undefined}>
          <span className={estilos.rotuloValor}>em 7 dias</span>
          <strong className="numeros"><Seta weight="bold" size={14} aria-hidden="true" />{pct(item.projecao7d)}</strong>
        </span>
      </div>
      <div className={estilos.mini} role="img" aria-label={`${nome}: ${pct(hoje)} hoje; a reta dos 30 dias aponta ${pct(item.projecao7d)} daqui a 7 dias`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
            <XAxis dataKey="x" type="number" domain={[0, ultimo + 7]} hide />
            <YAxis domain={[piso, 100]} hide />
            <ReferenceLine x={ultimo} stroke="var(--cor-superficie-alta)" strokeWidth={1} />
            <Tooltip
              cursor={{ stroke: 'var(--cor-texto-suave)', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as PontoSerie | undefined;
                if (!active || !p) return null;
                const projecao = p.pct === undefined;
                return (
                  <div className={estilos.dica}>
                    <span>{projecao ? 'Projeção para daqui a 7 dias' : diaMes(p.data)}</span>
                    <strong>{pct(projecao ? p.proj! : p.pct!)}</strong>
                  </div>
                );
              }}
            />
            <Line dataKey="pct" stroke="var(--cor-texto)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            <Line dataKey="proj" stroke="var(--cor-fogo-texto)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- patinetes

function Patinetes({ itens }: { itens: Tendencias['usoPatinetesPorBairro'] }) {
  const estreita = useEstreita();
  const dados = [...itens].sort((a, b) => b.mediaDiaria - a.mediaDiaria);
  return (
    <section className={estilos.bloco} aria-labelledby="tendencia-patinetes">
      <div className={estilos.cabeca}>
        <h3 id="tendencia-patinetes" className={estilos.titulo}>Uso de patinetes por bairro</h3>
        <p className={estilos.nota}>Horas em uso por dia (média de 30 dias) e a variação da última semana contra a anterior.</p>
      </div>
      <div className={estilos.barras} style={{ height: dados.length * 30 + 8 }} role="img" aria-label={`Uso de patinetes por bairro: ${dados.map((d) => `${d.nome} ${formatarNumero(d.mediaDiaria, 1)} horas por dia`).join('; ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 0, right: estreita ? 96 : 112, bottom: 0, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="nome"
              width={estreita ? 108 : 150}
              tickFormatter={(t: string) => abreviar(t, estreita ? 14 : 22)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--cor-texto)', fontSize: estreita ? 12 : 13, fontWeight: 600 }}
              interval={0}
            />
            <Bar dataKey="mediaDiaria" fill="var(--cor-bloco-neutro)" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="mediaDiaria"
                content={(p) => {
                  const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p as { x?: number; y?: number; width?: number; height?: number; index?: number };
                  const d = dados[index];
                  if (!d) return null;
                  const sinal = d.variacaoPct > 0 ? '+' : d.variacaoPct < 0 ? '−' : '';
                  return (
                    <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={13}>
                      <tspan fill="var(--cor-texto)" fontWeight={800}>{formatarNumero(d.mediaDiaria, 1)} h</tspan>
                      <tspan dx={8} fill="var(--cor-texto-suave)" fontWeight={600}>{sinal}{formatarNumero(Math.abs(d.variacaoPct), 1)}%</tspan>
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- falhas por modelo

function FalhasPorModelo({ itens }: { itens: Tendencias['falhasPorModelo'] }) {
  const estreita = useEstreita();
  const dados = [...itens].sort((a, b) => b.falhasPor100 - a.falhasPor100).slice(0, MODELOS_NO_GRAFICO).map((m) => ({ ...m, rotulo: `${m.marca} ${m.modelo}` }));
  return (
    <section className={estilos.bloco} aria-labelledby="tendencia-modelos">
      <div className={estilos.cabeca}>
        <h3 id="tendencia-modelos" className={estilos.titulo}>Falhas por marca e modelo</h3>
        <p className={estilos.nota}>
          Falhas a cada 100 equipamentos nos últimos 60 dias; os {MODELOS_NO_GRAFICO} que mais falham de {itens.length} modelos. Em tom claro, frota com menos de {FROTA_PEQUENA} (varia muito).
        </p>
      </div>
      <div className={estilos.barras} style={{ height: dados.length * 30 + 8 }} role="img" aria-label={`Falhas por 100 equipamentos: ${dados.map((d) => `${d.rotulo} ${formatarNumero(d.falhasPor100, 0)}, frota de ${d.frota}`).join('; ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 0, right: estreita ? 96 : 112, bottom: 0, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="rotulo"
              width={estreita ? 120 : 170}
              tickFormatter={(t: string) => abreviar(t, estreita ? 16 : 26)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--cor-texto)', fontSize: estreita ? 12 : 13, fontWeight: 600 }}
              interval={0}
            />
            <Bar
              dataKey="falhasPor100"
              radius={[0, 2, 2, 0]}
              isAnimationActive={false}
              shape={(p: unknown) => {
                const { x, y, width, height, index } = p as { x: number; y: number; width: number; height: number; index: number };
                const pequena = (dados[index]?.frota ?? 0) < FROTA_PEQUENA;
                return <rect x={x} y={y} width={Math.max(0, width)} height={height} rx={2} fill={pequena ? 'var(--cor-texto-fraco)' : 'var(--cor-bloco-neutro)'} opacity={pequena ? 0.45 : 1} />;
              }}
            >
              <LabelList
                dataKey="falhasPor100"
                content={(p) => {
                  const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p as { x?: number; y?: number; width?: number; height?: number; index?: number };
                  const d = dados[index];
                  if (!d) return null;
                  return (
                    <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={13}>
                      <tspan fill="var(--cor-texto)" fontWeight={800}>{formatarNumero(d.falhasPor100, 0)}</tspan>
                      <tspan dx={6} fill="var(--cor-texto-suave)" fontWeight={600}>frota {d.frota}</tspan>
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
