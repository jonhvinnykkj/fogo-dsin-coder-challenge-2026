// Grade de risco dos próximos 7 dias: bairros nas linhas, os blocos de 3 horas nas colunas (agrupados por dia, relógio de
// São Paulo; o primeiro e o último dia são parciais porque a janela começa agora). Cor = índice do bloco. Ordenável pelo
// maior risco; mostra os 15 bairros mais arriscados e "Ver todos". Clicar (ou andar com as setas) numa célula mostra os
// fatores — o servidor só os detalha nos blocos com índice a partir de 25.
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ROTULO_NIVEL_RISCO } from '../../../shared/dominio';
import type { Bairro, CelulaRisco, PrevisaoRisco } from '../../../shared/modelos';
import { useTema } from '../estilo/tema';
import { agruparPorDia, corDaCelula, diaDaSemana, faixaDeHoras, horaLocal, ocorrenciasEsperadas, rotuloDia, textoPeso, type DiaDaGrade } from '../util/risco';
import { Botao } from './Botao';
import estilos from './GradeRiscoSemana.module.css';
import { LegendaRisco } from './LegendaRisco';
import { PlacaIndice } from './PlacaIndice';

export const BAIRROS_DE_INICIO = 15;

type Ordem = 'semana' | 'pico' | 'nome';
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Maior risco na semana' },
  { valor: 'pico', rotulo: 'Maior pico' },
  { valor: 'nome', rotulo: 'Nome' },
];

interface Linha {
  bairroId: number;
  nome: string;
  celulas: (CelulaRisco | undefined)[];
  /** Ocorrências esperadas somadas nos 7 dias (só para ordenar). */
  semana: number;
  pico: number;
}

interface Modelo {
  inicios: string[];
  dias: DiaDaGrade[];
  linhas: Linha[];
  /** Primeira coluna de cada dia (ganha o respiro da virada). */
  viraDia: Set<number>;
  maisQuente: { bairroId: number; coluna: number } | null;
}

function montar(previsao: PrevisaoRisco, bairros: Bairro[] | undefined): Modelo {
  const inicios = [...new Set(previsao.celulas.map((c) => c.inicio))].sort();
  const coluna = new Map(inicios.map((iso, i) => [iso, i]));
  const nomes = new Map((bairros ?? []).map((b) => [b.id, b.nome]));
  const porBairro = new Map<number, Linha>();
  let maisQuente: Modelo['maisQuente'] = null;
  let melhor: CelulaRisco | null = null;
  for (const c of previsao.celulas) {
    let l = porBairro.get(c.bairroId);
    if (!l) {
      l = { bairroId: c.bairroId, nome: nomes.get(c.bairroId) ?? `Bairro ${c.bairroId}`, celulas: new Array(inicios.length), semana: 0, pico: 0 };
      porBairro.set(c.bairroId, l);
    }
    const j = coluna.get(c.inicio)!;
    l.celulas[j] = c;
    l.semana += c.taxaEsperada;
    l.pico = Math.max(l.pico, c.indice);
    if (!melhor || c.indice > melhor.indice || (c.indice === melhor.indice && c.taxaEsperada > melhor.taxaEsperada)) {
      melhor = c;
      maisQuente = { bairroId: c.bairroId, coluna: j };
    }
  }
  const dias = agruparPorDia(inicios);
  return { inicios, dias, linhas: [...porBairro.values()], viraDia: new Set(dias.slice(1).map((d) => d.indices[0]!)), maisQuente };
}

const porRisco = (ordem: Ordem) => (a: Linha, b: Linha) =>
  ordem === 'pico' ? b.pico - a.pico || b.semana - a.semana : b.semana - a.semana || b.pico - a.pico;

interface Props {
  previsao: PrevisaoRisco;
  bairros: Bairro[] | undefined;
}

