import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, data, MESES, useAcao, useDados, type Linha } from '../api';
import { Carregando, Secao } from '../ui';

export function Notificacoes() {
  const notif = useDados<Linha[]>('/notificacoes');
  const lida = useAcao((id: string) => api(`/notificacoes/${id}/lida`, 'POST'));
  const todas = useAcao(() => api('/notificacoes/lidas', 'POST'));
  return (
    <>
      <header className="titulo"><h1>Notificações</h1><button onClick={() => todas.mutate(undefined)}>Marcar todas como lidas</button></header>
      <Carregando q={notif} />
      <Secao titulo="Recentes">
        <ul className="lista">{notif.data?.map((n) => (
          <li key={n.id} className={`${n.severidade} ${n.lida_em ? 'lida' : ''}`}>
            <span className={`pill ${n.severidade}`}>{n.severidade}</span> {n.link ? <Link to={n.link}>{n.titulo}</Link> : n.titulo} <small>{data(n.criado_em)}</small>
            {!n.lida_em && <button className="link" onClick={() => lida.mutate(n.id)}>marcar lida</button>}
          </li>
        ))}</ul>
      </Secao>
    </>
  );
}

export function Auditoria() {
  const [busca, setBusca] = useState('');
  const log = useDados<Linha[]>(`/auditoria?busca=${encodeURIComponent(busca)}`);
  return (
    <>
      <header className="titulo">
        <h1>Auditoria</h1>
        <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setBusca(String(new FormData(e.currentTarget).get('b'))); }}>
          <label>Buscar <input name="b" defaultValue={busca} placeholder="ação, entidade, conteúdo…" /></label> <button>Buscar</button>
        </form>
      </header>
      <Carregando q={log} />
      <Secao titulo="Últimos 500 registros">
        <table>
          <thead><tr><th>Quando</th><th>Autor</th><th>Ação</th><th>Entidade</th><th>Contexto</th><th>IP</th></tr></thead>
          <tbody>{log.data?.map((l) => (
            <tr key={l.id}><td>{data(l.criado_em)}</td><td>{l.autor_tipo}</td><td>{l.acao}</td><td>{l.entidade ?? ''} <small>{l.entidade_id ?? ''}</small></td>
              <td><code className="ctx">{JSON.stringify(l.contexto)}</code></td><td>{l.ip}</td></tr>
          ))}</tbody>
        </table>
      </Secao>
    </>
  );
}

export function Configuracoes() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const metas = useDados<Linha[]>(`/metas?ano=${ano}`);
  const salvar = useAcao(async (valores: number[]) => {
    for (const [i, v] of valores.entries()) await api(`/metas/${ano}-${String(i + 1).padStart(2, '0')}-01`, 'PUT', { valor_cent: v });
  });
  const valor = (i: number) => metas.data?.find((m) => +m.mes.slice(5, 7) === i + 1)?.valor_cent ?? 0;
  return (
    <>
      <h1>Configurações</h1>
      <Secao titulo="Metas de receita" acoes={<label>Ano <input type="number" value={ano} onChange={(e) => setAno(+e.target.value)} style={{ width: '6rem' }} /></label>}>
        {metas.data && (
          <form key={ano} className="form metas" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            salvar.mutate(MESES.map((_, i) => Math.round(Number(fd.get(`m${i}`) || 0) * 100)), { onSuccess: () => alert('Metas salvas') });
          }}>
            {MESES.map((m, i) => <label key={m}>{m} (R$)<input name={`m${i}`} type="number" step="0.01" min="0" defaultValue={(valor(i) / 100).toFixed(2)} /></label>)}
            <div><button disabled={salvar.isPending}>Salvar metas</button></div>
          </form>
        )}
      </Secao>
      <Secao titulo="Conta e 2FA">
        <p>O sistema tem um único administrador. Para trocar senha ou o autenticador (2FA), rode no servidor:</p>
        <pre>docker compose exec app node apps/api/src/cli/criar-admin.ts seu@email.com</pre>
        <p>Isso gera um novo segredo de 2FA e encerra todas as sessões abertas.</p>
      </Secao>
    </>
  );
}
