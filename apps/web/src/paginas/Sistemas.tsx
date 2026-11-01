import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { camposSistema } from '../campos';
import { Carregando, Formulario, Kpi, Secao, Status, Vazio } from '../ui';
import { CircleCheck, CircleDashed, CircleX, ExternalLink, FolderGit2, GitCommitHorizontal, GitPullRequest, CircleDot, Plus, RefreshCw, Server, Tag } from 'lucide-react';
import { avisar, confirmar } from '../feedback';

export function Sistemas() {
  const sistemas = useDados<Linha[]>('/sistemas');
  const clientes = useDados<Linha[]>('/clientes');
  const criar = useAcao((v: Linha) => api('/sistemas', 'POST', v), false);
  const repos = useRepos();
  const nome = (cid: string) => clientes.data?.find((c) => c.id === cid)?.nome ?? '—';
  return (
    <>
      <header className="titulo">
        <h1>Sistemas</h1>
        {!!clientes.data?.length && <a href="#novo" className="botao"><Plus size={16} aria-hidden /> Novo sistema</a>}
      </header>
      <Secao titulo={`Lista${sistemas.data?.length ? ` · ${sistemas.data.length}` : ''}`}>
        <Carregando q={sistemas} />
        {sistemas.data && !sistemas.data.length && <Vazio icone={Server} titulo="Nenhum sistema monitorado"
          texto={clientes.data?.length ? 'Cadastre um site ou app: o monitor passa a medir disponibilidade e tempo de resposta a cada minuto.' : 'Primeiro cadastre um cliente; os sistemas ficam ligados a ele.'}
          acao={clientes.data?.length ? <a href="#novo" className="botao"><Plus size={16} aria-hidden /> Cadastrar sistema</a> : <Link to="/clientes" className="botao">Ir para Clientes</Link>} />}
        {!!sistemas.data?.length && <table>
          <thead><tr><th>Status</th><th>Sistema</th><th>Cliente</th><th>Build</th><th>URL</th><th>SSL vence</th><th>Domínio vence</th></tr></thead>
          <tbody>{sistemas.data?.map((s) => (
            <tr key={s.id}><td><Status s={s.status_saude} /></td><td><Link to={`/sistemas/${s.id}`}>{s.nome}</Link></td>
              <td><Link to={`/clientes/${s.cliente_id}`}>{nome(s.cliente_id)}</Link></td><td><CiPill s={s} /></td><td><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></td>
              <td>{data(s.ssl_expira_em)}</td><td>{data(s.dominio_expira_em)}</td></tr>
          ))}</tbody>
        </table>}
      </Secao>
      {!!clientes.data?.length && <Secao titulo="Novo sistema" id="novo"><Formulario campos={camposSistema(clientes.data, repos.data)} onSalvar={criar.mutateAsync} botao="Cadastrar" /></Secao>}
    </>
  );
}