export function GradeRiscoSemana({ previsao, bairros }: Props) {
  const { tema } = useTema();
  const modelo = useMemo(() => montar(previsao, bairros), [previsao, bairros]);
  const [ordem, setOrdem] = useState<Ordem>('semana');
  const [todos, setTodos] = useState(false);
  const [escolhida, setEscolhida] = useState<{ bairroId: number; coluna: number } | null>(null);
  const tabela = useRef<HTMLTableElement>(null);

  const linhas = useMemo(() => {
    // Sem "Ver todos": os 15 mais arriscados (pelo critério de risco escolhido, ou pela semana quando a ordem é o nome).
    const base = [...modelo.linhas].sort(porRisco(ordem === 'nome' ? 'semana' : ordem));
    const recorte = todos ? base : base.slice(0, BAIRROS_DE_INICIO);
    return ordem === 'nome' ? recorte.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : recorte;
  }, [modelo, ordem, todos]);

  const atual = escolhida ?? modelo.maisQuente;
  const linhaAtual = atual ? modelo.linhas.find((l) => l.bairroId === atual.bairroId) : undefined;
  const celulaAtual = atual && linhaAtual ? linhaAtual.celulas[atual.coluna] : undefined;
  // Célula que recebe o Tab (as outras ficam fora da ordem; as setas andam pela grade).
  const naGrade = atual && linhas.some((l) => l.bairroId === atual.bairroId) ? atual : linhas[0] ? { bairroId: linhas[0].bairroId, coluna: 0 } : null;

  const focar = (r: number, c: number) => {
    const l = linhas[Math.max(0, Math.min(linhas.length - 1, r))];
    if (!l) return;
    const col = Math.max(0, Math.min(modelo.inicios.length - 1, c));
    setEscolhida({ bairroId: l.bairroId, coluna: col });
    tabela.current?.querySelector<HTMLElement>(`[data-celula="${l.bairroId}-${col}"]`)?.focus();
  };

  const teclado = (ev: KeyboardEvent<HTMLTableElement>) => {
    const alvo = (ev.target as HTMLElement).closest<HTMLElement>('[data-celula]');
    if (!alvo) return;
    const r = Number(alvo.dataset.linha);
    const c = Number(alvo.dataset.coluna);
    const ultimo = modelo.inicios.length - 1;
    const destino: Record<string, [number, number]> = {
      ArrowRight: [r, c + 1], ArrowLeft: [r, c - 1], ArrowDown: [r + 1, c], ArrowUp: [r - 1, c],
      Home: [r, 0], End: [r, ultimo], PageDown: [r, c + 8], PageUp: [r, c - 8],
    };
    const d = destino[ev.key];
    if (!d) return;
    ev.preventDefault();
    focar(d[0], d[1]);
  };

  const iniciosDoDia = (d: DiaDaGrade) => d.indices.map((i) => modelo.inicios[i]!);
  // Callback estável para as linhas memorizadas: clicar numa célula só redesenha as linhas que mudaram.
  const focarAtual = useRef(focar);
  useLayoutEffect(() => {
    focarAtual.current = focar;
  });
  const escolherCelula = useCallback((r: number, j: number) => focarAtual.current(r, j), []);

  return (
    <div className={estilos.grade}>
      <div className={estilos.ferramentas}>
        <div className={estilos.ordem} role="group" aria-label="Ordenar bairros por">
          <span className={estilos.rotuloOrdem}>Ordenar por</span>
          {ORDENS.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={ordem === o.valor}
              className={estilos.pilula}
              onClick={() => setOrdem(o.valor)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        <LegendaRisco />
      </div>

      <div className={estilos.detalhe} aria-live="polite">
        {atual && linhaAtual && celulaAtual ? (
          <>
            <PlacaIndice indice={celulaAtual.indice} nivel={celulaAtual.nivel} grande />
            <div className={estilos.textoDetalhe}>
              <strong className={estilos.ondeQuando}>
                {linhaAtual.nome}, {diaDaSemana(celulaAtual.inicio)} {rotuloDia(celulaAtual.inicio).split(' ')[1]}, {faixaDeHoras(celulaAtual.inicio, previsao.granularidadeHoras)}
              </strong>
              <span>
                Risco {ROTULO_NIVEL_RISCO[celulaAtual.nivel].toLowerCase()}: {ocorrenciasEsperadas(celulaAtual.taxaEsperada)} nessas {previsao.granularidadeHoras} horas
                {escolhida ? '' : ' (o bloco mais arriscado da semana)'}
              </span>
            </div>
            {celulaAtual.fatores.length ? (
              <ul className={estilos.fatores} aria-label="Fatores">
                {celulaAtual.fatores.map((f) => (
                  <li key={f.nome} className={estilos.fator}>
                    {f.nome}
                    <span className={`${estilos.peso} numeros`}>{textoPeso(f.peso)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={estilos.semFatores}>Índice abaixo de 25 (risco baixo): os fatores só são detalhados a partir de 25.</p>
            )}
          </>
        ) : (
          <p className={estilos.semFatores}>Escolha uma célula para ver o que pesa naquele horário.</p>
        )}
      </div>

      <div className={estilos.moldura}>
        <table
          ref={tabela}
          role="grid"
          className={estilos.tabela}
          aria-label={`Risco por bairro nos próximos 7 dias, em blocos de ${previsao.granularidadeHoras} horas`}
          onKeyDown={teclado}
        >
          <colgroup>
            <col className={estilos.colunaNome} />
            {modelo.inicios.map((iso) => <col key={iso} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className={estilos.canto}>Bairro</th>
              {modelo.dias.map((d, k) => (
                <th key={d.data} scope="colgroup" colSpan={d.indices.length} className={`${estilos.dia} ${k > 0 ? estilos.inicioDia : ''}`}>
                  <span className={estilos.textoDia}>{d.indices.length >= 4 ? d.rotulo : diaDaSemana(iniciosDoDia(d)[0]!).slice(0, 3)}</span>
                </th>
              ))}
            </tr>
            <tr>
              {modelo.inicios.map((iso, j) => {
                const h = horaLocal(iso);
                return (
                  <th key={iso} scope="col" className={`${estilos.hora} ${modelo.viraDia.has(j) ? estilos.inicioDia : ''}`} aria-label={faixaDeHoras(iso, previsao.granularidadeHoras)}>
                    <span aria-hidden="true">{h % 12 === 0 || j === 0 ? `${h}h` : ''}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, r) => (
              <LinhaGrade
                key={l.bairroId}
                linha={l}
                r={r}
                inicios={modelo.inicios}
                viraDia={modelo.viraDia}
                horas={previsao.granularidadeHoras}
                tema={tema}
                escolhida={atual?.bairroId === l.bairroId ? atual.coluna : -1}
                foco={naGrade?.bairroId === l.bairroId ? naGrade.coluna : -1}
                onEscolher={escolherCelula}
              />
            ))}
          </tbody>
        </table>
      </div>

      {modelo.linhas.length > BAIRROS_DE_INICIO && (
        <Botao
          variante="secundario"
          className={estilos.verTodos}
          onClick={() => setTodos((t) => !t)}
          icone={todos ? <CaretUp weight="fill" size={14} aria-hidden="true" /> : <CaretDown weight="fill" size={14} aria-hidden="true" />}
          aria-expanded={todos}
        >
          {todos ? `Mostrar só os ${BAIRROS_DE_INICIO} mais arriscados` : `Ver todos os ${modelo.linhas.length}`}
        </Botao>
      )}
    </div>
  );
}

interface PropsLinha {
  linha: Linha;
  r: number;
  inicios: string[];
  viraDia: Set<number>;
  horas: number;
  tema: 'claro' | 'escuro';
  /** Coluna escolhida nesta linha (-1 = nenhuma). */
  escolhida: number;
  /** Coluna que recebe o Tab nesta linha (-1 = nenhuma). */
  foco: number;
  onEscolher: (r: number, j: number) => void;
}

const LinhaGrade = memo(function LinhaGrade({ linha: l, r, inicios, viraDia, horas, tema, escolhida, foco, onEscolher }: PropsLinha) {
  return (
    <tr>
      <th scope="row" className={estilos.nome}>{l.nome}</th>
      {l.celulas.map((c, j) => {
        const iso = inicios[j]!;
        return (
          <td
            key={iso}
            role="gridcell"
            tabIndex={foco === j ? 0 : -1}
            aria-selected={escolhida === j}
            data-celula={`${l.bairroId}-${j}`}
            data-linha={r}
            data-coluna={j}
            className={`${estilos.celula} ${viraDia.has(j) ? estilos.inicioDia : ''}`}
            style={{ background: corDaCelula(c?.indice ?? 0, tema) }}
            onClick={() => onEscolher(r, j)}
            aria-label={`${l.nome}, ${rotuloDia(iso)}, ${faixaDeHoras(iso, horas)}: índice ${c?.indice ?? 0}, ${ROTULO_NIVEL_RISCO[c?.nivel ?? 'baixo'].toLowerCase()}`}
          />
        );
      })}
    </tr>
  );
});
