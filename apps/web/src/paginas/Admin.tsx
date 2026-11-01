import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, data, MESES, useAcao, useDados, type Linha } from '../api';
import { Carregando, Secao, Vazio } from '../ui';
import { Bell, ChartColumn, Cloud, FolderGit2 } from 'lucide-react';
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
      <ConexaoCloudflare />
      <ConexaoGoogle />
      <Secao titulo="Conta e 2FA">
        <p>O sistema tem um único administrador. Para trocar senha ou o autenticador (2FA), rode no servidor:</p>
        <pre>docker compose exec app node apps/api/src/cli/criar-admin.ts seu@email.com</pre>
        <p>Isso gera um novo segredo de 2FA e encerra todas as sessões abertas.</p>
      </Secao>
    </>
  );
}

function ConexaoGithub() {
  const nav = useNavigate();
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
          <Link to="/sistemas/importar" className="botao">Importar repositórios</Link>
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
          <form className="comando" onSubmit={(e: FormEvent) => { e.preventDefault(); conectar.mutate(undefined, { onSuccess: () => { setToken(''); avisar('GitHub conectado. Agora escolha os repositórios.'); nav('/sistemas/importar'); } }); }}>
            <input type="password" autoComplete="off" aria-label="Token do GitHub" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
            <button disabled={token.trim().length < 20 || conectar.isPending}>{conectar.isPending ? 'Conectando…' : 'Conectar'}</button>
          </form>
          <p><small>O código fica guardado criptografado no seu computador e nunca é mostrado de novo.</small></p>
        </>
      )}
    </Secao>
  );
}

function ConexaoCloudflare() {
  const c = useDados('/cloudflare');
  const projetos = useDados<Linha[]>('/cloudflare/projetos', { enabled: !!c.data?.conectado, retry: false });
  const [token, setToken] = useState('');
  const conectar = useAcao(() => api('/cloudflare', 'PUT', { token }));
  const importar = useAcao(async () => { const r = await api<Linha>('/cloudflare/importar', 'POST'); avisar(r.importados ? `${r.importados} site(s) adicionados a Sistemas` : 'Todos os projetos já estão ligados a um sistema'); });
  const desconectar = useAcao(() => api('/cloudflare', 'DELETE'));
  const soltos = projetos.data?.filter((p) => !p.sistema).length ?? 0;
  return (
    <Secao titulo="Cloudflare Pages" id="cloudflare" acoes={c.data?.conectado && <span className="pill paga">conectado</span>}>
      <Carregando q={c} />
      {c.data?.conectado ? (
        <>
          <div className="linha">
            <Cloud size={20} aria-hidden />
            <span>Conta <strong>{c.data.conta_nome}</strong>. Deploys e visitas (Web Analytics) são lidos a cada 30 minutos.</span>
            <Link to="/trafego" className="botao">Ver tráfego</Link>
            <button className="link perigo" onClick={async () => (await confirmar({ titulo: 'Desconectar o Cloudflare?', texto: 'Deploys e visitas param de ser lidos.', acao: 'Desconectar', perigo: true })) && desconectar.mutate(undefined)}>desconectar</button>
          </div>
          {projetos.error && <p className="erro">{projetos.error.message}</p>}
          {!!projetos.data?.length && (
            <table><thead><tr><th>Projeto</th><th>Endereço</th><th>Sistema no VL Command</th></tr></thead>
              <tbody>{projetos.data.map((p) => (
                <tr key={p.nome}><td>{p.nome}</td><td><a href={`https://${p.dominios.find((d: string) => !d.endsWith('.pages.dev')) ?? p.subdominio}`} target="_blank" rel="noreferrer">{p.dominios.find((d: string) => !d.endsWith('.pages.dev')) ?? p.subdominio}</a></td>
                  <td>{p.sistema ? <Link to={`/sistemas/${p.sistema.id}`}>{p.sistema.nome}</Link> : <span className="pill aguardando">não ligado</span>}</td></tr>
              ))}</tbody></table>
          )}
          {soltos > 0 && <p><button disabled={importar.isPending} onClick={() => importar.mutate(undefined)}>{importar.isPending ? 'Adicionando…' : `Adicionar ${soltos} site(s) que faltam em Sistemas`}</button></p>}
          <p><small>Para ver visitas: em cada projeto no Cloudflare, abra Metrics → <strong>Web Analytics → Enable</strong> (grátis, sem cookies) e faça um novo deploy.</small></p>
        </>
      ) : c.data && (
        <>
          <p>Conecte para ver, de cada site no Cloudflare Pages: se o último deploy foi publicado ou falhou (com aviso), o histórico de publicações e as visitas por dia, páginas, países e origens. Os sites são ligados sozinhos aos sistemas pelo repositório ou endereço.</p>
          <ol className="passos">
            <li>No Cloudflare, abra <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Meu perfil → API Tokens</a> e clique em <strong>Create Token</strong> → <strong>Create Custom Token</strong> (no fim da página).</li>
            <li>Dê um nome (ex.: <em>VL Command</em>). Em <strong>Permissions</strong>, adicione: <em>Account · Cloudflare Pages · Read</em> e <em>Account · Account Analytics · Read</em>.</li>
            <li>Opcional, para os agentes poderem propor bloqueio de IP (sempre com sua aprovação): <em>Zone · Firewall Services · Edit</em>.</li>
            <li>Clique em <strong>Continue to summary</strong> → <strong>Create Token</strong>, copie o código e cole abaixo.</li>
          </ol>
          <form className="comando" onSubmit={(e: FormEvent) => { e.preventDefault(); conectar.mutate(undefined, { onSuccess: () => { setToken(''); avisar('Cloudflare conectado. Os sites aparecem em Tráfego em instantes.'); } }); }}>
            <input type="password" autoComplete="off" aria-label="Token do Cloudflare" placeholder="Token da API do Cloudflare" value={token} onChange={(e) => setToken(e.target.value)} />
            <button disabled={token.trim().length < 30 || conectar.isPending}>{conectar.isPending ? 'Conectando…' : 'Conectar'}</button>
          </form>
          <p><small>O token só lê (e nunca apaga nada); fica guardado criptografado no seu computador.</small></p>
        </>
      )}
    </Secao>
  );
}

