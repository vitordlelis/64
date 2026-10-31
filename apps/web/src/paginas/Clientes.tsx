import { Link, useParams } from 'react-router-dom';
import { api, brl, data, hoje, useAcao, useDados, type Linha } from '../api';
import { CAMPOS_CLIENTE, camposAssinatura, camposSistema } from '../campos';
import { Carregando, Formulario, Secao, Status } from '../ui';
import { TabelaFaturas } from './Faturas';

export function Clientes() {
  const clientes = useDados<Linha[]>('/clientes');
  const criar = useAcao((v: Linha) => api('/clientes', 'POST', v), false);
  return (
    <>
      <h1>Clientes</h1>
      <Secao titulo="Lista">
        <Carregando q={clientes} />
        <table>
          <thead><tr><th>Nome</th><th>Documento</th><th>Contato</th><th>Status</th></tr></thead>
          <tbody>{clientes.data?.map((c) => (
            <tr key={c.id}><td><Link to={`/clientes/${c.id}`}>{c.nome}</Link></td><td>{c.documento ?? '—'}</td>
              <td>{[c.email, c.whatsapp].filter(Boolean).join(' · ') || '—'}</td><td>{c.status}</td></tr>
          ))}</tbody>
        </table>
      </Secao>
      <Secao titulo="Novo cliente"><Formulario campos={CAMPOS_CLIENTE} onSalvar={criar.mutateAsync} botao="Cadastrar" /></Secao>
    </>
  );
}

export function Cliente() {
  const { id } = useParams();
  const cliente = useDados(`/clientes/${id}`);
  const sistemas = useDados<Linha[]>(`/sistemas?cliente_id=${id}`);
  const assinaturas = useDados<Linha[]>(`/assinaturas?cliente_id=${id}`);
  const faturas = useDados<Linha[]>(`/faturas?cliente_id=${id}`);
  const salvar = useAcao((v: Linha) => api(`/clientes/${id}`, 'PATCH', v), false);
  const novoSistema = useAcao((v: Linha) => api('/sistemas', 'POST', { ...v, cliente_id: id }), false);
  const novaAssinatura = useAcao((v: Linha) => api('/assinaturas', 'POST', { ...v, cliente_id: id }), false);
  const cancelar = useAcao((a: string) => api(`/assinaturas/${a}/cancelar`, 'POST'));
  const faturarProjeto = useAcao((a: Linha) => api('/faturas', 'POST', {
    cliente_id: id, assinatura_id: a.id, tipo: 'projeto', valor_cent: a.valor_projeto_cent,
    vencimento: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('sv-SE'),
  }));
  const nomeSistema = (sid: string) => sistemas.data?.find((s) => s.id === sid)?.nome ?? '—';

  if (!cliente.data) return <Carregando q={cliente} />;
  return (
    <>
      <h1>{cliente.data.nome}</h1>
      <div className="grid2">
        <Secao titulo="Dados"><Formulario key={cliente.data.id} campos={CAMPOS_CLIENTE} inicial={cliente.data} onSalvar={salvar.mutateAsync} /></Secao>
        <Secao titulo="Sistemas">
          <ul className="lista">{sistemas.data?.map((s) => <li key={s.id}><Status s={s.status_saude} /> <Link to={`/sistemas/${s.id}`}>{s.nome}</Link> <small>{s.url}</small></li>)}</ul>
          <details><summary>Adicionar sistema</summary><Formulario campos={camposSistema()} onSalvar={novoSistema.mutateAsync} botao="Adicionar" /></details>
        </Secao>
      </div>
      <Secao titulo="Contratos / assinaturas">
        <table>
          <thead><tr><th>Sistema</th><th className="num">Projeto</th><th className="num">Mensal</th><th>Ciclo</th><th>Venc.</th><th>Início</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{assinaturas.data?.map((a) => (
            <tr key={a.id}>
              <td>{nomeSistema(a.sistema_id)}</td><td className="num">{brl(a.valor_projeto_cent)}</td><td className="num">{brl(a.valor_mensal_cent)}</td>
              <td>{a.ciclo}</td><td>dia {a.dia_vencimento}</td><td>{data(a.inicio_em)}</td>
              <td>{a.status}{a.cancelado_em && ` em ${data(a.cancelado_em)}`}</td>
              <td className="acoes">
                {a.valor_projeto_cent > 0 && <button className="link" onClick={() => confirm(`Gerar fatura do projeto de ${brl(a.valor_projeto_cent)} com vencimento em 7 dias?`) && faturarProjeto.mutate(a)}>faturar projeto</button>}
                {a.status !== 'cancelada' && <button className="link perigo" onClick={() => confirm(`Cancelar a assinatura a partir de hoje (${data(hoje())})?`) && cancelar.mutate(a.id)}>cancelar</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {sistemas.data && <details><summary>Nova assinatura</summary><Formulario campos={camposAssinatura(sistemas.data)} onSalvar={novaAssinatura.mutateAsync} botao="Criar" /></details>}
      </Secao>
      <Secao titulo="Faturas">{faturas.data && <TabelaFaturas faturas={faturas.data} mostrarCliente={false} />}</Secao>
    </>
  );
}
