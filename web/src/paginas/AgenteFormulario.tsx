// Cadastro e edição de agente: identificação, base (bairro, logradouro e ponto no mapa) e vínculo com moto ou viatura disponível.
import { CaretLeft, FloppyDisk, Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CATEGORIAS_AGENTE, ORGAOS, ROTULO_CATEGORIA_AGENTE, ROTULO_SITUACAO_AGENTE, ROTULO_TURNO, SITUACOES_AGENTE, TURNOS, type CategoriaAgente, type Orgao,
} from '../../../shared/dominio';
import { dentroDeMarilia } from '../../../shared/geo';
import type { Agente } from '../../../shared/modelos';
import { agenteInputSchema } from '../../../shared/schemas';
import { ErroApi } from '../api/cliente';
import { useAgentes, useAtualizarAgente, useBairros, useCriarAgente, useAgente, useEquipamentos } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao, classeBotao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { SeletorPontoMapa } from '../componentes/SeletorPontoMapa';
import { bairroDoPonto } from '../util/bairroDoPonto';
import { lerDecimal, textoDeCoordenada } from '../util/numeros';
import estilos from './Formulario.module.css';

interface EstadoAgente {
  nome: string;
  matricula: string;
  categoria: string;
  orgao: string;
  situacao: string;
  turno: string;
  telefone: string;
  baseLogradouro: string;
  baseBairroId: string;
  lat: string;
  lng: string;
  equipamentoId: string;
}

const ORGAO_PADRAO: Record<CategoriaAgente, Orgao> = {
  agente_transito: 'Secretaria de Mobilidade Urbana',
  guarda_municipal: 'Guarda Civil Municipal',
  policial_militar: 'Polícia Militar',
};

const NOVO: EstadoAgente = {
  nome: '', matricula: '', categoria: '', orgao: '', situacao: 'em_servico', turno: '', telefone: '', baseLogradouro: '', baseBairroId: '', lat: '', lng: '', equipamentoId: '',
};

function estadoDe(a: Agente): EstadoAgente {
  return {
    nome: a.nome, matricula: a.matricula, categoria: a.categoria, orgao: a.orgao, situacao: a.situacao, turno: a.turno, telefone: a.telefone ?? '',
    baseLogradouro: a.baseLogradouro, baseBairroId: String(a.baseBairroId), lat: textoDeCoordenada(a.lat), lng: textoDeCoordenada(a.lng),
    equipamentoId: a.equipamentoId ? String(a.equipamentoId) : '',
  };
}

function validar(e: EstadoAgente) {
  const candidato = {
    nome: e.nome, matricula: e.matricula, categoria: e.categoria || undefined, orgao: e.orgao || undefined, situacao: e.situacao || undefined, turno: e.turno || undefined,
    telefone: e.telefone.trim() || undefined, baseLogradouro: e.baseLogradouro, baseBairroId: e.baseBairroId ? Number(e.baseBairroId) : undefined,
    lat: lerDecimal(e.lat), lng: lerDecimal(e.lng), equipamentoId: e.equipamentoId ? Number(e.equipamentoId) : undefined,
  };
  const r = agenteInputSchema.safeParse(candidato);
  if (r.success) return { dados: r.data, erros: {} as Record<string, string> };
  const erros: Record<string, string> = {};
  for (const i of r.error.issues) erros[i.path.join('.')] ??= i.message;
  // O superRefine (ponto dentro de Marília) só roda com os outros campos certos; confere à parte.
  const { lat, lng } = candidato;
  if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && !dentroDeMarilia(lat, lng)) erros.lat ??= 'A coordenada precisa ficar dentro de Marília';
  return { dados: undefined, erros };
}

/** Rotas: /agentes/novo e /agentes/:id/editar. */
export default function AgenteFormulario() {
  const { id } = useParams();
  const idNumero = id === undefined ? undefined : Number(id);
  const consulta = useAgente(idNumero);
  if (idNumero === undefined) return <Formulario />;
  if (consulta.isPending) return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando agente…" /></div>;
  if (consulta.isError) return <div className="pagina"><AvisoErro erro={consulta.error} titulo="Não foi possível abrir o agente" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} /></div>;
  return <Formulario agente={consulta.data} />;
}

