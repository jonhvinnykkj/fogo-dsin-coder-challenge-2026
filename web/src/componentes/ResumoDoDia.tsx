// Resumo do dia: as 5 recomendações do servidor (em ordem de prioridade, cada uma com a previsão de onde veio e um atalho
// para a seção dela) e o índice de risco das próximas 24 horas por bairro.
import { CaretDown, CaretUp, ChartLineUp, MapTrifold, UsersThree, Wrench, type Icon } from '@phosphor-icons/react';
import { useState } from 'react';
import { COR_CRITICIDADE, ROTULO_NIVEL_RISCO } from '../../../shared/dominio';
import type { RecomendacaoDoDia, ResumoPreditivo } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import { Botao } from './Botao';
import { PlacaIndice } from './PlacaIndice';
import estilos from './ResumoDoDia.module.css';

export const FONTE: Record<RecomendacaoDoDia['fonte'], { rotulo: string; ancora: string; icone: Icon }> = {
  risco: { rotulo: 'Risco por bairro', ancora: 'risco', icone: MapTrifold },
  reforco: { rotulo: 'Reforço de agentes', ancora: 'reforco', icone: UsersThree },
  falhas: { rotulo: 'Falhas prováveis', ancora: 'falhas', icone: Wrench },
  tendencias: { rotulo: 'Tendências', ancora: 'tendencias', icone: ChartLineUp },
};

const PRIORIDADE: Record<RecomendacaoDoDia['prioridade'], { rotulo: string; cor: string }> = {
  alta: { rotulo: 'Prioridade alta', cor: COR_CRITICIDADE.alta },
  media: { rotulo: 'Prioridade média', cor: COR_CRITICIDADE.media },
  baixa: { rotulo: 'Prioridade baixa', cor: COR_CRITICIDADE.baixa },
};

const BAIRROS_NO_RESUMO = 10;

interface Props {
  resumo: ResumoPreditivo;
  /** Leva até a seção da fonte (rolagem e foco ficam com a página). */
  onIrPara: (ancora: string) => void;
}

export function ResumoDoDia({ resumo, onIrPara }: Props) {
  const [todos, setTodos] = useState(false);
  const bairros = todos ? resumo.indiceBairros : resumo.indiceBairros.slice(0, BAIRROS_NO_RESUMO);

  return (
    <div className={estilos.envoltorio}>
      <div className={estilos.resumo}>
        <ol className={estilos.recomendacoes}>
          {resumo.recomendacoes.map((r) => {
            const p = PRIORIDADE[r.prioridade];
            const f = FONTE[r.fonte];
            const Icone = f.icone;
            return (
              <li key={r.titulo} className={estilos.recomendacao} style={{ ['--cor-prioridade' as string]: p.cor }}>
                <div className={estilos.topo}>
                  {r.natureza === 'informacao' ? (
                    <span className={estilos.informacao}>Informação, sem ação recomendada</span>
                  ) : (
                    <span className={estilos.prioridade} style={{ background: p.cor, color: corDoTexto(p.cor) }}>{p.rotulo}</span>
                  )}
                  <a
                    href={`#${f.ancora}`}
                    className={estilos.fonte}
                    onClick={(ev) => {
                      ev.preventDefault();
                      onIrPara(f.ancora);
                    }}
                  >
                    <Icone weight="fill" size={15} aria-hidden="true" />
                    <span>Fonte: {f.rotulo}</span>
                  </a>
                </div>
                <h3 className={estilos.titulo}>{r.titulo}</h3>
                <p className={estilos.detalhe}>{r.detalhe}</p>
              </li>
            );
          })}
        </ol>

        <section className={estilos.indice} aria-labelledby="indice-do-dia">
          <h3 id="indice-do-dia" className={estilos.tituloIndice}>Índice de risco do dia</h3>
          <p className={estilos.notaIndice}>Ocorrências esperadas nas próximas 24 horas; 100 = o bairro mais carregado.</p>
          <ol className={estilos.bairros}>
            {bairros.map((b) => (
              <li key={b.bairroId} className={estilos.bairro}>
                <PlacaIndice indice={b.indice} nivel={b.nivel} />
                <span className={estilos.nomeBairro}>{b.nome}</span>
                <span className={estilos.nivel}>{ROTULO_NIVEL_RISCO[b.nivel]}</span>
              </li>
            ))}
          </ol>
          {resumo.indiceBairros.length > BAIRROS_NO_RESUMO && (
            <Botao
              variante="fantasma"
              tamanho="pequeno"
              onClick={() => setTodos((t) => !t)}
              aria-expanded={todos}
              icone={todos ? <CaretUp weight="fill" size={14} aria-hidden="true" /> : <CaretDown weight="fill" size={14} aria-hidden="true" />}
            >
              {todos ? `Mostrar só os ${BAIRROS_NO_RESUMO} primeiros` : `Ver os ${resumo.indiceBairros.length} bairros`}
            </Botao>
          )}
        </section>
      </div>
    </div>
  );
}