export function Sistema() {
  const { id } = useParams();
  const sistema = useDados(`/sistemas/${id}`);
  const saude = useDados(`/sistemas/${id}/saude`, { refetchInterval: 30_000 });
  const salvar = useAcao((v: Linha) => api(`/sistemas/${id}`, 'PATCH', v), false);
  const repos = useRepos();
  if (!sistema.data) return <Carregando q={sistema} />;
  const s = sistema.data, h = saude.data;
  const up = (v: number | null) => (v == null ? '—' : `${v}%`);
  return (
    <>
      <h1>{s.nome} <Status s={s.status_saude} /></h1>
      {h && (
        <div className="kpis">
          <Kpi titulo="Uptime 24h" valor={up(h.uptime.h24)} /><Kpi titulo="Uptime 7 dias" valor={up(h.uptime.d7)} /><Kpi titulo="Uptime 30 dias" valor={up(h.uptime.d30)} />
        </div>
      )}
      <Conexoes s={s} />
      <Secao titulo="Tempo de resposta (24h)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={h?.checks.filter((c: Linha) => c.origem === 'principal').map((c: Linha) => ({ hora: new Date(c.checado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), ms: c.latencia_ms }))}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hora" minTickGap={40} /><YAxis unit=" ms" width={70} />
            <Tooltip /><Line dataKey="ms" name="Latência" stroke="#a5b4fc" strokeWidth={2} dot={false} style={{ filter: 'drop-shadow(0 0 6px rgba(129,140,248,.7))' }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </Secao>
      <div className="grid2">
        <Secao titulo="Incidentes">
          {!h?.incidentes.length ? <Vazio icone={Server} titulo="Nenhum incidente" texto="Nenhuma queda ou lentidão registrada para este sistema." /> : (
            <table><thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Descrição</th></tr></thead>
              <tbody>{h.incidentes.map((i: Linha) => <tr key={i.id}><td>{i.tipo}</td><td>{data(i.inicio_em)}</td><td>{i.fim_em ? data(i.fim_em) : <strong className="erro">em andamento</strong>}</td><td>{i.descricao}</td></tr>)}</tbody></table>
          )}
        </Secao>
        <PainelGithub s={s} />
        <PenTest s={s} />
        <Secao titulo="Dados e base de conhecimento"><Formulario key={s.id} campos={camposSistema(undefined, repos.data)} inicial={s} onSalvar={salvar.mutateAsync} /></Secao>
      </div>
    </>
  );
}

// As 3 ligações de um sistema: site (monitor), código (GitHub) e eventos de segurança (o site avisa o VL Command).
function Conexoes({ s }: { s: Linha }) {
  const c = useDados(`/sistemas/${s.id}/conexoes`, { refetchInterval: 20_000 });
  const checar = useAcao(() => api(`/sistemas/${s.id}/checar`, 'POST'));
  const [chave, setChave] = useState('');
  const gerar = useAcao(async () => setChave((await api<Linha>(`/sistemas/${s.id}/chave-ingestao`, 'POST')).chave));
  const local = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  const k = c.data;
  if (!k) return <Secao titulo="Conexões"><Carregando q={c} /></Secao>;
  const site = k.ultimo_check ? (k.ultimo_check.ok ? 'ok' : 'erro') : 'pendente';
  const codigo = !s.github_repo ? 'pendente' : k.github_erro ? 'erro' : k.github_atualizado_em ? 'ok' : 'pendente';
  const eventos = k.ultimo_evento ? 'ok' : 'pendente';
  const pedido = `Adicione monitoramento de segurança a este projeto, enviando eventos para o VL Command:
- Quando um login falhar, quando o servidor responder com erro 4xx (exceto 401) ou 5xx, envie um POST para ${location.origin}/api/ingest/eventos
- Cabeçalhos: content-type: application/json e x-vlc-chave: ${chave || 'COLE_A_CHAVE_AQUI'}
- Corpo: uma lista JSON, ex.: [{"tipo": "login_falho", "ip": "<IP do visitante>", "caminho": "/login"}]. Tipos válidos: login_falho, http_4xx, http_5xx.
- O envio deve ser feito no servidor (backend, API route, edge function ou middleware), nunca no navegador, para a chave não ficar exposta. Guarde a chave numa variável de ambiente (VLC_CHAVE).
- Não espere a resposta e ignore falhas do envio: o site nunca pode ficar lento ou quebrar por causa disso.`;
  const Item = ({ estado, titulo, children }: { estado: string; titulo: string; children: React.ReactNode }) => (
    <li className={`conexao ${estado}`}>
      <span className="conexao-icone" aria-hidden>{estado === 'ok' ? <CircleCheck size={18} /> : estado === 'erro' ? <CircleX size={18} /> : <CircleDashed size={18} />}</span>
      <div><span><strong>{titulo}</strong> <small className="conexao-estado">{estado === 'ok' ? 'conectado' : estado === 'erro' ? 'com problema' : 'pendente'}</small></span>{children}</div>
    </li>
  );
  return (
    <Secao titulo="Conexões deste sistema">
      <ul className="conexoes">
        <Item estado={site} titulo="1. Site no ar">
          <p>{k.ultimo_check ? <>Última verificação {data(k.ultimo_check.checado_em)}: {k.ultimo_check.ok ? `respondeu em ${k.ultimo_check.latencia_ms} ms` : `falhou (${k.ultimo_check.erro})`}.</> : 'Ainda não verificado.'} Funciona para qualquer site, de qualquer plataforma: basta o endereço.</p>
          <button className="secundario" disabled={checar.isPending} onClick={() => checar.mutate(undefined)}><RefreshCw size={14} aria-hidden /> Verificar agora</button>
        </Item>
        <Item estado={codigo} titulo="2. Código no GitHub">
          <p>{!k.github_conectado ? <>Conecte sua conta em <Link to="/configuracoes#github">Configurações → GitHub</Link> e depois escolha o repositório em “Dados”, abaixo.</>
            : !s.github_repo ? 'Escolha o repositório no campo “Repositório no GitHub”, em Dados, abaixo.'
            : k.github_erro ? k.github_erro : `Acompanhando ${s.github_repo}: build, commits, PRs e issues.`}</p>
          <p><small>Feito no Lovable, Bolt, v0, Cursor ou Vercel? Essas plataformas sincronizam com o GitHub: ative a sincronização lá e o repositório aparece aqui.</small></p>
        </Item>
        <Item estado={eventos} titulo="3. Eventos de segurança (opcional)">
          <p>{k.ultimo_evento ? `Último evento recebido ${data(k.ultimo_evento)}.` : 'O próprio site avisa o VL Command sobre logins falhos e erros, para o SOC detectar ataques. Exige uma pequena alteração no código do site.'}</p>
          {local && <p className="aviso-demo"><small>Este item só funciona quando o VL Command estiver na internet: hoje ele roda no seu computador ({location.host}), que os sites publicados não conseguem acessar. Os itens 1 e 2 funcionam normalmente.</small></p>}
          {!chave ? (
            <button className="secundario" onClick={async () => (!k.chave_gerada || await confirmar({ titulo: 'Gerar uma chave nova?', texto: 'A chave anterior deste sistema deixa de funcionar.', acao: 'Gerar', perigo: true })) && gerar.mutate(undefined)}>
              Gerar pedido para o construtor do site</button>
          ) : (
            <>
              <p><small>Copie o texto abaixo e cole como pedido no Lovable, Bolt, Cursor (ou envie ao desenvolvedor). A chave aparece só agora.</small></p>
              <textarea readOnly rows={9} value={pedido} onFocus={(e) => e.currentTarget.select()} aria-label="Pedido para o construtor do site" style={{ width: '100%' }} />
              <button onClick={async () => { await navigator.clipboard.writeText(pedido).then(() => avisar('Pedido copiado'), () => avisar('Selecione o texto e copie com Ctrl+C', 'info')); }}>Copiar pedido</button>
            </>
          )}
          <details><summary>Detalhes para desenvolvedores</summary><pre>{`fetch('${location.origin}/api/ingest/eventos', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vlc-chave': process.env.VLC_CHAVE },
  body: JSON.stringify([{ tipo: 'login_falho', ip: req.ip, caminho: '/login' }]),
}).catch(() => {}); // tipos: login_falho, http_4xx, http_5xx, req`}</pre></details>
        </Item>
      </ul>
    </Secao>
  );
}

function PenTest({ s }: { s: Linha }) {
  const [reg, setReg] = useState<Linha | null>(null);
  const [codigo, setCodigo] = useState('');
  const relatorios = useDados<Linha[]>(`/sistemas/${s.id}/pentests`, { refetchInterval: 10_000 });
  const autorizar = useAcao(() => api(`/sistemas/${s.id}`, 'PATCH', { pentest_autorizado: !s.pentest_autorizado }));
  const gerar = useAcao(async () => setReg(await api<Linha>(`/sistemas/${s.id}/verificacao`, 'POST')));
  const verificar = useAcao(() => api(`/sistemas/${s.id}/verificar`, 'POST'));
  const rodar = useAcao(() => api(`/sistemas/${s.id}/pentest`, 'POST', { codigo }));
  return (
    <Secao titulo="Pen test (sob demanda)">
      <p className="ajuda">Checagens passivas e autorizadas (cabeçalhos, HTTPS, arquivos expostos, cookies). Só roda em sistema da VL Systems com domínio verificado.</p>
      <ol className="passos">
        <li>{s.pentest_autorizado ? '✅ Autorizado' : 'Não autorizado'} — <button className="link" onClick={() => autorizar.mutate(undefined)}>{s.pentest_autorizado ? 'revogar' : 'autorizar'}</button></li>
        <li>{s.dominio_verificado_em ? `✅ Domínio verificado em ${data(s.dominio_verificado_em)}` : <>
          Domínio não verificado — <button className="link" onClick={() => gerar.mutate(undefined)}>mostrar registro DNS</button>
          {reg && <> · crie um registro <strong>TXT</strong> em <code>{reg.host}</code> com o valor <code>{reg.registro}</code> e <button className="link" onClick={() => verificar.mutate(undefined)}>verificar</button></>}
        </>}</li>
        <li><label>Código do autenticador <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" maxLength={6} /></label>
          <button disabled={!s.pentest_autorizado || !s.dominio_verificado_em || rodar.isPending} onClick={() => rodar.mutate(undefined)}>Executar pen test</button></li>
      </ol>
      {relatorios.data?.map((r) => (
        <details key={r.id}><summary>{data(r.criado_em)} — {r.resumo.split('\n')[0]}</summary>
          <p className="previa">{r.resumo}</p>
          <table><thead><tr><th>Achado</th><th>Severidade</th><th>Evidência</th><th>Como corrigir</th></tr></thead>
            <tbody>{r.achados.map((a: Linha, i: number) => <tr key={i}><td>{a.titulo}</td><td><span className={`pill sev-${a.severidade}`}>{a.severidade}</span></td><td><small>{a.evidencia}</small></td><td><small>{a.correcao}</small></td></tr>)}</tbody></table>
        </details>
      ))}
    </Secao>
  );
}

// Repositórios da conta conectada (undefined se o GitHub não estiver conectado).
export const useRepos = () => useDados<Linha[]>('/github/repos', { staleTime: 300_000 });

const CI: Linha = { success: ['passou', 'paga'], failure: ['falhou', 'vencida'], cancelled: ['cancelado', ''], timed_out: ['tempo esgotado', 'vencida'] };
export function CiPill({ s }: { s: Linha }) {
  if (!s.github_repo) return <small>—</small>;
  const ci = s.github_status?.ci;
  if (s.github_status?.erro) return <span className="pill vencida" title={s.github_status.erro}>erro</span>;
  if (!ci) return <span className="pill">sem build</span>;
  if (ci.status !== 'completed') return <span className="pill aguardando">rodando</span>;
  const [t, c] = CI[ci.conclusao] ?? [ci.conclusao, ''];
  return <a href={ci.url} target="_blank" rel="noreferrer" className={`pill ${c}`} style={{ textDecoration: 'none' }}>{t}</a>;
}

function PainelGithub({ s }: { s: Linha }) {
  const atualizar = useAcao(() => api(`/sistemas/${s.id}/github/atualizar`, 'POST'));
  const g = s.github_status;
  if (!s.github_repo) return (
    <Secao titulo="GitHub">
      <Vazio icone={FolderGit2} titulo="Nenhum repositório ligado"
        texto="Escolha o repositório no campo “Repositório no GitHub”, em Dados, para acompanhar build, commits, PRs e issues deste sistema."
        acao={<Link to="/configuracoes#github">Conectar o GitHub</Link>} />
    </Secao>
  );
  return (
    <Secao titulo="GitHub" acoes={<button className="secundario" disabled={atualizar.isPending} onClick={() => atualizar.mutate(undefined)}>
      <RefreshCw size={14} aria-hidden className={atualizar.isPending ? 'girando-svg' : ''} /> Atualizar</button>}>
      <p className="linha">
        <a href={g?.url ?? `https://github.com/${s.github_repo}`} target="_blank" rel="noreferrer"><FolderGit2 size={15} aria-hidden /> {s.github_repo} <ExternalLink size={12} aria-hidden /></a>
        {g?.branch && <small>branch {g.branch}</small>}<CiPill s={s} />
      </p>
      {g?.erro && <p className="erro">{g.erro}</p>}
      {!g && <p className="ajuda">Ainda não verificado. {''}Clique em Atualizar (precisa do GitHub conectado em Configurações).</p>}
      {g?.commits && <>
        <div className="kpis mini">
          <div><GitPullRequest size={15} aria-hidden /> <strong>{g.prs_abertos}</strong> <small>PRs abertos</small></div>
          <div><CircleDot size={15} aria-hidden /> <strong>{g.issues_abertas}</strong> <small>issues abertas</small></div>
          <div><Tag size={15} aria-hidden /> <strong>{g.release?.tag ?? '—'}</strong> <small>última versão</small></div>
        </div>
        {g.ci && <p><small>Último build: <a href={g.ci.url} target="_blank" rel="noreferrer">{g.ci.nome}</a> no commit <code>{g.ci.commit}</code> · {data(g.ci.data)}</small></p>}
        <ul className="lista">{g.commits.map((c: Linha) => (
          <li key={c.sha}><GitCommitHorizontal size={15} aria-hidden /><code>{c.sha}</code><a href={c.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0 }}>{c.mensagem}</a><small>{c.autor} · {data(c.data)}</small></li>
        ))}</ul>
      </>}
      {s.github_atualizado_em && <p><small>Verificado em {data(s.github_atualizado_em)} · automático a cada 10 minutos.</small></p>}
    </Secao>
  );
}
