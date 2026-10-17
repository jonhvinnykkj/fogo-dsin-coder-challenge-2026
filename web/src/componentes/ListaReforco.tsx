// Reforço de agentes: remanejamentos sugeridos para as próximas 24 horas, agrupados por turno. Cada um mostra de onde para
// onde, quantos agentes, o horário e a carga por agente na região que recebe, antes e depois — números e frase do servidor.
import { ArrowRight, UsersThree } from '@phosphor-icons/react';
import { formatarNumero } from '../../../shared/formato';
import type { RecomendacaoReforco } from '../../../shared/modelos';
import { diaDaSemana, faixaDeHoras, rotuloRegiao } from '../util/risco';
import { EstadoVazio } from './EstadoVazio';
import estilos from './ListaReforco.module.css';

const HORA_MS = 3_600_000;

interface Turno {
  chave: string;
  inicio: string;
  horas: number;
  itens: RecomendacaoReforco[];
}

function porTurno(recs: RecomendacaoReforco[]): Turno[] {
  const turnos = new Map<string, Turno>();
  for (const r of recs) {
    const chave = `${r.inicio}|${r.fim}`;
    const t = turnos.get(chave) ?? { chave, inicio: r.inicio, horas: Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / HORA_MS), itens: [] };
    t.itens.push(r);
    turnos.set(chave, t);
  }
  return [...turnos.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const carga = (n: number) => formatarNumero(n, 1);

export function ListaReforco({ recomendacoes }: { recomendacoes: RecomendacaoReforco[] }) {
  if (recomendacoes.length === 0) {
    return (
      <EstadoVazio
        icone={<UsersThree weight="fill" />}
        titulo="Nenhum remanejamento sugerido"
        descricao="Nas próximas 24 horas nenhuma região passa de 20% acima da carga média por agente da cidade. A escala atual dá conta."
      />
    );
  }
  const escala = Math.max(...recomendacoes.map((r) => r.cargaPorAgenteAntes), 1);

  return (
    <div className={estilos.turnos}>
      {porTurno(recomendacoes).map((t) => (
        <section key={t.chave} className={estilos.turno} aria-label={`${maiuscula(diaDaSemana(t.inicio))}, das ${faixaDeHoras(t.inicio, t.horas)}`}>
          <h3 className={estilos.quando}>
            <span className={estilos.dia}>{maiuscula(diaDaSemana(t.inicio))}</span>
            <span className={`${estilos.faixa} numeros`}>{faixaDeHoras(t.inicio, t.horas)}</span>
          </h3>
          <ul className={estilos.itens}>
            {t.itens.map((r, i) => (
              <li key={`${r.regiaoOrigem}-${r.regiaoDestino}-${i}`} className={estilos.item}>
                <div className={estilos.movimento}>
                  <span className={estilos.origem}>{rotuloRegiao(r.regiaoOrigem)}</span>
                  <span className={estilos.seta}>
                    <strong className="numeros">{r.quantidade} {r.quantidade === 1 ? 'agente' : 'agentes'}</strong>
                    <ArrowRight weight="bold" size={18} aria-hidden="true" />
                  </span>
                  <span className={estilos.destino}>{rotuloRegiao(r.regiaoDestino)}</span>
                </div>

                <div className={estilos.carga} aria-label={`Carga na ${rotuloRegiao(r.regiaoDestino).toLowerCase()}: de ${carga(r.cargaPorAgenteAntes)} para ${carga(r.cargaPorAgenteDepois)} ocorrências por agente`}>
                  <span className={estilos.rotuloCarga}>Ocorrências por agente no destino</span>
                  <Barra rotulo="Antes" valor={r.cargaPorAgenteAntes} escala={escala} antes />
                  <Barra rotulo="Depois" valor={r.cargaPorAgenteDepois} escala={escala} />
                </div>

                <p className={estilos.motivo}>{r.motivo}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Barra({ rotulo, valor, escala, antes = false }: { rotulo: string; valor: number; escala: number; antes?: boolean }) {
  return (
    <span className={estilos.linhaBarra} aria-hidden="true">
      <span className={estilos.rotuloBarra}>{rotulo}</span>
      <span className={estilos.trilho}>
        <span className={`${estilos.barra} ${antes ? estilos.barraAntes : ''}`} style={{ width: `${(100 * valor) / escala}%` }} />
      </span>
      <span className={`${estilos.valorBarra} numeros`}>{carga(valor)}</span>
    </span>
  );
}
