// Diálogo "Mudar situação" do equipamento: nova situação + motivo (fica no histórico). Saindo de "Furtado" aparece a
// confirmação de recuperado, exigida pelo servidor para qualquer destino menos "Desativado" (dado como perdido).
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO, type SituacaoEquipamento } from '../../../shared/dominio';
import { mudancaSituacaoSchema } from '../../../shared/schemas';
import { ErroApi } from '../api/cliente';
import { useMudarSituacaoEquipamento } from '../api/consultas';
import { AvisoErro } from './AvisoErro';
import { Botao } from './Botao';
import { Campo } from './Campo';
import { EtiquetaSituacao } from './EtiquetaSituacao';
import { Gaveta } from './Gaveta';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  equipamento: { id: number; codigo: string; situacao: SituacaoEquipamento };
  /** Situação já escolhida ao abrir (ex.: "Desativar" abre com Desativado). */
  situacaoInicial?: SituacaoEquipamento;
}

export function DialogoSituacao({ aberto, onFechar, equipamento, situacaoInicial }: Props) {
  const idForm = useId();
  const mutacao = useMudarSituacaoEquipamento();
  return (
    <Gaveta
      aberta={aberto}
      onFechar={onFechar}
      titulo="Mudar situação"
      subtitulo={equipamento.codigo}
      largura={480}
      rodape={(
        <>
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={<ArrowsClockwise weight="fill" size={18} aria-hidden="true" />} disabled={mutacao.isPending}>
            {mutacao.isPending ? 'Salvando…' : 'Mudar situação'}
          </Botao>
        </>
      )}
    >
      <FormularioSituacao idForm={idForm} equipamento={equipamento} inicial={situacaoInicial} mutacao={mutacao} aoConcluir={onFechar} />
    </Gaveta>
  );
}

function FormularioSituacao({ idForm, equipamento, inicial, mutacao, aoConcluir }: {
  idForm: string; equipamento: Props['equipamento']; inicial?: SituacaoEquipamento; mutacao: ReturnType<typeof useMudarSituacaoEquipamento>; aoConcluir: () => void;
}) {
  const opcoes = SITUACOES_EQUIPAMENTO.filter((s) => s !== equipamento.situacao);
  const [situacao, setSituacao] = useState<string>(inicial && inicial !== equipamento.situacao ? inicial : '');
  const [motivo, setMotivo] = useState('');
  const [recuperado, setRecuperado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<unknown>(null);

  const saiDeFurtado = equipamento.situacao === 'furtado';
  // Só "Desativado" (dar como perdido) sai de "Furtado" sem a recuperação: todo outro destino o põe de volta nas mãos do órgão.
  const exigeRecuperacao = saiDeFurtado && situacao !== '' && situacao !== 'desativado';

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    setErroGeral(null);
    const r = mudancaSituacaoSchema.safeParse({ situacao: situacao || undefined, motivo, ...(exigeRecuperacao && recuperado ? { recuperado: true } : {}) });
    const achados: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) achados[i.path.join('.')] ??= i.message;
    if (!situacao) achados.situacao = 'Escolha a nova situação';
    if (exigeRecuperacao && !recuperado) achados.recuperado = 'Confirme que o equipamento foi recuperado para tirá-lo de "Furtado"';
    if (!r.success || Object.keys(achados).length) {
      setErros(achados);
      return;
    }
    setErros({});
    mutacao.mutate({ id: equipamento.id, ...r.data }, {
      onSuccess: aoConcluir,
      onError: (erro) => {
        if (erro instanceof ErroApi && erro.campos) setErros(erro.campos);
        else setErroGeral(erro);
      },
    });
  };

  return (
    <form id={idForm} className={estilos.form} onSubmit={enviar} noValidate>
      {erroGeral !== null && <AvisoErro erro={erroGeral} titulo="Não foi possível mudar a situação" />}
      <p className={estilos.atual}>Situação atual: <EtiquetaSituacao situacao={equipamento.situacao} /></p>
      <Campo rotulo="Nova situação" erro={erros.situacao}>
        {(p) => (
          <select {...p} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoes.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
          </select>
        )}
      </Campo>
      <Campo rotulo="Motivo" erro={erros.motivo} ajuda="Fica registrado na linha do tempo da ficha.">
        {(p) => <textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: equipamento localizado pela Guarda Municipal" />}
      </Campo>
      {exigeRecuperacao && (
        <div>
          <label className={estilos.opcao}>
            <input type="checkbox" checked={recuperado} onChange={(e) => setRecuperado(e.target.checked)} aria-invalid={erros.recuperado ? true : undefined} />
            <span>O equipamento foi recuperado</span>
          </label>
          {erros.recuperado && <p className={estilos.erro} role="alert">{erros.recuperado}</p>}
        </div>
      )}
    </form>
  );
}
