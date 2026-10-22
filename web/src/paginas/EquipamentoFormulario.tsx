// Cadastro e edição de equipamento. Quatro seções: Identificação, Localização, Situação e manutenção, Características do tipo.
// Valida com o mesmo schema do servidor, mantém o que foi digitado quando a API recusa e mostra cada erro no campo certo.
import { CaretLeft, FloppyDisk, Plus } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  NECESSIDADES_MANUTENCAO, ORGAOS, ROTULO_NECESSIDADE_MANUTENCAO, ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO,
} from '../../../shared/dominio';
import { CIDADE, UF, formatarCidadeUf } from '../../../shared/formato';
import type { Equipamento } from '../../../shared/modelos';
import { TIPOS_EQUIPAMENTO, tipoPorId, type TipoEquipamentoId } from '../../../shared/tipos-equipamento';
import { buscarCep, CEP_INEXISTENTE } from '../api/viacep';
import { ErroApi } from '../api/cliente';
import { useAtualizarEquipamento, useBairros, useCriarEquipamento, useEquipamento } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao, classeBotao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { CampoDinamico } from '../componentes/CampoDinamico';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { SeletorPontoMapa } from '../componentes/SeletorPontoMapa';
import { bairroDoPonto } from '../util/bairroDoPonto';
import { lerDecimal, textoDeCoordenada } from '../util/numeros';
import estilos from './Formulario.module.css';
import { dadosDaEdicao, validarEquipamento, type Erros, type EstadoEquipamento } from './validacaoEquipamento';

const ESTADO_NOVO: EstadoEquipamento = {
  tipo: '', numeroSerie: '', marca: '', modelo: '', orgao: '', situacao: 'operacional', cep: '', logradouro: '', referencia: '',
  bairroId: '', lat: '', lng: '', manutencaoNecessidade: 'nenhuma', manutencaoPeriodicidadeDias: '', ultimaManutencao: '',
  proximaManutencao: '', instaladoEm: '', caracteristicas: {},
};

function estadoDe(e: Equipamento): EstadoEquipamento {
  return {
    tipo: e.tipo, numeroSerie: e.numeroSerie, marca: e.marca, modelo: e.modelo, orgao: e.orgao, situacao: e.situacao, cep: e.cep,
    logradouro: e.logradouro, referencia: e.referencia ?? '', bairroId: String(e.bairroId), lat: textoDeCoordenada(e.lat), lng: textoDeCoordenada(e.lng),
    manutencaoNecessidade: e.manutencaoNecessidade, manutencaoPeriodicidadeDias: e.manutencaoPeriodicidadeDias ? String(e.manutencaoPeriodicidadeDias) : '',
    ultimaManutencao: e.ultimaManutencao?.slice(0, 10) ?? '', proximaManutencao: e.proximaManutencao?.slice(0, 10) ?? '',
    instaladoEm: e.instaladoEm?.slice(0, 10) ?? '', caracteristicas: { ...e.caracteristicas },
  };
}

function mascararCep(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Rota: /equipamentos/novo (cadastro) e /equipamentos/:id/editar (edição). */
export default function EquipamentoFormulario() {
  const { id } = useParams();
  const idNumero = id === undefined ? undefined : Number(id);
  const consulta = useEquipamento(idNumero);

  if (idNumero === undefined) return <Formulario />;
  if (consulta.isPending) return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando equipamento…" /></div>;
  if (consulta.isError) {
    return <div className="pagina"><AvisoErro erro={consulta.error} titulo="Não foi possível abrir o equipamento" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} /></div>;
  }
  return <Formulario equipamento={consulta.data} />;
}

