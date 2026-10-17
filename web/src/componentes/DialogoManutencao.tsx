// Diálogo "Registrar manutenção": tipo, descrição e se foi concluída agora ou está prevista para uma data.
// Reaproveitado pela ficha do equipamento e (Tarefa 11) pelo quadro de Manutenção.
import { Wrench } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { manutencaoInputSchema } from '../../../shared/schemas';
import { ErroApi } from '../api/cliente';
import { useRegistrarManutencao } from '../api/consultas';
import { hojeIso } from '../util/datas';
import { AvisoErro } from './AvisoErro';
import { Botao } from './Botao';
import { Campo } from './Campo';
import { Gaveta } from './Gaveta';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  equipamento: { id: number; codigo: string };
  /** Chamado depois que a API aceitou o registro (o diálogo já se fecha sozinho). */
  onRegistrada?: () => void;
}

export function DialogoManutencao({ aberto, onFechar, equipamento, onRegistrada }: Props) {
  const idForm = useId();
  const mutacao = useRegistrarManutencao();
  return (
    <Gaveta
      aberta={aberto}
      onFechar={onFechar}
      titulo="Registrar manutenção"
      subtitulo={equipamento.codigo}
      largura={480}
      rodape={(
        <>
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={<Wrench weight="fill" size={18} aria-hidden="true" />} disabled={mutacao.isPending}>
            {mutacao.isPending ? 'Registrando…' : 'Registrar manutenção'}
          </Botao>
        </>
      )}
    >
      <FormularioManutencao
        idForm={idForm}
        equipamentoId={equipamento.id}
        mutacao={mutacao}
        aoConcluir={() => {
          onRegistrada?.();
          onFechar();
        }}
      />
    </Gaveta>
  );
}

function FormularioManutencao({ idForm, equipamentoId, mutacao, aoConcluir }: {
  idForm: string; equipamentoId: number; mutacao: ReturnType<typeof useRegistrarManutencao>; aoConcluir: () => void;
}) {
  const [tipo, setTipo] = useState('corretiva');
  const [descricao, setDescricao] = useState('');
  const [quando, setQuando] = useState<'agora' | 'prevista'>('agora');
  const [data, setData] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<unknown>(null);

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    setErroGeral(null);
    const candidato = { tipo, descricao, ...(quando === 'agora' ? { concluidaEm: new Date().toISOString() } : { previstaPara: data || undefined }) };
    const r = manutencaoInputSchema.safeParse(candidato);
    if (!r.success) {
      const achados: Record<string, string> = {};
      for (const i of r.error.issues) achados[i.path.join('.') || 'previstaPara'] ??= i.message;
      setErros(achados);
      return;
    }
    setErros({});
    mutacao.mutate({ id: equipamentoId, dados: r.data }, {
      onSuccess: aoConcluir,
      onError: (erro) => {
        if (erro instanceof ErroApi && erro.campos) setErros(erro.campos);
        else setErroGeral(erro);
      },
    });
  };

  return (
    <form id={idForm} className={estilos.form} onSubmit={enviar} noValidate>
      {erroGeral !== null && <AvisoErro erro={erroGeral} titulo="Não foi possível registrar" />}
      <Campo rotulo="Tipo de manutenção" erro={erros.tipo}>
        {(p) => (
          <select {...p} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="corretiva">Corretiva (conserto)</option>
            <option value="preventiva">Preventiva (revisão)</option>
          </select>
        )}
      </Campo>
      <Campo rotulo="Descrição" erro={erros.descricao}>
        {(p) => <textarea {...p} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: troca da lente e limpeza do sensor" />}
      </Campo>
      <fieldset className={estilos.opcoes}>
        <legend>Quando</legend>
        <label className={estilos.opcao}>
          <input type="radio" name={`${idForm}-quando`} checked={quando === 'agora'} onChange={() => setQuando('agora')} />
          <span>Concluída agora</span>
        </label>
        <label className={estilos.opcao}>
          <input type="radio" name={`${idForm}-quando`} checked={quando === 'prevista'} onChange={() => setQuando('prevista')} />
          <span>Prevista para uma data</span>
        </label>
      </fieldset>
      {quando === 'prevista' && (
        <Campo rotulo="Data prevista" erro={erros.previstaPara}>
          {(p) => <input {...p} type="date" min={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} />}
        </Campo>
      )}
      {quando === 'agora' && erros.concluidaEm && <p className={estilos.erro} role="alert">{erros.concluidaEm}</p>}
    </form>
  );
}
