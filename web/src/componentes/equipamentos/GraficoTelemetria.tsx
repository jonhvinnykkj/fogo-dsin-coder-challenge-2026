// Gráfico da telemetria das últimas 48 horas (Recharts). Mostra a métrica principal do tipo; se o tipo tem mais de uma,
// um seletor troca a métrica. Rótulos e unidades vêm de shared/telemetria.ts; o eixo de horas usa o fuso de São Paulo.
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDataHora, formatarNumero } from '../../../../shared/formato';
import type { PontoTelemetria } from '../../../../shared/modelos';
import { METRICAS_POR_TIPO, METRICA_PRINCIPAL } from '../../../../shared/telemetria';
import type { TipoEquipamentoId } from '../../../../shared/tipos-equipamento';
import { horaEDia } from '../../util/datas';
import { EstadoVazio } from '../base/EstadoVazio';
import estilos from './GraficoTelemetria.module.css';

interface Props {
  tipo: TipoEquipamentoId;
  pontos: PontoTelemetria[];
}

const casas = (n: number) => (Number.isInteger(n) ? 0 : 1);

/** Marcas do eixo de horas: a cada 6 h cheias em São Paulo (00h, 06h, 12h, 18h), sempre com a data: passos iguais e sem adivinhar o dia. */
const PASSO_DO_EIXO_H = 6;
export const marcasDoEixo = (horas: string[]) => horas.filter((h) => { const { hora, minuto } = horaEDia(h); return minuto === 0 && hora % PASSO_DO_EIXO_H === 0; });

/** Rótulo em duas linhas: "18h" e, embaixo, "22/10". */
function MarcaDoEixo({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (!payload) return null;
  const { hora, dia } = horaEDia(payload.value);
  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--cor-texto-suave)" fontSize={12}>
      <tspan x={x} dy={14}>{String(hora).padStart(2, '0')}h</tspan>
      <tspan x={x} dy={14} fillOpacity={0.8}>{dia}</tspan>
    </text>
  );
}

export function GraficoTelemetria({ tipo, pontos }: Props) {
  const metricas = METRICAS_POR_TIPO[tipo];
  const [chave, setChave] = useState(METRICA_PRINCIPAL[tipo]);
  const metrica = metricas.find((m) => m.chave === chave) ?? metricas[0]!;
  const porcentagem = metrica.unidade === '%';

  const dados = pontos.map((p) => ({ hora: p.hora, valor: p.metricas[metrica.chave] }));
  const valores = dados.map((d) => d.valor).filter((v): v is number => typeof v === 'number');

  if (pontos.length === 0 || valores.length === 0) {
    return <EstadoVazio titulo="Sem leituras nas últimas 48 horas" descricao="Quando o equipamento enviar sinais, o gráfico aparece aqui." />;
  }

  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const ultimo = valores[valores.length - 1]!;
  const maximo = Math.max(...valores);
  const un = metrica.unidade;

  return (
    <div className={estilos.grafico}>
      <div className={estilos.topo}>
        {metricas.length > 1 ? (
          <label className={estilos.seletor}>
            <span>Métrica</span>
            <select value={metrica.chave} onChange={(e) => setChave(e.target.value)}>
              {metricas.map((m) => <option key={m.chave} value={m.chave}>{m.rotulo}</option>)}
            </select>
          </label>
        ) : (
          <strong className={estilos.nome}>{metrica.rotulo}</strong>
        )}
        <dl className={estilos.resumo}>
          <div><dt>Último valor</dt><dd>{formatarNumero(ultimo, casas(ultimo))} {un}</dd></div>
          <div><dt>Média em 48 h</dt><dd>{formatarNumero(media, 1)} {un}</dd></div>
          <div><dt>Máximo</dt><dd>{formatarNumero(maximo, casas(maximo))} {un}</dd></div>
        </dl>
      </div>

      <div className={estilos.area} role="img" aria-label={`Gráfico de ${metrica.rotulo} (${un}) nas últimas 48 horas`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="preenchimento-telemetria" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--cor-fogo)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--cor-fogo)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--cor-superficie-baixa)" vertical={false} />
            <XAxis dataKey="hora" ticks={marcasDoEixo(dados.map((d) => d.hora))} interval={0} tick={<MarcaDoEixo />} tickLine={false} axisLine={false} height={42} />
            <YAxis
              width={52}
              domain={porcentagem ? [0, 100] : [0, 'auto']}
              tickFormatter={(v: number) => formatarNumero(v, casas(v))}
              tick={{ fill: 'var(--cor-texto-suave)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: 'var(--cor-texto-suave)', strokeDasharray: '4 4' }}
              content={({ active, payload }) => {
                const item = payload?.[0]?.payload as { hora: string; valor?: number } | undefined;
                if (!active || !item) return null;
                return (
                  <div className={estilos.dica}>
                    <span>{formatarDataHora(item.hora)}</span>
                    <strong>{item.valor === undefined ? 'Sem leitura' : `${formatarNumero(item.valor, casas(item.valor))} ${un}`}</strong>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="valor" stroke="var(--cor-fogo)" strokeWidth={2.5} fill="url(#preenchimento-telemetria)" dot={false} activeDot={{ r: 5, fill: 'var(--cor-fogo)', stroke: 'var(--cor-superficie)', strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