function Formulario({ agente }: { agente?: Agente }) {
  const editando = agente !== undefined;
  const navegar = useNavigate();
  const bairros = useBairros();
  const criar = useCriarAgente();
  const atualizar = useAtualizarAgente();
  const motos = useEquipamentos({ tipo: 'moto_agente', porPagina: 100 });
  const viaturas = useEquipamentos({ tipo: 'viatura', porPagina: 100 });
  const agentes = useAgentes({ porPagina: 100 });
  const [estado, setEstado] = useState<EstadoAgente>(() => (agente ? estadoDe(agente) : NOVO));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<unknown>(null);
  const [tentativas, setTentativas] = useState(0);
  const [sugestaoBairro, setSugestaoBairro] = useState<string | null>(null);
  const enviando = criar.isPending || atualizar.isPending;

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
  const definir = <K extends keyof EstadoAgente>(chave: K, valor: string, ...tambem: string[]) => {
    setEstado((s) => ({ ...s, [chave]: valor }));
    limparErro(chave, ...tambem);
  };

  // Veículos que ainda não têm agente (o atual do agente sempre aparece) e não estão furtados nem desativados.
  const opcoesVeiculo = useMemo(() => {
    const ocupados = new Set((agentes.data?.itens ?? []).filter((a) => a.id !== agente?.id && a.equipamentoId).map((a) => a.equipamentoId));
    const livres = (lista: typeof motos.data) => (lista?.itens ?? []).filter((e) => e.id === agente?.equipamentoId || (!ocupados.has(e.id) && e.situacao !== 'furtado' && e.situacao !== 'desativado'));
    return { motos: livres(motos.data), viaturas: livres(viaturas.data) };
  }, [agentes.data, motos.data, viaturas.data, agente]);

  const sugerirBairro = (lat: number, lng: number, sobrescrever: boolean) => {
    const lista = bairros.data ?? [];
    const achado = bairroDoPonto(lat, lng, lista);
    if (achado) {
      setEstado((s) => (sobrescrever || !s.baseBairroId ? { ...s, baseBairroId: String(achado.id) } : s));
      limparErro('baseBairroId');
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
    if (propria !== undefined && outra !== undefined && Number.isFinite(propria) && Number.isFinite(outra)) sugerirBairro(chave === 'lat' ? propria : outra, chave === 'lat' ? outra : propria, false);
  };

  const aoEnviar = (ev: FormEvent) => {
    ev.preventDefault();
    setErroGeral(null);
    const { dados, erros: achados } = validar(estado);
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
      } else if (erro instanceof ErroApi && erro.status === 409 && /matrícula/i.test(erro.erro)) {
        setErros({ matricula: erro.erro });
        setTentativas((t) => t + 1);
      } else setErroGeral(erro);
    };
    const aoConcluir = (salvo: { id: number }) => navegar(`/agentes/${salvo.id}`);
    if (agente) atualizar.mutate({ id: agente.id, dados }, { onSuccess: aoConcluir, onError: aoFalhar });
    else criar.mutate(dados, { onSuccess: aoConcluir, onError: aoFalhar });
  };

  const quantosErros = Object.keys(erros).length;
  const voltar = editando ? `/agentes/${agente.id}` : '/agentes';

  return (
    <div className={`pagina ${estilos.pagina} formulario`}>
      <Link to={voltar} className={estilos.voltar}>
        <CaretLeft weight="fill" size={16} aria-hidden="true" />
        {editando ? 'Voltar para a ficha' : 'Voltar para agentes'}
      </Link>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{editando ? `Editar ${agente.nome}` : 'Cadastrar agente'}</h1>
        <p className={estilos.descricao}>{editando ? 'Corrija os dados cadastrais. A posição atual e o último sinal vêm do rastreamento e não mudam aqui.' : 'Preencha os dados do agente e a base de onde ele sai.'}</p>
      </header>

      <form className={estilos.form} onSubmit={aoEnviar} noValidate>
        {quantosErros > 0 && <p className={estilos.resumoErro} role="alert">{quantosErros === 1 ? 'Corrija o campo destacado abaixo.' : `Corrija os ${quantosErros} campos destacados abaixo.`}</p>}
        {erroGeral !== null && <AvisoErro erro={erroGeral} titulo="Não foi possível salvar" />}

        <section className={estilos.secao} aria-labelledby="sec-agente">
          <h2 id="sec-agente"><span className={estilos.numero} aria-hidden="true">1</span>Identificação</h2>
          <div className={estilos.grade}>
            <Campo rotulo="Nome completo" erro={erros.nome} className={estilos.larga}>
              {(p) => <input {...p} type="text" autoComplete="off" value={estado.nome} onChange={(e) => definir('nome', e.target.value)} />}
            </Campo>
            <Campo rotulo="Matrícula" erro={erros.matricula}>
              {(p) => <input {...p} type="text" autoComplete="off" value={estado.matricula} onChange={(e) => definir('matricula', e.target.value)} />}
            </Campo>
            <Campo rotulo="Telefone" erro={erros.telefone} opcional>
              {(p) => <input {...p} type="tel" placeholder="(14) 99999-0000" value={estado.telefone} onChange={(e) => definir('telefone', e.target.value)} />}
            </Campo>
            <Campo rotulo="Categoria" erro={erros.categoria}>
              {(p) => (
                <select
                  {...p}
                  value={estado.categoria}
                  onChange={(e) => {
                    const cat = e.target.value as CategoriaAgente | '';
                    setEstado((s) => ({ ...s, categoria: cat, orgao: cat && !editando ? ORGAO_PADRAO[cat] : s.orgao }));
                    limparErro('categoria', 'orgao');
                  }}
                >
                  <option value="">Escolha a categoria…</option>
                  {CATEGORIAS_AGENTE.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA_AGENTE[c]}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Órgão" erro={erros.orgao}>
              {(p) => (
                <select {...p} value={estado.orgao} onChange={(e) => definir('orgao', e.target.value)}>
                  <option value="">Escolha o órgão…</option>
                  {ORGAOS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Turno" erro={erros.turno}>
              {(p) => (
                <select {...p} value={estado.turno} onChange={(e) => definir('turno', e.target.value)}>
                  <option value="">Escolha o turno…</option>
                  {TURNOS.map((t) => <option key={t} value={t}>{ROTULO_TURNO[t]}</option>)}
                </select>
              )}
            </Campo>
            <Campo
              rotulo="Situação"
              erro={erros.situacao}
              ajuda={editando ? 'Para mudar a situação, use "Mudar situação" na ficha: ela acompanha o turno e as ocorrências.' : undefined}
            >
              {(p) => (
                <select {...p} value={estado.situacao} disabled={editando} onChange={(e) => definir('situacao', e.target.value)}>
                  {SITUACOES_AGENTE.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_AGENTE[s]}</option>)}
                </select>
              )}
            </Campo>
          </div>
        </section>

        <section className={estilos.secao} aria-labelledby="sec-base">
          <h2 id="sec-base"><span className={estilos.numero} aria-hidden="true">2</span>Base</h2>
          <div className={estilos.grade}>
            <Campo rotulo="Logradouro da base" erro={erros.baseLogradouro}>
              {(p) => <input {...p} type="text" value={estado.baseLogradouro} onChange={(e) => definir('baseLogradouro', e.target.value)} />}
            </Campo>
            <Campo rotulo="Bairro da base" erro={erros.baseBairroId} ajuda={sugestaoBairro ?? undefined}>
              {(p) => (
                <select {...p} value={estado.baseBairroId} disabled={bairros.isPending} onChange={(e) => { setSugestaoBairro(null); definir('baseBairroId', e.target.value); }}>
                  <option value="">{bairros.isPending ? 'Carregando bairros…' : 'Escolha o bairro…'}</option>
                  {[...(bairros.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => <option key={b.id} value={b.id}>{b.nome} · {b.regiao}</option>)}
                </select>
              )}
            </Campo>
          </div>
          <div className={estilos.coordenadas}>
            <Campo rotulo="Latitude">
              {(p) => <input {...p} type="text" inputMode="decimal" placeholder="-22,213800" value={estado.lat} onChange={(e) => digitarCoordenada('lat', e.target.value)} aria-invalid={erros.lat ? true : undefined} aria-describedby={erros.lat ? 'erro-ponto' : undefined} />}
            </Campo>
            <Campo rotulo="Longitude" erro={erros.lng}>
              {(p) => <input {...p} type="text" inputMode="decimal" placeholder="-49,950800" value={estado.lng} onChange={(e) => digitarCoordenada('lng', e.target.value)} {...(erros.lat && !erros.lng ? { 'aria-invalid': true as const, 'aria-describedby': 'erro-ponto' } : {})} />}
            </Campo>
          </div>
          <SeletorPontoMapa lat={lerDecimal(estado.lat)} lng={lerDecimal(estado.lng)} onEscolher={escolherNoMapa} erro={erros.lat} idErro="erro-ponto" dica="Clique no mapa para marcar o ponto da base." />
        </section>

        <section className={estilos.secao} aria-labelledby="sec-veiculo">
          <h2 id="sec-veiculo"><span className={estilos.numero} aria-hidden="true">3</span>Veículo</h2>
          <div className={estilos.grade}>
            <Campo rotulo="Moto ou viatura vinculada" erro={erros.equipamentoId} opcional ajuda="Só aparecem veículos sem agente, fora de furto e desativação.">
              {(p) => (
                <select {...p} value={estado.equipamentoId} onChange={(e) => definir('equipamentoId', e.target.value)}>
                  <option value="">Sem veículo</option>
                  {opcoesVeiculo.motos.length > 0 && (
                    <optgroup label="Motos de agente">
                      {opcoesVeiculo.motos.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.marca} {e.modelo}</option>)}
                    </optgroup>
                  )}
                  {opcoesVeiculo.viaturas.length > 0 && (
                    <optgroup label="Viaturas">
                      {opcoesVeiculo.viaturas.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.marca} {e.modelo}</option>)}
                    </optgroup>
                  )}
                </select>
              )}
            </Campo>
          </div>
        </section>

        <div className={estilos.rodape}>
          <Link to={voltar} className={classeBotao('secundario')}>Cancelar</Link>
          <Botao type="submit" variante="primario" disabled={enviando} icone={editando ? <FloppyDisk weight="fill" size={18} aria-hidden="true" /> : <Plus weight="fill" size={18} aria-hidden="true" />}>
            {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar agente'}
          </Botao>
        </div>
      </form>
    </div>
  );
}
