// Visão geral em blocos (bento), no visual do componente de tech stack, só com dados reais do VL Command.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { brl, data, MESES, useDados, type Linha } from '../api';
const ROTULO_STATUS: Linha = { verde: 'No ar', amarelo: 'Atenção', vermelho: 'Fora do ar', desconhecido: 'Sem dados' };
import { FUNCAO, ESTADO } from './Agentes';

// Conta suavemente do valor anterior até o novo.
function useNumeroAnimado(alvo: number, duracao = 700) {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { atual.current = alvo; setValor(alvo); return; }
    const de = atual.current, t0 = performance.now();
    let f = 0;
    const passo = (agora: number) => {
      const t = Math.min((agora - t0) / duracao, 1);
      atual.current = de + (alvo - de) * (1 - (1 - t) ** 3);
      setValor(atual.current);
      if (t < 1) f = requestAnimationFrame(passo);
    };
    f = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(f);
  }, [alvo, duracao]);
  return valor;
}

const curva = (p: { x: number; y: number }[]) => p.reduce((d, q, i) => {
  if (!i) return `M ${q.x} ${q.y}`;
  const a = p[i - 1]!, m = (a.x + q.x) / 2;
  return `${d} C ${m} ${a.y}, ${m} ${q.y}, ${q.x} ${q.y}`;
}, '');
const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function Latencia({ serie, sistemas }: { serie: Linha[]; sistemas: Linha[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ms = serie.map((s) => s.ms as number);
  const ultimo = ms.at(-1) ?? 0;
  const animado = useNumeroAnimado(ultimo, 500);
  const teto = Math.max(100, ...ms) * 1.15;
  const pontos = ms.map((v, i) => ({ x: ms.length > 1 ? (i / (ms.length - 1)) * 100 : 50, y: 95 - (v / teto) * 85 }));
  const linha = curva(pontos);
  const mostrado = hover ?? pontos.length - 1;
  const mover = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * (pontos.length - 1)));
  };
  const ordenados = [...sistemas].sort((a, b) => (a.status_saude === 'verde' ? 1 : 0) - (b.status_saude === 'verde' ? 1 : 0)).slice(0, 6);
  return (
    <section className="card g2 alto">
      <header><h2>Latência dos sistemas</h2>{ms.length > 0 && <span className="ao-vivo">Ao vivo</span>}</header>
      {!ms.length ? <p className="ajuda">Sem medições nas últimas 6 horas. Cadastre sistemas e o monitor mede a cada minuto.</p> : <>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <div><span className="grande">{Math.round(animado)}</span> <small>ms</small></div>
          <small>média <b style={{ color: '#e2e8f0' }}>{Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)} ms</b> · pico <b style={{ color: '#e2e8f0' }}>{Math.max(...ms)} ms</b></small>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 130, cursor: 'crosshair' }} onMouseMove={mover} onMouseLeave={() => setHover(null)}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
            role="img" aria-label="Latência média dos sistemas nas últimas 6 horas">
            <defs><linearGradient id="lat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity=".35" /><stop offset="100%" stopColor="#818cf8" stopOpacity="0" /></linearGradient></defs>
            {[25, 50, 75].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,.06)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
            <path d={`${linha} L 100 100 L 0 100 Z`} fill="url(#lat)" />
            <path d={linha} fill="none" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px rgba(129,140,248,.7))' }} />
            {hover !== null && <line x1={pontos[hover]!.x} x2={pontos[hover]!.x} y1="0" y2="100" stroke="rgba(165,180,252,.45)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          </svg>
          <span aria-hidden style={{ position: 'absolute', left: `${pontos[mostrado]!.x}%`, top: `${pontos[mostrado]!.y}%`, width: 12, height: 12, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '2px solid #c7d2fe', background: '#6366f1', boxShadow: '0 0 12px rgba(129,140,248,.9)', pointerEvents: 'none' }} />
          {hover !== null && (
            <div aria-hidden className="previa" style={{ position: 'absolute', margin: 0, padding: '.3rem .6rem', fontSize: '.75rem', whiteSpace: 'nowrap', pointerEvents: 'none', transform: 'translate(-50%,-115%)',
              left: `clamp(48px, ${pontos[hover]!.x}%, calc(100% - 48px))`, top: `${pontos[hover]!.y}%`, background: 'rgba(22,26,43,.95)' }}>
              <small>{hora(serie[hover]!.t)}</small><br /><b>{ms[hover]} ms</b>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fraco)', margin: '.4rem 0 .6rem' }}><span>{hora(serie[0]!.t)}</span><span>agora</span></div>
      </>}
      <ul className="lista" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', columnGap: '1.25rem' }}>
        {ordenados.map((s) => (
          <li key={s.id} style={{ borderBottom: 0, justifyContent: 'space-between' }}>
            <Link to={`/sistemas/${s.id}`} style={{ color: '#cbd5e1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <span className={`dot ${s.status_saude}`} role="img" aria-label={ROTULO_STATUS[s.status_saude] ?? s.status_saude} />{s.nome}</Link>
            <small style={{ fontVariantNumeric: 'tabular-nums' }}>{s.latencia_ms != null ? `${s.latencia_ms} ms` : '—'}</small>
          </li>
        ))}
      </ul>
      {sistemas.length > 6 && <small><Link to="/saude">ver todos os {sistemas.length} sistemas →</Link></small>}
    </section>
  );
}

const MARCA: Linha = { critico: ['✗', '#fb7185'], aviso: ['!', '#fbbf24'], info: ['✓', '#34d399'] };

function Atividade({ notif }: { notif: Linha[] }) {
  const linhas = notif.slice(0, 10).reverse();
  return (
    <section className="card alto" style={{ '--brilho': '232, 121, 249' } as CSSProperties}>
      <header><h2>Atividade recente</h2><Link to="/notificacoes"><small>ver todas</small></Link></header>
      <div className="terminal" role="log" aria-label="Atividade recente">
        {!linhas.length && <div><span style={{ color: 'var(--fraco)' }}>›</span><span style={{ color: 'var(--fraco)' }}>Nada aconteceu ainda.</span></div>}
        {linhas.map((n) => (
          <div key={n.id}>
            <span style={{ color: MARCA[n.severidade]?.[1], width: '.8rem', flexShrink: 0, textAlign: 'center' }}>{MARCA[n.severidade]?.[0] ?? '›'}</span>
            <span style={{ minWidth: 0, color: n.lida_em ? '#94a3b8' : '#e2e8f0' }}>
              {n.link ? <Link to={n.link}>{n.titulo}</Link> : n.titulo} <span style={{ color: 'var(--fraco)' }}>· {data(n.criado_em).slice(0, 17)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Anel({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  const r = 20, c = 2 * Math.PI * r, v = valor == null ? 0 : Math.max(0, Math.min(valor, 1));
  const cor = valor == null ? '#475569' : v >= 0.95 ? '#34d399' : v >= 0.8 ? '#fbbf24' : '#fb7185';
  return (
    <div className="anel">
      <div style={{ position: 'relative', width: 58, height: 58 }}>
        <svg viewBox="0 0 50 50" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx="25" cy="25" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
          <circle cx="25" cy="25" r={r} fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round" strokeDasharray={c}
            strokeDashoffset={c * (1 - v)} style={{ '--de': `${c}`, filter: `drop-shadow(0 0 4px ${cor})` } as CSSProperties} />
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: '.8rem', fontWeight: 600, color: '#fff' }}>
          {valor == null ? '—' : `${Math.round(v * 100)}%`}
        </span>
      </div>
      {rotulo}
    </div>
  );
}

function Indicadores({ f, sistemas }: { f: Linha; sistemas: Linha[] }) {
  const ups = sistemas.map((s) => s.uptime_24h).filter((u) => u != null).map(Number);
  return (
    <section className="card" style={{ '--brilho': '52, 211, 153' } as CSSProperties}>
      <header><h2>Indicadores</h2></header>
      <div className="aneis">
        <Anel rotulo="Uptime 24h" valor={ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length / 100 : null} />
        <Anel rotulo="Meta do mês" valor={f.meta_mes ? f.receita_mes / f.meta_mes : null} />
        <Anel rotulo="Adimplência" valor={f.inadimplencia.taxa != null && f.mrr + f.inadimplencia.valor > 0 ? 1 - f.inadimplencia.taxa : null} />
      </div>
    </section>
  );
}

function Mrr({ f }: { f: Linha }) {
  const animado = useNumeroAnimado(f.mrr ?? 0);
  const mesAtual = new Date().getMonth();
  const barras: number[] = f.mensal.slice(0, mesAtual + 1).map((m: Linha) => m.projeto + m.recorrente);
  const max = Math.max(1, ...barras);
  return (
    <section className="card" style={{ '--brilho': '34, 211, 238' } as CSSProperties}>
      <header><h2>MRR</h2><small>ARR {brl(f.arr)}</small></header>
      <div className="medio">{brl(Math.round(animado))}</div>
      <small style={{ marginTop: '.35rem' }}>receita do mês {brl(f.receita_mes)} · em atraso {brl(f.inadimplencia.valor)}</small>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 4, height: 56, paddingTop: '.75rem' }} role="img" aria-label="Receita recebida por mês neste ano">
        {barras.map((v, i) => (
          <span key={i} title={`${MESES[i]}: ${brl(v)}`} style={{ flex: 1, borderRadius: 3, height: `${Math.max((v / max) * 100, 6)}%`, transition: 'height .7s ease-out',
            background: i === barras.length - 1 ? '#67e8f9' : 'rgba(34,211,238,.3)', boxShadow: i === barras.length - 1 ? '0 0 10px rgba(103,232,249,.8)' : 'none' }} />
        ))}
      </div>
    </section>
  );
}

const COR_AGENTE: Linha = { diretor: '167, 139, 250', marketing: '244, 114, 182', designer: '251, 191, 36', engenheiro: '96, 165, 250', soc: '52, 211, 153', pentester: '148, 163, 184' };

function Equipe({ agentes, pendentes }: { agentes: Linha[]; pendentes: number }) {
  const [ativo, setAtivo] = useState<Linha | null>(null);
  return (
    <section className="card g4" style={{ '--brilho': '251, 191, 36' } as CSSProperties}>
      <header><h2>Equipe de agentes</h2>{pendentes > 0 ? <Link to="/aprovacoes">{pendentes} aprovação(ões) esperando você →</Link> : <small>nada pendente</small>}</header>
      <div className="equipe">
        {agentes.map((a) => (
          <Link key={a.id} to="/escritorio" className="membro" style={{ '--cor': COR_AGENTE[a.funcao] } as CSSProperties}
            onMouseEnter={() => setAtivo(a)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(a)} onBlur={() => setAtivo(null)}>
            <span className="avatar">{a.nome[0]}</span>
            <span style={{ color: '#e2e8f0', fontSize: '.85rem' }}>{a.nome}</span>
            <small style={{ color: a.estado === 'aguardando' ? '#fcd34d' : a.estado === 'trabalhando' ? '#7dd3fc' : undefined }}>{a.ativo ? ESTADO[a.estado] : 'Pausado'}</small>
          </Link>
        ))}
      </div>
      <p className="ajuda" style={{ marginTop: '.9rem', minHeight: '1.3rem' }} aria-live="polite">
        {ativo ? `${ativo.nome} · ${FUNCAO[ativo.funcao]}${ativo.ultima?.resumo ? ` — ${ativo.ultima.resumo.slice(0, 140)}` : ''}` : 'Passe o mouse em um agente para ver o que ele fez por último; clique para abrir o escritório.'}
      </p>
    </section>
  );
}

export function Inicio() {
  const fin = useDados('/financeiro', { refetchInterval: 60_000 });
  const saude = useDados('/saude', { refetchInterval: 15_000 });
  const serie = useDados<Linha[]>('/saude/latencia', { refetchInterval: 60_000 });
  const notif = useDados<Linha[]>('/notificacoes', { refetchInterval: 15_000 });
  const ag = useDados('/agentes', { refetchInterval: 10_000 });
  const pend = useDados<Linha[]>('/tarefas?status=aguardando', { refetchInterval: 15_000 });
  const sistemas: Linha[] = saude.data?.sistemas ?? [];
  const abertos = saude.data?.incidentes.filter((i: Linha) => !i.fim_em).length ?? 0;
  return (
    <>
      <header className="titulo">
        <h1>Visão geral</h1>
        <small>{sistemas.length ? `${sistemas.filter((s) => s.status_saude === 'verde').length}/${sistemas.length} sistemas no ar · ${abertos} incidente(s) aberto(s)` : ''}</small>
      </header>
      {!sistemas.length && saude.data && (
        <p className="aviso-demo" style={{ marginBottom: '1rem' }}>Nenhum sistema cadastrado ainda. <Link to="/clientes">Cadastre um cliente</Link> e depois os sistemas dele para ver os números aqui.</p>
      )}
      <div className="bento">
        <Latencia serie={serie.data ?? []} sistemas={sistemas} />
        <Atividade notif={notif.data ?? []} />
        {fin.data && <Indicadores f={fin.data} sistemas={sistemas} />}
        {fin.data && <Mrr f={fin.data} />}
        <Equipe agentes={ag.data?.agentes ?? []} pendentes={pend.data?.length ?? 0} />
      </div>
      <p className="ajuda" style={{ marginTop: '1rem' }}>Valores e medições reais do VL Command · atualizados automaticamente{fin.data?.meta_mes ? '' : ' · defina metas em Configurações para ver o anel "Meta do mês"'}.</p>
    </>
  );
}