function Formulario({ equipamento }: { equipamento?: Equipamento }) {
  const editando = equipamento !== undefined;
  const navegar = useNavigate();
  const bairros = useBairros();
  const criar = useCriarEquipamento();
  const atualizar = useAtualizarEquipamento();
  const [estado, setEstado] = useState<EstadoEquipamento>(() => (equipamento ? estadoDe(equipamento) : ESTADO_NOVO));
  // O que estava gravado quando o formulário abriu: na edição, decide se o grupo de manutenção vai no PUT.
  const inicial = useRef(estado);
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<unknown>(null);
  const [tentativas, setTentativas] = useState(0);
  const [sugestaoBairro, setSugestaoBairro] = useState<string | null>(null);
  const [cepAviso, setCepAviso] = useState<'buscando' | 'falhou' | 'inexistente' | { foraDeMarilia: string } | null>(null);
  const buscaCep = useRef(0);
  const logradouroAutomatico = useRef(false);
  const enviando = criar.isPending || atualizar.isPending;

  // Depois de uma tentativa com erro, leva o foco ao primeiro campo marcado.
  useEffect(() => {
    if (tentativas === 0) return;
    const primeiro = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
    primeiro?.focus();
    primeiro?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [tentativas]);

  const limparErro = (...chaves: string[]) => setErros((e) => {
    if (!chaves.some((c) => c in e)) return e;
    const novo = { ...e };
    for (const c of chaves) delete novo[c];
    return novo;
  });

  const definir = <K extends keyof EstadoEquipamento>(chave: K, valor: EstadoEquipamento[K], ...tambem: string[]) => {
    setEstado((s) => ({ ...s, [chave]: valor }));
    limparErro(chave, ...tambem);
  };

  const trocarTipo = (valor: string) => {
    if (!valor) {
      setEstado((s) => ({ ...s, tipo: '', caracteristicas: {} }));
      return;
    }
    const def = tipoPorId(valor as TipoEquipamentoId);
    const inicial: Record<string, unknown> = {};
    for (const c of def.campos) if (c.tipo === 'booleano') inicial[c.chave] = false;
    setEstado((s) => ({ ...s, tipo: def.id, orgao: def.orgaoPadrao, caracteristicas: inicial }));
    setErros((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('caracteristicas') && k !== 'tipo' && k !== 'orgao')));
  };

  const sugerirBairro = (lat: number, lng: number, sobrescrever: boolean) => {
    const lista = bairros.data ?? [];
    const achado = bairroDoPonto(lat, lng, lista);
    if (achado) {
      setEstado((s) => (sobrescrever || !s.bairroId ? { ...s, bairroId: String(achado.id) } : s));
      limparErro('bairroId');
      setSugestaoBairro(`Bairro sugerido pelo mapa: ${achado.nome}. Troque na lista se precisar.`);
    } else if (lista.length) {
      setSugestaoBairro('O ponto não cai em nenhum bairro cadastrado: escolha o bairro na lista.');
    }
  };

  const escolherNoMapa = (lat: number, lng: number) => {
    setEstado((s) => ({ ...s, lat: textoDeCoordenada(lat), lng: textoDeCoordenada(lng) }));
    limparErro('lat', 'lng');
    sugerirBairro(lat, lng, true);
  };

  const digitarCoordenada = (chave: 'lat' | 'lng', texto: string) => {
    const outra = lerDecimal(chave === 'lat' ? estado.lng : estado.lat);
    const propria = lerDecimal(texto);
    definir(chave, texto, 'lat', 'lng');
    if (propria !== undefined && outra !== undefined && Number.isFinite(propria) && Number.isFinite(outra)) {
      sugerirBairro(chave === 'lat' ? propria : outra, chave === 'lat' ? outra : propria, false);
    }
  };

  const digitarCep = (texto: string) => {
    const cep = mascararCep(texto);
    definir('cep', cep);
    setCepAviso(null);
    buscaCep.current += 1;
    if (cep.length !== 9) return;
    const minha = buscaCep.current;
    setCepAviso('buscando');
    void buscarCep(cep).then((endereco) => {
      if (minha !== buscaCep.current) return; // o CEP mudou de novo no meio da busca
      if (endereco === CEP_INEXISTENTE) {
        setCepAviso('inexistente');
        return;
      }
      if (!endereco) {
        setCepAviso('falhou');
        return;
      }
      // CEP de outra cidade: avisa e não preenche nada (o sistema atende só Marília/SP).
      const outraCidade = (endereco.cidade && semAcento(endereco.cidade) !== semAcento(CIDADE)) || (endereco.uf && endereco.uf.toUpperCase() !== UF);
      if (outraCidade) {
        setCepAviso({ foraDeMarilia: formatarCidadeUf(endereco.cidade || CIDADE, endereco.uf || UF) });
        return;
      }
      setCepAviso(null);
      setEstado((s) => {
        const proximo = { ...s };
        if (endereco.logradouro && (!s.logradouro.trim() || logradouroAutomatico.current)) {
          proximo.logradouro = endereco.logradouro;
          logradouroAutomatico.current = true;
        }
        if (!s.bairroId && endereco.bairro) {
          const igual = (bairros.data ?? []).find((b) => semAcento(b.nome) === semAcento(endereco.bairro));
          if (igual) proximo.bairroId = String(igual.id);
        }
        return proximo;
      });
      limparErro('logradouro', 'bairroId');
    });
  };

  const aoEnviar = (ev: FormEvent) => {
    ev.preventDefault();
    setErroGeral(null);
    const { dados, erros: achados } = validarEquipamento(estado);
    if (!dados) {
      setErros(achados);
      setTentativas((t) => t + 1);
      return;
    }
    setErros({});
    const aoFalhar = (erro: unknown) => {
      if (erro instanceof ErroApi && erro.campos && Object.keys(erro.campos).length) {
        setErros(erro.campos);
        setTentativas((t) => t + 1);
      } else if (erro instanceof ErroApi && erro.status === 409 && /série/i.test(erro.erro)) {
        setErros({ numeroSerie: erro.erro });
        setTentativas((t) => t + 1);
      } else {
        setErroGeral(erro);
      }
    };
    const aoConcluir = (salvo: { id: number }) => navegar(`/equipamentos/${salvo.id}`);
    // Edição: `tipo` e `situacao` seguem como estavam (ver validacaoEquipamento.ts); o servidor ignora a situação no PUT.
    // O grupo de manutenção só vai se a pessoa mexeu nele (dadosDaEdicao).
    if (equipamento) atualizar.mutate({ id: equipamento.id, dados: dadosDaEdicao(dados, estado, inicial.current) }, { onSuccess: aoConcluir, onError: aoFalhar });
    else criar.mutate(dados, { onSuccess: aoConcluir, onError: aoFalhar });
  };

  const def = estado.tipo ? tipoPorId(estado.tipo) : undefined;
  const quantosErros = Object.keys(erros).length;
  const latNumero = lerDecimal(estado.lat);
  const lngNumero = lerDecimal(estado.lng);
  const periodica = estado.manutencaoNecessidade === 'periodica';
  const exigeProxima = estado.manutencaoNecessidade === 'agendada' || periodica;
  const titulo = editando ? `Editar ${equipamento.codigo}` : 'Cadastrar equipamento';

  return (
    <div className={`pagina ${estilos.pagina} formulario`}>
      <Link to={editando ? `/equipamentos/${equipamento.id}` : '/equipamentos'} className={estilos.voltar}>
        <CaretLeft weight="fill" size={16} aria-hidden="true" />
        {editando ? 'Voltar para a ficha' : 'Voltar para equipamentos'}
      </Link>

      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        <p className={estilos.descricao}>
          {editando
            ? 'Corrija os dados cadastrais. Posição atual, último sinal e situação vêm da telemetria e não são alterados aqui.'
            : 'Preencha os dados do equipamento. O código FOGO-… é gerado ao salvar.'}
        </p>
      </header>

      <form className={estilos.form} onSubmit={aoEnviar} noValidate>
        {quantosErros > 0 && (
          <p className={estilos.resumoErro} role="alert">
            {quantosErros === 1 ? 'Corrija o campo destacado abaixo.' : `Corrija os ${quantosErros} campos destacados abaixo.`}
          </p>
        )}
        {erroGeral !== null && <AvisoErro erro={erroGeral} titulo="Não foi possível salvar" />}

        <section className={estilos.secao} aria-labelledby="sec-identificacao">
          <h2 id="sec-identificacao"><span className={estilos.numero} aria-hidden="true">1</span>Identificação</h2>
          <div className={estilos.grade}>
            <Campo
              rotulo="Tipo de equipamento"
              erro={erros.tipo}
              ajuda={editando ? `O tipo não pode ser trocado: o código ${equipamento.codigo} depende do tipo.` : undefined}
              className={estilos.larga}
            >
              {(p) => (
                <select {...p} value={estado.tipo} disabled={editando} onChange={(e) => trocarTipo(e.target.value)}>
                  <option value="">Escolha o tipo…</option>
                  {TIPOS_EQUIPAMENTO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Número de série" erro={erros.numeroSerie}>
              {(p) => <input {...p} type="text" value={estado.numeroSerie} onChange={(e) => definir('numeroSerie', e.target.value)} autoComplete="off" />}
            </Campo>
            <Campo rotulo="Órgão responsável" erro={erros.orgao}>
              {(p) => (
                <select {...p} value={estado.orgao} onChange={(e) => definir('orgao', e.target.value)}>
                  <option value="">Escolha o órgão…</option>
                  {ORGAOS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Marca" erro={erros.marca}>
              {(p) => <input {...p} type="text" value={estado.marca} onChange={(e) => definir('marca', e.target.value)} />}
            </Campo>
            <Campo rotulo="Modelo" erro={erros.modelo}>
              {(p) => <input {...p} type="text" value={estado.modelo} onChange={(e) => definir('modelo', e.target.value)} />}
            </Campo>
            <Campo rotulo="Data de instalação" erro={erros.instaladoEm} opcional>
              {(p) => <input {...p} type="date" value={estado.instaladoEm} onChange={(e) => definir('instaladoEm', e.target.value)} />}
            </Campo>
          </div>
        </section>

        <section className={estilos.secao} aria-labelledby="sec-localizacao">
          <h2 id="sec-localizacao"><span className={estilos.numero} aria-hidden="true">2</span>Localização</h2>
          <div className={estilos.grade}>
            <Campo
              rotulo="CEP"
              erro={erros.cep}
              ajuda={cepAviso === 'buscando' ? 'Buscando o endereço…' : typeof cepAviso === 'object' && cepAviso ? `Este CEP é de ${cepAviso.foraDeMarilia}, fora de ${formatarCidadeUf()}` : cepAviso === 'inexistente' ? 'CEP não encontrado — confira os números ou preencha o endereço' : cepAviso === 'falhou' ? 'Não foi possível buscar o CEP — preencha o endereço' : 'Marília: 17500-000 a 17539-999. O logradouro é preenchido sozinho quando possível.'}
            >
              {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="postal-code" placeholder="17500-000" maxLength={9} value={estado.cep} onChange={(e) => digitarCep(e.target.value)} />}
            </Campo>
            <Campo rotulo="Logradouro" erro={erros.logradouro}>
              {(p) => <input {...p} type="text" value={estado.logradouro} onChange={(e) => { logradouroAutomatico.current = false; definir('logradouro', e.target.value); }} />}
            </Campo>
            <Campo rotulo="Referência" erro={erros.referencia} opcional>
              {(p) => <input {...p} type="text" placeholder="Ex.: em frente ao mercado" value={estado.referencia} onChange={(e) => definir('referencia', e.target.value)} />}
            </Campo>
            <Campo rotulo="Cidade/UF" ajuda="O F.O.G.O. atende um município; as coordenadas precisam cair dentro de Marília.">
              {(p) => <input {...p} type="text" readOnly value={formatarCidadeUf()} />}
            </Campo>
            <Campo rotulo="Bairro" erro={erros.bairroId} ajuda={sugestaoBairro ?? undefined}>
              {(p) => (
                <select {...p} value={estado.bairroId} disabled={bairros.isPending} onChange={(e) => { setSugestaoBairro(null); definir('bairroId', e.target.value); }}>
                  <option value="">{bairros.isPending ? 'Carregando bairros…' : 'Escolha o bairro…'}</option>
                  {[...(bairros.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => (
                    <option key={b.id} value={b.id}>{b.nome} · {b.regiao}</option>
                  ))}
                </select>
              )}
            </Campo>
          </div>
          <div className={estilos.coordenadas}>
            <Campo rotulo="Latitude" erro={undefined}>
              {(p) => <input {...p} type="text" inputMode="decimal" placeholder="-22,213800" value={estado.lat} onChange={(e) => digitarCoordenada('lat', e.target.value)} aria-invalid={erros.lat ? true : undefined} aria-describedby={erros.lat ? 'erro-ponto' : undefined} />}
            </Campo>
            <Campo rotulo="Longitude" erro={erros.lng}>
              {(p) => <input {...p} type="text" inputMode="decimal" placeholder="-49,950800" value={estado.lng} onChange={(e) => digitarCoordenada('lng', e.target.value)} {...(erros.lat && !erros.lng ? { 'aria-invalid': true as const, 'aria-describedby': 'erro-ponto' } : {})} />}
            </Campo>
          </div>
          <SeletorPontoMapa lat={latNumero} lng={lngNumero} onEscolher={escolherNoMapa} erro={erros.lat} idErro="erro-ponto" />
        </section>

        <section className={estilos.secao} aria-labelledby="sec-situacao">
          <h2 id="sec-situacao"><span className={estilos.numero} aria-hidden="true">3</span>Situação e manutenção</h2>
          <div className={estilos.grade}>
            <Campo
              rotulo="Situação"
              erro={erros.situacao}
              ajuda={editando ? 'Para mudar a situação, use "Mudar situação" na ficha: ela fica registrada no histórico.' : undefined}
            >
              {(p) => (
                <select {...p} value={estado.situacao} disabled={editando} onChange={(e) => definir('situacao', e.target.value)}>
                  {SITUACOES_EQUIPAMENTO.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Necessidade de manutenção" erro={erros.manutencaoNecessidade}>
              {(p) => (
                <select {...p} value={estado.manutencaoNecessidade} onChange={(e) => definir('manutencaoNecessidade', e.target.value)}>
                  {NECESSIDADES_MANUTENCAO.map((n) => <option key={n} value={n}>{ROTULO_NECESSIDADE_MANUTENCAO[n]}</option>)}
                </select>
              )}
            </Campo>
            {periodica && (
              <Campo rotulo="Periodicidade (dias)" erro={erros.manutencaoPeriodicidadeDias}>
                {(p) => <input {...p} type="text" inputMode="numeric" placeholder="Ex.: 90" value={estado.manutencaoPeriodicidadeDias} onChange={(e) => definir('manutencaoPeriodicidadeDias', e.target.value)} />}
              </Campo>
            )}
            <Campo rotulo="Última manutenção" erro={erros.ultimaManutencao} opcional>
              {(p) => <input {...p} type="date" value={estado.ultimaManutencao} onChange={(e) => definir('ultimaManutencao', e.target.value)} />}
            </Campo>
            <Campo rotulo="Próxima manutenção" erro={erros.proximaManutencao} opcional={!exigeProxima}>
              {(p) => <input {...p} type="date" value={estado.proximaManutencao} onChange={(e) => definir('proximaManutencao', e.target.value)} />}
            </Campo>
          </div>
        </section>

        <section className={estilos.secao} aria-labelledby="sec-caracteristicas">
          <h2 id="sec-caracteristicas"><span className={estilos.numero} aria-hidden="true">4</span>Características do tipo</h2>
          {def ? (
            <div className={estilos.grade}>
              {def.campos.map((c) => (
                <CampoDinamico
                  key={`${def.id}-${c.chave}`}
                  campo={c}
                  valor={estado.caracteristicas[c.chave]}
                  erro={erros[`caracteristicas.${c.chave}`]}
                  onChange={(v) => {
                    setEstado((s) => ({ ...s, caracteristicas: { ...s.caracteristicas, [c.chave]: v } }));
                    limparErro(`caracteristicas.${c.chave}`);
                  }}
                />
              ))}
              {erros.caracteristicas && <p className={estilos.larga} role="alert">{erros.caracteristicas}</p>}
            </div>
          ) : (
            <p className={estilos.vazio}>Escolha o tipo de equipamento na seção Identificação para ver as características dele.</p>
          )}
        </section>

        <div className={estilos.rodape}>
          <Link to={editando ? `/equipamentos/${equipamento.id}` : '/equipamentos'} className={classeBotao('secundario')}>Cancelar</Link>
          <Botao type="submit" variante="primario" disabled={enviando} icone={editando ? <FloppyDisk weight="fill" size={18} aria-hidden="true" /> : <Plus weight="fill" size={18} aria-hidden="true" />}>
            {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar equipamento'}
          </Botao>
        </div>
      </form>
    </div>
  );
}
