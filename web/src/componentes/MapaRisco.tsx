// Mapa de risco das próximas 24 horas: bairros pintados pelo índice previsto na hora escolhida na régua (de hora em
// hora, relógio de São Paulo). Ao lado, a hora escolhida: os bairros mais arriscados ou, com um bairro escolhido (clique no
// mapa, na lista ou no seletor), o índice, as ocorrências esperadas e os fatores que pesaram — tudo do servidor.
import { MapPin, X } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { ROTULO_NIVEL_RISCO } from '../../../shared/dominio';
import type { Bairro, CelulaRisco, PrevisaoRisco } from '../../../shared/modelos';
import { useTema } from '../estilo/tema';
import { CamadaRisco } from '../mapa/CamadaRisco';
import { corDaCelula, ocorrenciasEsperadas, textoPeso } from '../util/risco';
import { Botao } from './Botao';
import { LegendaRisco } from './LegendaRisco';
import { MapaBase } from './MapaBase';
import { PlacaIndice } from './PlacaIndice';
import estilos from './MapaRisco.module.css';
import { ReguaHorario, rotuloHoraDia, type HoraRegua } from './ReguaHorario';
import '../mapa/mapa-operacional.css';

interface Props {
  previsao: PrevisaoRisco;
  bairros: Bairro[] | undefined;
}

interface ModeloHoras {
  horas: HoraRegua[];
  /** Uma entrada por hora: célula de cada bairro. */
  porHora: Map<number, CelulaRisco>[];
}

/** Separa as células por hora (a resposta vem bairro a bairro) e soma a cidade em cada hora para a régua. */
export function montarHoras(previsao: PrevisaoRisco): ModeloHoras {
  const inicios = [...new Set(previsao.celulas.map((c) => c.inicio))].sort();
  const posicao = new Map(inicios.map((iso, i) => [iso, i]));
  const porHora = inicios.map(() => new Map<number, CelulaRisco>());
  const horas: HoraRegua[] = inicios.map((inicio) => ({ inicio, total: 0, maiorIndice: 0 }));
  for (const c of previsao.celulas) {
    const i = posicao.get(c.inicio)!;
    porHora[i]!.set(c.bairroId, c);
    horas[i]!.total += c.taxaEsperada;
    horas[i]!.maiorIndice = Math.max(horas[i]!.maiorIndice, c.indice);
  }
  return { horas, porHora };
}

const maisArriscados = (celulas: Map<number, CelulaRisco> | undefined, n: number) =>
  [...(celulas?.values() ?? [])].sort((a, b) => b.indice - a.indice || b.taxaEsperada - a.taxaEsperada).slice(0, n);

