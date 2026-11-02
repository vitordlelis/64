import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, Bot, Box, ChartLine, CircleCheck, CornerDownLeft, LayoutDashboard, LogOut, Menu, MessageSquare,
  Power, Receipt, RotateCw, ScrollText, Search, Server, Settings, ShieldCheck, TrendingUp, Users, X, type LucideProps,
} from 'lucide-react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { api, useDados, type Linha } from './api';
import { lerNumero } from './lib/numero';
import { avisar, confirmar } from './feedback';

export type Campo = {
  nome: string; rotulo: string; obrigatorio?: boolean; opcoes?: [string, string][];
  tipo?: 'text' | 'email' | 'date' | 'datetime-local' | 'url' | 'number' | 'dinheiro' | 'select' | 'textarea';
};

// Sem `inicial` = criação (campos vazios são omitidos para valer o padrão do banco); com `inicial` = edição (vazio vira null).
export function Formulario({ campos, inicial, onSalvar, botao = 'Salvar' }:
  { campos: Campo[]; inicial?: Linha; onSalvar: (v: Linha) => Promise<unknown>; botao?: string }) {
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(ref.current!);
    const v: Linha = {};
    for (const c of campos) {
      const s = String(fd.get(c.nome) ?? '').trim();
      if (s === '') { if (inicial) v[c.nome] = null; continue; }
      v[c.nome] = c.tipo === 'dinheiro' ? Math.round(Number(s) * 100) : c.tipo === 'number' ? Number(s) : s;
    }
    setErro(''); setSalvando(true);
    try { await onSalvar(v); if (!inicial) ref.current?.reset(); avisar(inicial ? 'Alterações salvas' : 'Cadastrado com sucesso'); }
    catch (x) { setErro((x as Error).message); } finally { setSalvando(false); }
  }

  return (
    <form ref={ref} className="form" onSubmit={enviar}>
      {campos.map((c) => {
        const valor = inicial?.[c.nome];
        const props = { name: c.nome, required: c.obrigatorio, defaultValue: c.tipo === 'dinheiro' && valor != null ? (valor / 100).toFixed(2) : valor ?? '' };
        return (
          <label key={c.nome}>{c.rotulo}{c.obrigatorio && ' *'}
            {c.tipo === 'select' ? <select {...props}>{!c.obrigatorio && <option value="">—</option>}{c.opcoes?.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              : c.tipo === 'textarea' ? <textarea {...props} rows={5} />
              : <input {...props} type={c.tipo === 'dinheiro' ? 'number' : c.tipo ?? 'text'} step={c.tipo === 'dinheiro' ? '0.01' : undefined} min={c.tipo === 'dinheiro' ? 0 : undefined} />}
          </label>
        );
      })}
      {erro && <p role="alert" className="erro">{erro}</p>}
      <div><button disabled={salvando} aria-busy={salvando}>{salvando && <RotateCw size={14} className="girando-svg" aria-hidden />}{salvando ? 'Salvando…' : botao}</button></div>
    </form>
  );
}

// Número que "conta" até o valor quando aparece ou muda.
export function Contador({ valor }: { valor: string | number }) {
  const texto = String(valor);
  const n = lerNumero(texto);
  const alvo = n?.valor ?? NaN;
  const [atual, setAtual] = useState(alvo);
  const de = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(alvo) || matchMedia('(prefers-reduced-motion: reduce)').matches) { setAtual(alvo); return; }
    const inicio = performance.now(), origem = de.current;
    let id = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / 700), e = 1 - (1 - k) ** 3;
      setAtual(origem + (alvo - origem) * e);
      if (k < 1) id = requestAnimationFrame(passo); else de.current = alvo;
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [alvo]);
  if (!n || !Number.isFinite(alvo)) return <>{texto}</>;
  return <>{n.antes}{n.formatar(atual)}{n.depois}</>;
}

export const Kpi = ({ titulo, valor, sub }: { titulo: string; valor: ReactNode; sub?: ReactNode }) => (
  <div className="card kpi"><span>{titulo}</span><strong>{typeof valor === 'string' || typeof valor === 'number' ? <Contador valor={valor} /> : valor}</strong>{sub && <small>{sub}</small>}</div>
);

const ROTULO: Linha = { verde: 'No ar', amarelo: 'Atenção', vermelho: 'Fora do ar', desconhecido: 'Sem dados' };
export const Status = ({ s }: { s: string }) => <span className="status"><span className={`dot ${s}`} aria-hidden />{ROTULO[s] ?? s}</span>;

