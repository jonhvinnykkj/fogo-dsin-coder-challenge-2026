// Teste retroativo do risco: "se o mapa tivesse sido usado nas últimas 2 semanas, quanto teria acertado?".
// Números grandes, a frase com os campos do servidor (na unidade certa: por bairro a cada 3 horas; o acerto dos 5 na janela
// da noite, 18h–2h) e o erro de cada dia do modelo contra o da média simples.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarNumero } from '../../../shared/formato';
import type { ResultadoBacktest } from '../../../shared/modelos';
import { BlocoIndicador } from './BlocoIndicador';
import estilos from './CartaoBacktest.module.css';

const n1 = (n: number) => formatarNumero(n, 1);
const n2 = (n: number) => formatarNumero(n, 2);

/** A frase do teste retroativo, montada só com os campos da resposta. */
export function fraseBacktest(r: ResultadoBacktest): string {
  const periodo = r.dias === 14 ? 'Nas últimas 2 semanas' : `Nos últimos ${r.dias} dias`;
  const ganho = r.ganhoPct >= 0 ? `${n1(r.ganhoPct)}% melhor` : `${n1(-r.ganhoPct)}% pior`;
  return `${periodo}, o modelo errou em média ${n2(r.maeModelo)} ocorrências por bairro a cada 3 horas, contra ${n2(r.maeIngenuo)} de uma média simples (${ganho}). `
    + `Dos 5 bairros apontados como mais arriscados à noite (18h–2h), em média ${n1(r.acertoTop5Medio)} de fato foram — a média simples acertaria ${n1(r.acertoTop5IngenuoMedio)}.`;
}

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Dia da semana de uma data de calendário (sem fuso: "2026-10-03" é sábado em qualquer lugar). */
const diaSemana = (data: string) => SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]!;

interface PontoDia {
  data: string;
  rotulo: string;
  modelo: number;
  simples: number;
  acerto: number;
  acertoSimples: number;
}

export function CartaoBacktest({ resultado: r }: { resultado: ResultadoBacktest }) {
  const dados: PontoDia[] = r.porDia.map((d) => ({
    data: d.data,
    rotulo: diaMes(d.data),
    modelo: d.mae,
    simples: d.maeIngenuo,
    acerto: d.acertoTop5,
    acertoSimples: d.acertoTop5Ingenuo,
  }));
  const melhorou = r.ganhoPct >= 0;
  // Eixo em passos de 0,05 que cobrem os dois erros (marcas redondas: 0,45 · 0,50 · 0,55…).
  const erros = dados.flatMap((d) => [d.modelo, d.simples]);
  const piso = Math.floor(Math.min(...erros, 1) * 20) / 20;
  const teto = Math.ceil(Math.max(...erros, 0) * 20) / 20;
  const marcas = Array.from({ length: Math.round((teto - piso) * 20) + 1 }, (_, i) => Math.round((piso + i * 0.05) * 100) / 100);
  const periodo = r.dias === 14 ? 'nas últimas 2 semanas' : `nos últimos ${r.dias} dias`;

  return (
    <div className={estilos.cartao}>
      <div className={estilos.placas}>
        <BlocoIndicador
          cor={melhorou ? 'marca' : '#D92D20'}
          valor={`${n1(Math.abs(r.ganhoPct))}%`}
          rotulo={melhorou ? 'menos erro que a média simples' : 'mais erro que a média simples'}
          detalhe="por bairro, a cada 3 horas"
        />
        <BlocoIndicador cor="neutro" valor={n2(r.maeModelo)} rotulo="erro médio do modelo" detalhe={`média simples: ${n2(r.maeIngenuo)}`} />
        <BlocoIndicador
          cor="neutro"
          valor={`${n1(r.acertoTop5Medio)} de 5`}
          rotulo="bairros mais arriscados à noite acertados"
          detalhe={`média simples: ${n1(r.acertoTop5IngenuoMedio)}`}
        />
      </div>

      <p className={estilos.frase}>{fraseBacktest(r)}</p>

      <figure className={estilos.figura}>
        <figcaption className={estilos.legenda}>
          <span className={estilos.tituloGrafico}>Erro de cada dia</span>
          <span className={estilos.chave}><span className={estilos.amostraModelo} aria-hidden="true" />Modelo</span>
          <span className={estilos.chave}><span className={estilos.amostraSimples} aria-hidden="true" />Média simples</span>
          <span className={estilos.nota}>ocorrências por bairro a cada 3 horas; quanto mais baixo, melhor</span>
        </figcaption>
        <div className={estilos.grafico} role="img" aria-label={`Erro por dia ${periodo}: modelo × média simples`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--cor-superficie-baixa)" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fill: 'var(--cor-texto-suave)', fontSize: 12 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis
                width={44}
                domain={[piso, teto]}
                ticks={marcas}
                tickFormatter={(v: number) => n2(v)}
                tick={{ fill: 'var(--cor-texto-suave)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: 'var(--cor-texto-suave)', strokeDasharray: '4 4' }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as PontoDia | undefined;
                  if (!active || !p) return null;
                  return (
                    <div className={estilos.dica}>
                      <strong>{diaSemana(p.data)} {p.rotulo}</strong>
                      <span>Modelo: erro de {n2(p.modelo)}, {p.acerto} de 5 bairros certos à noite</span>
                      <span>Média simples: erro de {n2(p.simples)}, {p.acertoSimples} de 5</span>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="simples" stroke="var(--cor-texto-suave)" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="modelo"
                stroke="var(--cor-fogo)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--cor-fogo)', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: 'var(--cor-fogo)', stroke: 'var(--cor-superficie)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      {/* Tabela equivalente ao gráfico para leitor de tela (num div: tabela não encolhe a 1 px e alargaria a página). */}
      <div className="so-leitor">
        <table>
          <caption>Teste retroativo dia a dia</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Erro do modelo</th>
              <th scope="col">Erro da média simples</th>
              <th scope="col">Acertos do modelo à noite (de 5)</th>
              <th scope="col">Acertos da média simples (de 5)</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.data}>
                <th scope="row">{diaSemana(d.data)} {d.rotulo}</th>
                <td>{n2(d.modelo)}</td>
                <td>{n2(d.simples)}</td>
                <td>{d.acerto}</td>
                <td>{d.acertoSimples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
