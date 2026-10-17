// Uma seção da tela de Previsões: título, para que serve, o conteúdo quando a consulta chega (cada seção carrega sozinha,
// com o próprio "Calculando…" e o próprio erro — a página nunca espera a previsão mais lenta) e, no fim, o cartão
// "O que prevê · Dados usados · Como ajuda · Confiabilidade".
import type { Icon } from '@phosphor-icons/react';
import { Component, startTransition, useEffect, useState, type ErrorInfo, type ReactNode, type Ref } from 'react';
import { formatarDataHora } from '../../../shared/formato';
import type { ExplicacaoPrevisao } from '../../../shared/modelos';
import { AvisoErro } from './AvisoErro';
import { CartaoExplicacao } from './CartaoExplicacao';
import estilos from './SecaoPrevisao.module.css';

export interface ConsultaSecao<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

interface Props<T> {
  id: string;
  titulo: string;
  descricao: ReactNode;
  icone: Icon;
  consulta: ConsultaSecao<T>;
  children: (dados: T) => ReactNode;
  explicacao?: (dados: T) => ExplicacaoPrevisao | undefined;
  tituloExplicacao?: string;
  calculadoEm?: (dados: T) => string | undefined;
  /** Altura do esqueleto enquanto calcula (evita a página pular quando o conteúdo chega). */
  alturaEsqueleto?: number;
  /**
   * Desenha assim que os dados chegam (as seções do topo). As demais são montadas logo depois da primeira pintura, numa
   * transição do React (em fatias, sem travar a tela): o topo aparece antes e a página continua respondendo.
   */
  imediata?: boolean;
  ref?: Ref<HTMLElement>;
}

export function SecaoPrevisao<T>({
  id, titulo, descricao, icone: Icone, consulta, children, explicacao, tituloExplicacao, calculadoEm, alturaEsqueleto = 320, imediata = false, ref,
}: Props<T>) {
  const dados = consulta.data;
  const [liberada, setLiberada] = useState(imediata);
  useEffect(() => {
    if (liberada || dados === undefined) return;
    const quadro = requestAnimationFrame(() => startTransition(() => setLiberada(true)));
    return () => cancelAnimationFrame(quadro);
  }, [liberada, dados]);
  const quando = dados !== undefined ? calculadoEm?.(dados) : undefined;
  const cartao = dados !== undefined ? explicacao?.(dados) : undefined;

  return (
    <section id={id} ref={ref} className={estilos.secao} aria-labelledby={`${id}-titulo`}>
      <header className={estilos.cabeca}>
        <h2 id={`${id}-titulo`} className={estilos.titulo} tabIndex={-1}>
          <span className={estilos.icone} aria-hidden="true"><Icone weight="fill" size={20} /></span>
          {titulo}
        </h2>
        {quando && <span className={`${estilos.quando} numeros`}>Calculado em {formatarDataHora(quando)}</span>}
        <p className={estilos.descricao}>{descricao}</p>
      </header>

      {dados !== undefined && liberada ? (
        <LimiteDeErro titulo={titulo}>
          {children(dados)}
          {cartao && <CartaoExplicacao explicacao={cartao} titulo={tituloExplicacao} nivel={3} />}
        </LimiteDeErro>
      ) : dados === undefined && consulta.isError ? (
        <AvisoErro
          erro={consulta.error}
          titulo={`Não foi possível calcular: ${titulo.toLowerCase()}`}
          onTentarDeNovo={() => void consulta.refetch()}
          tentando={consulta.isFetching}
        />
      ) : (
        <div className={estilos.esqueleto} style={{ minHeight: alturaEsqueleto }} role="status">
          <span className={estilos.calculando}>Calculando…</span>
          <span className={estilos.barraEsqueleto} />
          <span className={estilos.barraEsqueleto} />
          <span className={estilos.barraEsqueleto} />
        </div>
      )}
    </section>
  );
}

/**
 * Se o conteúdo de uma seção quebrar ao desenhar (resposta inesperada do servidor, por exemplo), só aquela seção mostra o
 * aviso; as outras continuam funcionando.
 */
class LimiteDeErro extends Component<{ titulo: string; children: ReactNode }, { erro: unknown }> {
  state: { erro: unknown } = { erro: null };

  static getDerivedStateFromError(erro: unknown) {
    return { erro };
  }

  componentDidCatch(erro: unknown, info: ErrorInfo) {
    console.error(`Seção "${this.props.titulo}" não pôde ser desenhada`, erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <AvisoErro
          erro={this.state.erro}
          titulo={`Esta seção encontrou um problema: ${this.props.titulo.toLowerCase()}`}
          onTentarDeNovo={() => this.setState({ erro: null })}
        />
      );
    }
    return this.props.children;
  }
}
