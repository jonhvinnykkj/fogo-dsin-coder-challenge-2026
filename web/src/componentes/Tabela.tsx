// Tabela densa com cabeçalho em degrau de tom, linhas zebradas (sem bordas finas), estado carregando/vazio e paginação.
import { CaretDown, CaretLeft, CaretRight, CaretUp } from '@phosphor-icons/react';
import type { KeyboardEvent, ReactNode } from 'react';
import { formatarNumero } from '../../../shared/formato';
import { Botao } from './Botao';
import estilos from './Tabela.module.css';

export interface Coluna<T> {
  chave: string;
  titulo: string;
  render: (item: T) => ReactNode;
  alinhar?: 'esquerda' | 'direita' | 'centro';
  largura?: string;
  /** Some em telas estreitas (celular), para a tabela caber sem rolar de lado. */
  esconderNoCelular?: boolean;
  /** Não quebra a linha (códigos como FOGO-RAD-0001). */
  semQuebra?: boolean;
  /** O cabeçalho vira botão que ordena por esta coluna (a chave da coluna é a que sobe em `ordem.onMudar`). */
  ordenavel?: boolean;
}

export interface Ordem {
  chave: string;
  direcao: 'asc' | 'desc';
  onMudar: (chave: string) => void;
}

export interface Paginacao {
  pagina: number;
  porPagina: number;
  total: number;
  onMudar: (pagina: number) => void;
}

interface Props<T> {
  colunas: Coluna<T>[];
  linhas: T[] | undefined;
  chaveLinha: (item: T) => string | number;
  /** Nome da tabela para leitores de tela, ex. "Equipamentos cadastrados". */
  legenda: string;
  onLinha?: (item: T) => void;
  carregando?: boolean;
  vazio?: ReactNode;
  paginacao?: Paginacao;
  ordem?: Ordem;
}

const LINHAS_CARREGANDO = 6;

export function Tabela<T>({ colunas, linhas, chaveLinha, legenda, onLinha, carregando = false, vazio, paginacao, ordem }: Props<T>) {
  const classeCelula = (c: Coluna<T>) =>
    [estilos[c.alinhar ?? 'esquerda'], c.esconderNoCelular ? estilos.esconderNoCelular : '', c.semQuebra ? estilos.semQuebra : ''].filter(Boolean).join(' ');

  const aoTeclar = (e: KeyboardEvent<HTMLTableRowElement>, item: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLinha?.(item);
    }
  };

  const semLinhas = !carregando && (!linhas || linhas.length === 0);

  return (
    <div className={estilos.moldura}>
      <div className={estilos.rolagem}>
        <table className={estilos.tabela} aria-busy={carregando || undefined}>
          <caption className="so-leitor">{legenda}</caption>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className={classeCelula(c)}
                  style={c.largura ? { width: c.largura } : undefined}
                  aria-sort={ordem && c.ordenavel && ordem.chave === c.chave ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {ordem && c.ordenavel ? (
                    <button type="button" className={estilos.ordenar} onClick={() => ordem.onMudar(c.chave)}>
                      {c.titulo}
                      {ordem.chave === c.chave && (ordem.direcao === 'asc' ? <CaretUp weight="fill" size={12} aria-hidden="true" /> : <CaretDown weight="fill" size={12} aria-hidden="true" />)}
                    </button>
                  ) : c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando && !linhas?.length
              ? Array.from({ length: LINHAS_CARREGANDO }, (_, i) => (
                  <tr key={`carregando-${i}`} className={estilos.carregando}>
                    {colunas.map((c) => (
                      <td key={c.chave} className={classeCelula(c)}>
                        <span className={estilos.barra} />
                      </td>
                    ))}
                  </tr>
                ))
              : linhas?.map((item) => (
                  <tr
                    key={chaveLinha(item)}
                    className={onLinha ? estilos.clicavel : undefined}
                    onClick={onLinha ? () => onLinha(item) : undefined}
                    onKeyDown={onLinha ? (e) => aoTeclar(e, item) : undefined}
                    tabIndex={onLinha ? 0 : undefined}
                  >
                    {colunas.map((c) => (
                      <td key={c.chave} className={classeCelula(c)}>
                        {c.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {semLinhas && <div className={estilos.vazio}>{vazio ?? 'Nada para mostrar com estes filtros.'}</div>}

      {paginacao && paginacao.total > 0 && <Rodape {...paginacao} />}
    </div>
  );
}

function Rodape({ pagina, porPagina, total, onMudar }: Paginacao) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <nav className={estilos.rodape} aria-label="Paginação">
      <span className="numeros">
        {formatarNumero(de)}–{formatarNumero(ate)} de {formatarNumero(total)}
      </span>
      <div className={estilos.paginas}>
        <Botao tamanho="pequeno" icone={<CaretLeft weight="fill" size={14} aria-hidden="true" />} disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}>
          Anterior
        </Botao>
        <span className={`${estilos.atual} numeros`} aria-current="page">
          Página {formatarNumero(pagina)} de {formatarNumero(ultima)}
        </span>
        <Botao tamanho="pequeno" disabled={pagina >= ultima} onClick={() => onMudar(pagina + 1)}> 
          Próxima
          <CaretRight weight="fill" size={14} aria-hidden="true" />
        </Botao>
      </div>
    </nav>
  );
}
