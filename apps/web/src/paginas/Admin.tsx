import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, data, MESES, useAcao, useDados, type Linha } from '../api';
import { Carregando, Secao, Vazio } from '../ui';
import { Bell, FolderGit2 } from 'lucide-react';
import { avisar, confirmar } from '../feedback';

export function Notificacoes() {
  const notif = useDados<Linha[]>('/notificacoes');
  const lida = useAcao((id: string) => api(`/notificacoes/${id}/lida`, 'POST'));
  const todas = useAcao(() => api('/notificacoes/lidas', 'POST'));
  return (
    <>
      <header className="titulo"><h1>Notificações</h1><button onClick={() => todas.mutate(undefined)}>Marcar todas como lidas</button></header>
      <Carregando q={notif} />
      <Secao titulo="Recentes">
        {notif.data && !notif.data.length && <Vazio icone={Bell} titulo="Nenhuma notificação" texto="Quedas, pagamentos, alertas de segurança e pedidos de aprovação aparecem aqui." />}
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
            salvar.mutate(MESES.map((_, i) => Math.round(Number(fd.get(`m${i}`) || 0) * 100)), { onSuccess: () => avisar('Metas salvas') });
          }}>
            {MESES.map((m, i) => <label key={m}>{m} (R$)<input name={`m${i}`} type="number" step="0.01" min="0" defaultValue={(valor(i) / 100).toFixed(2)} /></label>)}
            <div><button disabled={salvar.isPending}>Salvar metas</button></div>
          </form>
        )}
      </Secao>
      <ConexaoGithub />
      <Secao titulo="Conta e 2FA">
        <p>O sistema tem um único administrador. Para trocar senha ou o autenticador (2FA), rode no servidor:</p>
        <pre>docker compose exec app node apps/api/src/cli/criar-admin.ts seu@email.com</pre>
        <p>Isso gera um novo segredo de 2FA e encerra todas as sessões abertas.</p>
      </Secao>
    </>
  );
}

function ConexaoGithub() {
  const g = useDados('/github');
  const [token, setToken] = useState('');
  const conectar = useAcao(() => api('/github', 'PUT', { token }));
  const desconectar = useAcao(() => api('/github', 'DELETE'));
  return (
    <Secao titulo="GitHub" id="github" acoes={g.data?.conectado && <span className="pill paga">conectado</span>}>
      <Carregando q={g} />
      {g.data?.conectado ? (
        <div className="linha">
          <FolderGit2 size={20} aria-hidden />
          <span>Conectado como <strong>{g.data.login}</strong>{g.data.nome && g.data.nome !== g.data.login ? ` (${g.data.nome})` : ''}.</span>
          <small>O VL Command verifica os repositórios ligados aos sistemas a cada 10 minutos.</small>
          <button className="link perigo" onClick={async () => (await confirmar({ titulo: 'Desconectar o GitHub?', texto: 'O monitoramento dos repositórios para; os repositórios ligados aos sistemas continuam anotados.', acao: 'Desconectar', perigo: true })) && desconectar.mutate(undefined)}>desconectar</button>
        </div>
      ) : g.data && (
        <>
          <p>Conecte sua conta para o VL Command acompanhar os repositórios dos seus sistemas: build/testes (GitHub Actions), commits, PRs e issues. Os agentes também poderão propor issues, que só são criadas com a sua aprovação.</p>
          <ol className="passos">
            <li>No GitHub, abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>
            <li>Dê um nome (ex.: <em>VL Command</em>) e uma validade. Em <strong>Repository access</strong>, escolha <em>All repositories</em> (ou só os dos seus clientes).</li>
            <li>Em <strong>Repository permissions</strong>, marque: <em>Actions</em>: Read-only · <em>Contents</em>: Read-only · <em>Issues</em>: Read and write · <em>Pull requests</em>: Read-only. (<em>Metadata</em> já vem marcado.)</li>
            <li>Clique em <strong>Generate token</strong>, copie o código (começa com <code>github_pat_</code>) e cole abaixo.</li>
          </ol>
          <form className="comando" onSubmit={(e: FormEvent) => { e.preventDefault(); conectar.mutate(undefined, { onSuccess: () => { setToken(''); avisar('GitHub conectado'); } }); }}>
            <input type="password" autoComplete="off" aria-label="Token do GitHub" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
            <button disabled={token.trim().length < 20 || conectar.isPending}>{conectar.isPending ? 'Conectando…' : 'Conectar'}</button>
          </form>
          <p><small>O código fica guardado criptografado no seu computador e nunca é mostrado de novo.</small></p>
        </>
      )}
    </Secao>
  );
}
