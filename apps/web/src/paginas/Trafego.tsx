// Tráfego dos sites: Google Analytics 4 + Cloudflare Pages (deploys e Web Analytics), num só lugar.
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CloudCog, Lightbulb, RefreshCw, Rocket, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { Carregando, Kpi, Secao, Vazio } from '../ui';

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function Variacao({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <small>—</small>;
  const I = pct >= 0 ? TrendingUp : TrendingDown;
  return <span className={`pill ${pct <= -30 ? 'vencida' : pct >= 10 ? 'paga' : ''}`}><I size={12} aria-hidden /> {pct > 0 ? '+' : ''}{pct}%</span>;
}

const DEPLOY: Linha = { success: ['no ar', 'paga'], failure: ['falhou', 'vencida'], active: ['publicando', 'aguardando'], canceled: ['cancelado', ''] };
export function DeployPill({ d }: { d: Linha | null | undefined }) {
  if (!d) return <small>—</small>;
  const [t, c] = DEPLOY[d.status] ?? [d.status ?? '—', ''];
  return <span className={`pill ${c}`} title={d.mensagem ?? ''}>{t}</span>;
}

function Mini({ dias }: { dias: Linha[] }) {
  if (!dias.length) return <small>—</small>;
  return (
    <div style={{ width: 110, height: 28 }} aria-hidden>
      <ResponsiveContainer><LineChart data={dias.slice(-14)}><Line dataKey="visitas" stroke="#a5b4fc" strokeWidth={1.6} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
    </div>
  );
}

export default function Trafego() {
  const t = useDados<Linha[]>('/trafego', { refetchInterval: 60_000 });
  const cf = useDados('/cloudflare'), ga = useDados('/google');
  if (!t.data || !cf.data || !ga.data) return <><h1>Tráfego</h1><Carregando q={t} /></>;
  const conectado = cf.data.conectado || ga.data.conectado;
  const com = t.data.filter((s) => s.fonte || s.deploy);
  const semana = com.reduce((a, s) => a + (s.semana?.atual ?? 0), 0), anterior = com.reduce((a, s) => a + (s.semana?.anterior ?? 0), 0);
  const falhos = com.filter((s) => s.deploy?.status === 'failure').length;
  return (
    <>
      <header className="titulo"><h1>Tráfego</h1>
        <div className="acoes"><Link to="/configuracoes#cloudflare" className="botao secundario"><CloudCog size={16} aria-hidden /> Conexões</Link></div>
      </header>
      {!conectado ? (
        <Secao titulo="Comece aqui">
          <Vazio icone={TrendingUp} titulo="Conecte o Cloudflare e o Google Analytics"
            texto="Com o Cloudflare você vê deploys e visitas dos sites no Pages (sem cookies, grátis). Com o Google Analytics, usuários, origens, conversões e quem está no site agora."
            acao={<Link to="/configuracoes#cloudflare" className="botao">Conectar agora</Link>} />
        </Secao>
      ) : <>
        <div className="kpis">
          <Kpi titulo="Visitas (7 dias)" valor={n(semana)} sub={<Variacao pct={anterior ? Math.round(((semana - anterior) / anterior) * 100) : null} />} />
          <Kpi titulo="Conversões (28 dias)" valor={n(com.reduce((a, s) => a + (s.conversoes ?? 0), 0))} sub="eventos-chave do GA" />
          <Kpi titulo="No site agora" valor={n(com.reduce((a, s) => a + (s.agora ?? 0), 0))} sub="Google Analytics, tempo real" />
          <Kpi titulo="Deploys com falha" valor={falhos} sub={falhos ? 'veja abaixo' : 'tudo publicado'} />
        </div>
        <Secao titulo="Sites">
          {!com.length ? <Vazio icone={Users} titulo="Nenhum site com dados ainda"
            texto="Os sistemas são ligados sozinhos ao projeto do Cloudflare e à propriedade do GA pelo repositório ou endereço. Se faltar algum, escolha em Sistemas → Dados. A primeira leitura pode levar até 30 minutos." /> : (
            <table>
              <thead><tr><th>Sistema</th><th>Visitas 7d</th><th>vs semana anterior</th><th>14 dias</th><th>Conversões</th><th>Agora</th><th>Deploy</th><th>Fonte</th></tr></thead>
              <tbody>{com.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/sistemas/${s.id}`}>{s.nome}</Link><br /><small>{s.cliente}</small></td>
                  <td>{n(s.semana?.atual)}</td><td><Variacao pct={s.semana?.pct} /></td><td><Mini dias={s.dias} /></td>
                  <td>{n(s.conversoes)}</td><td>{n(s.agora)}</td><td><DeployPill d={s.deploy} /></td>
                  <td>{s.erro ? <span className="pill vencida" title={s.erro}>erro</span> : <small>{s.fonte === 'ga' ? 'Google Analytics' : s.fonte === 'cloudflare' ? 'Cloudflare' : '—'}</small>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Secao>
        {com.some((s) => s.dicas.length) && (
          <Secao titulo="O que fazer agora">
            <ul className="lista">{com.flatMap((s) => s.dicas.map((d: string, i: number) => (
              <li key={`${s.id}-${i}`}><Lightbulb size={15} aria-hidden /><span style={{ flex: 1 }}><Link to={`/sistemas/${s.id}`}><strong>{s.nome}</strong></Link>: {d}</span></li>
            )))}</ul>
            <p><small>Peça ao Marcos (marketing) ou à Lara (design) em Agentes: “analise o tráfego do site X e proponha melhorias”. Eles leem estes mesmos números.</small></p>
          </Secao>
        )}
      </>}
    </>
  );
}

function Top({ titulo, itens }: { titulo: string; itens?: Linha[] }) {
  if (!itens?.length) return null;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="top">
      <strong>{titulo}</strong>
      <ul>{itens.slice(0, 6).map((i) => (
        <li key={i.nome}><span className="top-nome" title={i.nome}>{i.nome}</span><span className="top-barra"><span style={{ width: `${(i.valor / max) * 100}%` }} /></span><small>{n(i.valor)}</small></li>
      ))}</ul>
    </div>
  );
}

// Painel na página do sistema.
export function PainelTrafego({ s }: { s: Linha }) {
  const atualizar = useAcao(() => api(`/sistemas/${s.id}/trafego/atualizar`, 'POST'));
  const t = s.trafego;
  const ga = t?.ga && !t.ga.erro ? t.ga : null, c = t?.cloudflare;
  const fonte = ga ?? c?.analytics;
  const acao = <button className="secundario" disabled={atualizar.isPending} onClick={() => atualizar.mutate(undefined)}>
    <RefreshCw size={14} aria-hidden className={atualizar.isPending ? 'girando-svg' : ''} /> Atualizar</button>;
  if (!t) return (
    <Secao titulo="Tráfego" acoes={(s.cf_projeto || s.ga_propriedade) && acao}>
      <Vazio icone={TrendingUp} titulo="Sem dados de tráfego"
        texto={s.cf_projeto || s.ga_propriedade ? 'Ligado; clique em Atualizar para a primeira leitura.' : 'Conecte o Cloudflare e/ou o Google Analytics em Configurações: este sistema é ligado sozinho pelo repositório ou endereço.'}
        acao={!(s.cf_projeto || s.ga_propriedade) && <Link to="/configuracoes#cloudflare">Conectar</Link>} />
    </Secao>
  );
  const deploys: Linha[] = (c?.deploys ?? []).filter((d: Linha) => d?.data);
  const datas = new Set((fonte?.dias ?? []).map((d: Linha) => d.data));
  return (
    <Secao titulo="Tráfego (28 dias)" acoes={acao}>
      {(t.ga?.erro || c?.erro) && <p className="erro">{t.ga?.erro ?? c?.erro}</p>}
      {ga && (
        <div className="kpis mini">
          <div><strong>{n(ga.totais.usuarios)}</strong> <small>usuários</small></div>
          <div><strong>{n(ga.totais.sessoes)}</strong> <small>sessões</small></div>
          <div><strong>{Math.round(ga.totais.engajamento * 100)}%</strong> <small>engajadas</small></div>
          <div><strong>{n(ga.totais.conversoes)}</strong> <small>conversões</small></div>
          {ga.agora != null && <div><span className="dot ok" aria-hidden /> <strong>{ga.agora}</strong> <small>agora</small></div>}
        </div>
      )}
      {fonte?.dias?.length ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={fonte.dias}>
            <defs><linearGradient id="gTraf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} /><stop offset="100%" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" tickFormatter={dia} minTickGap={30} /><YAxis width={40} allowDecimals={false} />
            <Tooltip labelFormatter={(d) => dia(String(d))} />
            <Area dataKey="visitas" name={ga ? 'Sessões' : 'Visitas'} stroke="#a5b4fc" strokeWidth={2} fill="url(#gTraf)" />
            {/* deploys no gráfico: mostra se uma publicação mudou o tráfego */}
            {deploys.filter((d) => datas.has(d.data.slice(0, 10))).map((d) => (
              <ReferenceLine key={d.id} x={d.data.slice(0, 10)} stroke={d.status === 'failure' ? '#f87171' : '#34d399'} strokeDasharray="4 3" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : <p className="ajuda">{c && !c.analytics ? 'Ative o Web Analytics no projeto do Cloudflare Pages (Metrics → Web Analytics → Enable) para ver as visitas aqui.' : 'Sem visitas no período.'}</p>}
      {!!deploys.length && <p><small><Rocket size={12} aria-hidden /> Linhas tracejadas = deploys (verde publicado, vermelho falhou).</small></p>}
      <div className="tops">
        <Top titulo="Páginas mais vistas" itens={fonte?.paginas} />
        <Top titulo={ga ? 'Canais' : 'Origens'} itens={fonte?.origens} />
        <Top titulo="Aparelhos" itens={fonte?.aparelhos} />
        {ga && <Top titulo="Eventos" itens={ga.eventos} />}
      </div>
      {c?.deploy && <p className="linha"><small>Último deploy ({c.projeto}): <DeployPill d={c.deploy} /> {c.deploy.mensagem && <>“{c.deploy.mensagem}” · </>}{data(c.deploy.data)}</small></p>}
      {!!t.dicas?.length && <ul className="lista">{t.dicas.map((d: string) => <li key={d}><Lightbulb size={15} aria-hidden /><span style={{ flex: 1 }}>{d}</span></li>)}</ul>}
      {s.trafego_atualizado_em && <p><small>Atualizado em {data(s.trafego_atualizado_em)} · automático a cada 30 minutos.</small></p>}
    </Secao>
  );
}