function ConexaoGoogle() {
  const g = useDados('/google');
  const [chave, setChave] = useState('');
  const conectar = useAcao(() => api('/google', 'PUT', { chave }));
  const desconectar = useAcao(() => api('/google', 'DELETE'));
  const lerArquivo = async (f?: File) => f && setChave(await f.text());
  return (
    <Secao titulo="Google Analytics" id="google" acoes={g.data?.conectado && <span className="pill paga">conectado</span>}>
      <Carregando q={g} />
      {g.data?.conectado ? (
        <>
          <div className="linha">
            <ChartColumn size={20} aria-hidden />
            <span>Lendo como <code>{g.data.email}</code>.</span>
            <Link to="/trafego" className="botao">Ver tráfego</Link>
            <button className="link perigo" onClick={async () => (await confirmar({ titulo: 'Desconectar o Google Analytics?', texto: 'As métricas do GA param de ser lidas.', acao: 'Desconectar', perigo: true })) && desconectar.mutate(undefined)}>desconectar</button>
          </div>
          {!g.data.propriedades?.length ? <p className="aviso-demo"><small>Nenhuma propriedade visível. No Google Analytics, em <strong>Administrador → Gerenciamento de acesso à propriedade</strong>, adicione <code>{g.data.email}</code> como <strong>Leitor</strong> e conecte de novo (cole a mesma chave).</small></p> : (
            <table><thead><tr><th>Propriedade</th><th>Site</th><th>ID de medição</th></tr></thead>
              <tbody>{g.data.propriedades.map((p: Linha) => <tr key={p.id}><td>{p.nome} <small>({p.id})</small></td><td>{p.hosts?.join(', ') || '—'}</td><td><code>{p.medicao ?? '—'}</code></td></tr>)}</tbody></table>
          )}
          <p><small>Adicionou o acesso a outra propriedade? Conecte de novo com a mesma chave para atualizar a lista.</small></p>
        </>
      ) : g.data && (
        <>
          <p>Conecte para ver, de cada site: usuários, sessões, engajamento, conversões, de onde vêm as visitas, páginas mais vistas e quem está no site agora — junto com o monitoramento e o financeiro. Os agentes também usam esses números para sugerir melhorias.</p>
          <ol className="passos">
            <li>Abra o <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud</a> e crie um projeto (ex.: <em>vl-command</em>). É grátis.</li>
            <li>Ative as APIs <a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noreferrer">Google Analytics Data API</a> e <a href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com" target="_blank" rel="noreferrer">Google Analytics Admin API</a> (botão <strong>Ativar</strong>).</li>
            <li>Em <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer">IAM → Contas de serviço</a>, crie uma conta (ex.: <em>vl-command</em>, sem papéis). Abra-a → <strong>Chaves → Adicionar chave → JSON</strong>: um arquivo é baixado.</li>
            <li>No <a href="https://analytics.google.com/" target="_blank" rel="noreferrer">Google Analytics</a>, em <strong>Administrador → Gerenciamento de acesso à conta</strong>, adicione o e-mail da conta de serviço (termina em <code>iam.gserviceaccount.com</code>) como <strong>Leitor</strong>.</li>
            <li>Escolha o arquivo JSON abaixo e clique em Conectar.</li>
          </ol>
          <form className="comando" onSubmit={(e: FormEvent) => { e.preventDefault(); conectar.mutate(undefined, { onSuccess: () => { setChave(''); avisar('Google Analytics conectado.'); } }); }}>
            <input type="file" accept=".json,application/json" aria-label="Arquivo JSON da chave" onChange={(e) => lerArquivo(e.target.files?.[0])} />
            <button disabled={chave.length < 100 || conectar.isPending}>{conectar.isPending ? 'Conectando…' : 'Conectar'}</button>
          </form>
          <p><small>Só leitura. A chave fica guardada criptografada no seu computador; depois de conectar, apague o arquivo baixado.</small></p>
        </>
      )}
    </Secao>
  );
}