export function MapaRisco({ previsao, bairros }: Props) {
  const { tema } = useTema();
  const [posicao, setPosicao] = useState(0);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const { horas, porHora } = useMemo(() => montarHoras(previsao), [previsao]);
  const nomes = useMemo(() => new Map((bairros ?? []).map((b) => [b.id, b.nome])), [bairros]);
  const emOrdem = useMemo(() => [...(bairros ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [bairros]);
  const p = Math.min(posicao, Math.max(0, horas.length - 1));
  const celulas = porHora[p];
  const hora = horas[p];
  const selecionar = useCallback((id: number) => setSelecionado((atual) => (atual === id ? null : id)), []);

  if (!hora) return null;
  const top = maisArriscados(celulas, 5);
  const celulaEscolhida = selecionado !== null ? celulas?.get(selecionado) : undefined;

  return (
    <div className={estilos.mapaRisco}>
      <div className={estilos.corpo}>
        <div className={estilos.moldura}>
          <MapaBase rotulo="Mapa de risco dos bairros na hora escolhida" className={estilos.mapa}>
            <CamadaRisco bairros={bairros} celulas={celulas} selecionado={selecionado} tema={tema} onSelecionar={selecionar} />
          </MapaBase>
          <div className={estilos.legenda}>
            <LegendaRisco />
          </div>
        </div>

        <aside className={estilos.painel} aria-label="Hora escolhida">
          <div className={estilos.cabecaHora}>
            <span className={estilos.rotuloHora}>Às</span>
            <strong className={`${estilos.hora} numeros`}>{rotuloHoraDia(hora.inicio)}</strong>
            <span className={estilos.totalHora}>{ocorrenciasEsperadas(hora.total)} na cidade nesta hora</span>
          </div>

          <label className={estilos.seletor}>
            <span>Bairro</span>
            <select value={selecionado ?? ''} onChange={(e) => setSelecionado(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Os mais arriscados da hora</option>
              {emOrdem.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>

          {selecionado !== null ? (
            <DetalheBairro
              nome={nomes.get(selecionado) ?? ''}
              celula={celulaEscolhida}
              linha={porHora.map((m) => m.get(selecionado))}
              horas={horas}
              posicao={p}
              tema={tema}
              onHora={setPosicao}
              onFechar={() => setSelecionado(null)}
            />
          ) : (
            <>
              <h3 className={estilos.subtitulo}>Mais arriscados nesta hora</h3>
              <ol className={estilos.top}>
                {top.map((c) => (
                  <li key={c.bairroId}>
                    <button type="button" className={estilos.linhaTop} onClick={() => setSelecionado(c.bairroId)}>
                      <PlacaIndice indice={c.indice} nivel={c.nivel} />
                      <span className={estilos.nomeTop}>{nomes.get(c.bairroId) ?? `Bairro ${c.bairroId}`}</span>
                      <span className={`${estilos.taxaTop} numeros`}>{ocorrenciasEsperadas(c.taxaEsperada)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className={estilos.dica}>
                <MapPin weight="fill" size={16} aria-hidden="true" />
                Clique num bairro do mapa para ver os fatores que pesam.
              </p>
            </>
          )}
        </aside>
      </div>

      <ReguaHorario horas={horas} posicao={p} onMudar={setPosicao} />
    </div>
  );
}

function DetalheBairro({ nome, celula, linha, horas, posicao, tema, onHora, onFechar }: {
  nome: string;
  celula: CelulaRisco | undefined;
  linha: (CelulaRisco | undefined)[];
  horas: HoraRegua[];
  posicao: number;
  tema: 'claro' | 'escuro';
  onHora: (p: number) => void;
  onFechar: () => void;
}) {
  return (
    <div className={estilos.detalhe}>
      <div className={estilos.cabecaBairro}>
        <h3 className={estilos.nomeBairro}>{nome}</h3>
        <Botao variante="fantasma" tamanho="pequeno" icone={<X weight="bold" size={14} aria-hidden="true" />} onClick={onFechar}>Fechar</Botao>
      </div>
      {celula ? (
        <>
          <div className={estilos.numerosBairro}>
            <PlacaIndice indice={celula.indice} nivel={celula.nivel} grande />
            <div className={estilos.textoBairro}>
              <strong>Risco {ROTULO_NIVEL_RISCO[celula.nivel].toLowerCase()}</strong>
              <span>{ocorrenciasEsperadas(celula.taxaEsperada)} nesta hora</span>
            </div>
          </div>
          <h4 className={estilos.subtitulo}>O que pesa nesta hora</h4>
          {celula.fatores.length ? (
            <ul className={estilos.fatores}>
              {celula.fatores.map((f) => (
                <li key={f.nome} className={estilos.fator} title={`Multiplica a taxa esperada por ${textoPeso(f.peso).slice(1)}`}>
                  <span>{f.nome}</span>
                  <span className={`${estilos.peso} numeros`}>{textoPeso(f.peso)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={estilos.semFatores}>Nenhum fator muda a taxa em 10% ou mais: o bairro segue o seu normal nesta hora.</p>
          )}
        </>
      ) : (
        <p className={estilos.semFatores}>Sem previsão para este bairro nesta hora.</p>
      )}

      <h4 className={estilos.subtitulo}>Nas próximas 24 horas</h4>
      {/* Atalho do mouse para a régua (o teclado usa a própria régua). */}
      <div className={estilos.linhaBairro} aria-hidden="true">
        {linha.map((c, i) => (
          <button
            key={horas[i]!.inicio}
            type="button"
            className={estilos.celulaLinha}
            data-atual={i === posicao || undefined}
            style={{ background: corDaCelula(c?.indice ?? 0, tema) }}
            onClick={() => onHora(i)}
            tabIndex={-1}
            title={`${rotuloHoraDia(horas[i]!.inicio)}: índice ${c?.indice ?? 0}`}
          />
        ))}
      </div>
    </div>
  );
}
