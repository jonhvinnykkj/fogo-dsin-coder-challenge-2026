// Token do dispositivo: aparece UMA vez (o banco guarda só o hash). `DialogoTokenNovo` mostra o token com o aviso de copiar;
// `DialogoGerarToken` é o caminho da ficha: confirma (o token atual deixa de valer), gera e mostra o novo no mesmo painel.
import { Check, Copy, Key } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useGerarTokenDispositivo } from '../../api/consultas';
import { AvisoErro } from '../base/AvisoErro';
import { Botao } from '../base/Botao';
import { Gaveta } from '../base/Gaveta';
import estilos from './Dialogo.module.css';

interface PropsNovo {
  aberto: boolean;
  /** Fechar é seguir em frente: o token não volta a aparecer. */
  onFechar: () => void;
  codigo: string;
  token: string;
  /** "cadastro": equipamento recém-criado. "novo": token gerado pela ficha (o anterior foi invalidado). */
  origem: 'cadastro' | 'novo';
  /** Texto do botão que fecha (padrão: "Já copiei o token"). */
  textoFechar?: string;
}

export function DialogoTokenNovo({ aberto, onFechar, codigo, token, origem, textoFechar = 'Já copiei o token' }: PropsNovo) {
  return (
    <Gaveta
      aberta={aberto}
      onFechar={onFechar}
      titulo={origem === 'cadastro' ? 'Equipamento cadastrado' : 'Token novo gerado'}
      subtitulo={codigo}
      largura={480}
      rodape={<Botao variante="primario" onClick={onFechar}>{textoFechar}</Botao>}
    >
      <ConteudoToken token={token} origem={origem} />
    </Gaveta>
  );
}

function ConteudoToken({ token, origem }: { token: string; origem: PropsNovo['origem'] }) {
  const [copiado, setCopiado] = useState<'sim' | 'nao' | null>(null);
  const caixa = useRef<HTMLElement>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiado('sim');
    } catch {
      // Sem permissão de área de transferência: seleciona o texto para a pessoa copiar com Ctrl+C.
      const selecao = window.getSelection();
      if (caixa.current && selecao) {
        selecao.removeAllRanges();
        const faixa = document.createRange();
        faixa.selectNodeContents(caixa.current);
        selecao.addRange(faixa);
      }
      setCopiado('nao');
    }
  };

  return (
    <div className={estilos.form}>
      <p className={estilos.destaque} role="alert">
        Copie agora: o token não aparece de novo.
      </p>
      <p className={estilos.texto}>
        {origem === 'cadastro'
          ? 'Configure este token no dispositivo para ele enviar leituras (cabeçalho x-dispositivo-token). O sistema guarda só uma versão embaralhada dele.'
          : 'O token anterior deixou de valer: configure este no dispositivo. O sistema guarda só uma versão embaralhada dele.'}
      </p>
      <code ref={caixa} className={estilos.token} aria-label="Token do dispositivo">{token}</code>
      <Botao variante="secundario" icone={copiado === 'sim' ? <Check weight="bold" size={18} aria-hidden="true" /> : <Copy weight="fill" size={18} aria-hidden="true" />} onClick={() => void copiar()}>
        {copiado === 'sim' ? 'Copiado' : 'Copiar token'}
      </Botao>
      <p className={estilos.texto} role="status">
        {copiado === 'sim' ? 'Token copiado para a área de transferência.' : copiado === 'nao' ? 'Não consegui copiar sozinho: o texto está selecionado, use Ctrl+C (ou ⌘C).' : ''}
      </p>
      <p className={estilos.texto}>Se perder o token, gere outro na ficha do equipamento (o anterior deixa de valer).</p>
    </div>
  );
}

interface PropsGerar {
  aberto: boolean;
  onFechar: () => void;
  equipamento: { id: number; codigo: string };
}

export function DialogoGerarToken({ aberto, onFechar, equipamento }: PropsGerar) {
  const mutacao = useGerarTokenDispositivo();
  const fechar = () => {
    onFechar();
    mutacao.reset(); // a próxima abertura volta a pedir confirmação (e o token mostrado não fica na memória da tela)
  };

  if (mutacao.data) {
    return <DialogoTokenNovo aberto={aberto} onFechar={fechar} codigo={equipamento.codigo} token={mutacao.data.token} origem="novo" textoFechar="Já copiei o token" />;
  }
  return (
    <Gaveta
      aberta={aberto}
      onFechar={fechar}
      titulo="Gerar token novo"
      subtitulo={equipamento.codigo}
      largura={480}
      rodape={(
        <>
          <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" icone={<Key weight="fill" size={18} aria-hidden="true" />} disabled={mutacao.isPending} onClick={() => mutacao.mutate(equipamento.id)}>
            {mutacao.isPending ? 'Gerando…' : 'Gerar token novo'}
          </Botao>
        </>
      )}
    >
      <div className={estilos.form}>
        {mutacao.isError && <AvisoErro erro={mutacao.error} titulo="Não foi possível gerar o token" />}
        <p className={estilos.destaque}>O token atual deixa de valer na hora: o dispositivo para de enviar leituras até receber o novo.</p>
        <p className={estilos.texto}>O novo token aparece uma única vez, na tela seguinte. Só gere outro se o atual foi perdido ou ficou exposto.</p>
      </div>
    </Gaveta>
  );
}