export const Secao = ({ titulo, children, acoes, id }: { titulo: string; children: ReactNode; acoes?: ReactNode; id?: string }) => (
  <section className="card" id={id}><header><h2>{titulo}</h2>{acoes}</header>{children}</section>
);

export function Carregando({ q, linhas = 3 }: { q: { isLoading: boolean; error: Error | null }; linhas?: number }) {
  if (q.error) return <p role="alert" className="erro">{q.error.message}</p>;
  if (!q.isLoading) return null;
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => <span key={i} style={{ width: `${92 - i * 17}%` }} />)}
    </div>
  );
}

// Estado vazio: diz o que é a tela e qual o próximo passo.
export function Vazio({ icone: I = Box, titulo, texto, acao }: { icone?: ComponentType<LucideProps>; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <span className="vazio-icone"><I size={22} aria-hidden /></span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  );
}

type Item = { to: string; t: string; I: ComponentType<LucideProps> };
const GRUPOS: [string, Item[]][] = [
  ['Painel', [{ to: '/', t: 'Visão geral', I: LayoutDashboard }, { to: '/escritorio', t: 'Escritório 3D', I: Box }]],
  ['Negócio', [{ to: '/clientes', t: 'Clientes', I: Users }, { to: '/faturas', t: 'Faturas', I: Receipt }, { to: '/financeiro', t: 'Financeiro', I: ChartLine }, { to: '/mensagens', t: 'Mensagens', I: MessageSquare }]],
  ['Operação', [{ to: '/sistemas', t: 'Sistemas', I: Server }, { to: '/saude', t: 'Saúde', I: Activity }, { to: '/trafego', t: 'Tráfego', I: TrendingUp }, { to: '/seguranca', t: 'Segurança', I: ShieldCheck }]],
  ['Inteligência', [{ to: '/agentes', t: 'Agentes', I: Bot }, { to: '/aprovacoes', t: 'Aprovações', I: CircleCheck }]],
  ['Conta', [{ to: '/notificacoes', t: 'Notificações', I: Bell }, { to: '/auditoria', t: 'Auditoria', I: ScrollText }, { to: '/configuracoes', t: 'Configurações', I: Settings }]],
];
const ITENS = GRUPOS.flatMap(([, l]) => l);
const ABAS: Item[] = ['/', '/sistemas', '/escritorio', '/aprovacoes'].map((to) => ITENS.find((i) => i.to === to)!).map((i) => (i.to === '/' ? { ...i, t: 'Início' } : i.to === '/escritorio' ? { ...i, t: 'Escritório' } : i));
const tituloDe = (path: string) => ITENS.find((i) => i.to !== '/' && path.startsWith(i.to))?.t ?? (path === '/' ? 'Visão geral' : 'VL Command');

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Busca rápida (Ctrl/⌘ + K): telas, clientes, sistemas e agentes.
function Paleta({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const nav = useNavigate();
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(0);
  const dialogo = useRef<HTMLDialogElement>(null);
  const clientes = useDados<Linha[]>('/clientes', { enabled: aberta });
  const sistemas = useDados<Linha[]>('/sistemas', { enabled: aberta });
  const agentes = useDados('/agentes', { enabled: aberta });
  useEffect(() => {
    if (aberta && !dialogo.current?.open) { setBusca(''); setSel(0); dialogo.current?.showModal(); }
    if (!aberta && dialogo.current?.open) dialogo.current.close();
  }, [aberta]);
  const opcoes = useMemo(() => {
    const todas: { t: string; sub: string; to: string; I: ComponentType<LucideProps> }[] = [
      ...ITENS.map((i) => ({ t: i.t, sub: 'Tela', to: i.to, I: i.I })),
      ...(clientes.data ?? []).map((c) => ({ t: c.nome, sub: 'Cliente', to: `/clientes/${c.id}`, I: Users })),
      ...(sistemas.data ?? []).map((s) => ({ t: s.nome, sub: 'Sistema', to: `/sistemas/${s.id}`, I: Server })),
      ...((agentes.data?.agentes ?? []) as Linha[]).map((a) => ({ t: `Falar com ${a.nome}`, sub: 'Agente', to: '/agentes', I: Bot })),
    ];
    const b = semAcento(busca.trim());
    return (b ? todas.filter((o) => semAcento(`${o.t} ${o.sub}`).includes(b)) : todas).slice(0, 12);
  }, [busca, clientes.data, sistemas.data, agentes.data]);
  const ir = (to: string) => { fechar(); nav(to, { viewTransition: true }); };
  return (
    <dialog ref={dialogo} className="modal paleta" aria-label="Busca rápida" onCancel={(e) => { e.preventDefault(); fechar(); }}
      onClick={(e) => { if (e.target === dialogo.current) fechar(); }}>
      <div className="paleta-busca">
        <Search size={18} aria-hidden />
        <input autoFocus value={busca} placeholder="Buscar telas, clientes, sistemas…" aria-label="Buscar"
          onChange={(e) => { setBusca(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, opcoes.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && opcoes[sel]) ir(opcoes[sel]!.to);
          }} />
        <kbd>Esc</kbd>
      </div>
      <ul role="listbox" aria-label="Resultados">
        {opcoes.map((o, i) => (
          <li key={`${o.sub}-${o.to}-${o.t}`} role="option" aria-selected={i === sel} className={i === sel ? 'sel' : ''}
            onMouseEnter={() => setSel(i)} onClick={() => ir(o.to)}>
            <o.I size={16} aria-hidden /><span>{o.t}</span><small>{o.sub}</small>{i === sel && <CornerDownLeft size={14} aria-hidden />}
          </li>
        ))}
        {!opcoes.length && <li className="nada">Nada encontrado para “{busca}”.</li>}
      </ul>
    </dialog>
  );
}

export function Layout() {
  const nav = useNavigate();
  const local = useLocation();
  const me = useDados('/auth/me');
  const notif = useDados<Linha[]>('/notificacoes', { refetchInterval: 30_000 });
  const naoLidas = notif.data?.filter((n) => !n.lida_em).length ?? 0;
  // Celular: tabelas viram cartões; cada célula recebe o nome da sua coluna (data-rotulo) para aparecer ao lado do valor.
  useEffect(() => {
    let pedido = 0;
    const rotular = () => document.querySelectorAll('main.pagina table').forEach((t) => {
      const nomes = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
      t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => {
        if (td.getAttribute('data-rotulo') !== nomes[i]) td.setAttribute('data-rotulo', nomes[i] ?? '');
      }));
    });
    rotular();
    const obs = new MutationObserver(() => { cancelAnimationFrame(pedido); pedido = requestAnimationFrame(rotular); });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); cancelAnimationFrame(pedido); };
  }, []);
  // Links com #seção (ex.: /sistemas/x#dados): a seção só existe depois que os dados carregam, então tenta por até 3 s.
  useEffect(() => {
    if (!local.hash) return;
    let n = 0;
    const t = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(local.hash.slice(1)));
      if (el || ++n > 30) { clearInterval(t); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }, 100);
    return () => clearInterval(t);
  }, [local.pathname, local.hash]);
  const pendentes = useDados<Linha[]>('/tarefas?status=aguardando', { refetchInterval: 15_000 }).data?.length ?? 0;
  const badge: Record<string, number> = { '/notificacoes': naoLidas, '/aprovacoes': pendentes };
  const [menu, setMenu] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [parado, setParado] = useState<'desligado' | 'reiniciando' | null>(null);

  useEffect(() => {
    setMenu(false);
    document.title = `${tituloDe(local.pathname)} · VL Command`;
    if (!local.hash) window.scrollTo({ top: 0 }); // tela nova começa do topo
  }, [local.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // barra no topo só no primeiro carregamento e ao salvar; as atualizações automáticas de fundo não piscam a barra
  const carregando = useIsFetching({ predicate: (q) => q.state.data === undefined }) + useIsMutating() > 0;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((v) => !v); } };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => {
    if (parado !== 'reiniciando') return;
    // espera o sistema sair do ar e voltar; a sessão continua válida, então só recarrega a página
    let caiu = false;
    const id = setInterval(async () => {
      const ok = await fetch('/api/health').then((r) => r.ok).catch(() => false);
      if (!ok) caiu = true;
      else if (caiu) location.reload();
    }, 3000);
    return () => clearInterval(id);
  }, [parado]);

  if (parado) return (
    <main className="login"><div className="card cartao-login" role="status">
      {parado === 'desligado' ? <>
        <span className="marca grande"><Power size={22} /></span>
        <h1>VL Command desligado</h1>
        <p>Para ligar de novo, dê dois cliques no atalho <strong>VL Command</strong> da área de trabalho.</p>
      </> : <>
        <span className="marca grande girando"><RotateCw size={22} /></span>
        <h1>Reiniciando…</h1>
        <p>O sistema está sendo religado. Esta página volta sozinha quando ele estiver no ar (cerca de 1 minuto).</p>
        <p><small>Se não voltar em 3 minutos, confira a janela preta do atalho ou ligue pelo atalho <strong>VL Command</strong>.</small></p>
      </>}
    </div></main>
  );
  if (!me.data) return <div className="tela-carregando"><span className="marca grande girando"><RotateCw size={20} /></span></div>;

  const sistema = async (acao: 'reiniciar' | 'desligar') => {
    const ok = await confirmar(acao === 'reiniciar'
      ? { titulo: 'Reiniciar o VL Command?', texto: 'Tudo é desligado e religado (cerca de 1 minuto). Esta página volta sozinha.', acao: 'Reiniciar' }
      : { titulo: 'Desligar o VL Command?', texto: 'Para ligar de novo, use o atalho na área de trabalho.', acao: 'Desligar', perigo: true });
    if (!ok) return;
    await api(`/sistema/${acao}`, 'POST');
    setParado(acao === 'reiniciar' ? 'reiniciando' : 'desligado');
  };

  return (
    <div className={`app ${menu ? 'menu-aberto' : ''}`}>
      <aside className="lateral" aria-label="Menu principal">
        <Link to="/" className="logo"><span className="marca">VL</span><span>VL Command</span></Link>
        <nav>
          {GRUPOS.map(([g, itens]) => (
            <div key={g} className="grupo">
              <span className="grupo-titulo">{g}</span>
              {itens.map(({ to, t, I }) => (
                <NavLink key={to} to={to} end={to === '/'} viewTransition>
                  <I size={17} aria-hidden /><span>{t}</span>
                  {badge[to] ? <span className="badge" aria-label={`${badge[to]} pendente(s)`}>{badge[to]}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="usuario">
          <span className="avatar-u" aria-hidden>{me.data.email[0]?.toUpperCase()}</span>
          <span className="usuario-email" title={me.data.email}>{me.data.email}</span>
          <div className="usuario-acoes">
            {me.data.pode_desligar && <button className="icone" title="Reiniciar sistema" aria-label="Reiniciar sistema" onClick={() => sistema('reiniciar')}><RotateCw size={16} /></button>}
            {me.data.pode_desligar && <button className="icone perigo" title="Desligar sistema" aria-label="Desligar sistema" onClick={() => sistema('desligar')}><Power size={16} /></button>}
            <button className="icone" title="Sair" aria-label="Sair" onClick={async () => { await api('/auth/logout', 'POST'); nav('/login'); }}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="veu" onClick={() => setMenu(false)} aria-hidden />
      <div className="principal">
        <header className="topo">
          <div className={`progresso ${carregando ? 'ativo' : ''}`} aria-hidden />
          <button className="icone so-movel" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button>
          <button className="busca" onClick={() => setPaleta(true)} aria-label="Busca rápida (Ctrl + K)">
            <Search size={16} aria-hidden /><span>Buscar ou ir para…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="topo-acoes">
            {pendentes > 0 && <Link to="/aprovacoes" className="chip-aprovacao"><CircleCheck size={15} aria-hidden />{pendentes} para aprovar</Link>}
            <Link to="/notificacoes" className="icone sino" aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ''}`}>
              <Bell size={18} />{naoLidas > 0 && <span className="ponto" />}
            </Link>
          </div>
        </header>
        <main key={local.pathname} className="pagina"><Outlet /></main>
      </div>
      {/* celular: atalhos para as telas mais usadas, ao alcance do polegar */}
      <nav className="abas-movel" aria-label="Atalhos">
        {ABAS.map(({ to, t, I }) => (
          <NavLink key={to} to={to} end={to === '/'} viewTransition>
            <I size={20} aria-hidden /><span>{t}</span>
            {badge[to] ? <span className="badge">{badge[to]}</span> : null}
          </NavLink>
        ))}
        <button onClick={() => setMenu(true)} aria-label="Abrir menu completo"><Menu size={20} aria-hidden /><span>Menu</span></button>
      </nav>
      <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
    </div>
  );
}
