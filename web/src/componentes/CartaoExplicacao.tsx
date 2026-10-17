// Explicação de uma previsão: o que prevê, com quais dados, como ajuda a decidir e quão confiável foi no passado.
// Toda previsão do F.O.G.O. vem com isso do servidor (`ExplicacaoPrevisao`); aqui só se organiza para ler rápido.
import { CaretDown, Compass, Crosshair, Database, Gauge } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { ExplicacaoPrevisao } from '../../../shared/modelos';
import estilos from './CartaoExplicacao.module.css';

interface Props {
  explicacao: ExplicacaoPrevisao;
  titulo?: string;
  /** Começa fechado, abre ao clicar no título. */
  recolhivel?: boolean;
}

const PCT = /\s*\(%\)\s*$/;

/** 0,53 · 7,9% · 4,1 — casas decimais pelo tamanho do número; "(%)" no nome da métrica vira o símbolo no valor. */
export function formatarMetrica(metrica: string, valor: number): { nome: string; valor: string } {
  const casas = Math.abs(valor) < 1 ? 2 : Math.abs(valor) < 100 && !Number.isInteger(valor) ? 1 : 0;
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return PCT.test(metrica) ? { nome: metrica.replace(PCT, ''), valor: `${numero}%` } : { nome: metrica, valor: numero };
}

export function CartaoExplicacao({ explicacao, titulo = 'Como esta previsão funciona', recolhivel = false }: Props) {
  const conteudo = (
    <div className={estilos.grade}>
      <div className={estilos.coluna}>
        <Bloco icone={<Crosshair weight="fill" size={18} />} titulo="O que prevê">
          <p>{explicacao.oQuePreve}</p>
        </Bloco>
        <Bloco icone={<Database weight="fill" size={18} />} titulo="Dados usados">
          <ul className={estilos.lista}>
            {explicacao.dadosUsados.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Bloco>
        <Bloco icone={<Compass weight="fill" size={18} />} titulo="Como ajuda">
          <p>{explicacao.comoAjuda}</p>
        </Bloco>
      </div>
      <Bloco icone={<Gauge weight="fill" size={18} />} titulo="Confiabilidade" className={estilos.confiabilidade}>
        <dl className={estilos.metricas}>
          {explicacao.confiabilidade.map((c) => {
            const m = formatarMetrica(c.metrica, c.valor);
            return (
              <div key={c.metrica} className={estilos.metrica}>
                <dt className={estilos.nome}>{m.nome}</dt>
                <dd className={`${estilos.valor} numeros`}>{m.valor}</dd>
                <dd className={estilos.descricao}>{c.descricao}</dd>
              </div>
            );
          })}
        </dl>
      </Bloco>
    </div>
  );

  if (recolhivel) {
    return (
      <details className={estilos.cartao}>
        <summary className={estilos.resumo}>
          <span className={estilos.tituloCartao}>{titulo}</span>
          <CaretDown weight="fill" size={14} aria-hidden="true" className={estilos.seta} />
        </summary>
        {conteudo}
      </details>
    );
  }
  return (
    <section className={estilos.cartao} aria-label={titulo}>
      <h2 className={estilos.tituloCartao}>{titulo}</h2>
      {conteudo}
    </section>
  );
}

function Bloco({ icone, titulo, children, className }: { icone: ReactNode; titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`${estilos.bloco} ${className ?? ''}`}>
      <h3 className={estilos.tituloBloco}>
        <span aria-hidden="true" className={estilos.iconeBloco}>{icone}</span>
        {titulo}
      </h3>
      {children}
    </div>
  );
}
