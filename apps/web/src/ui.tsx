import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, useDados, type Linha } from './api';

export type Campo = {
  nome: string; rotulo: string; obrigatorio?: boolean; opcoes?: [string, string][];
  tipo?: 'text' | 'email' | 'date' | 'url' | 'number' | 'dinheiro' | 'select' | 'textarea';
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
    try { await onSalvar(v); if (!inicial) ref.current?.reset(); } catch (x) { setErro((x as Error).message); } finally { setSalvando(false); }
  }

  return (
    <form ref={ref} className="form" onSubmit={enviar}>
      {campos.map((c) => {
        const valor = inicial?.[c.nome];
        const props = { name: c.nome, required: c.obrigatorio, defaultValue: c.tipo === 'dinheiro' && valor != null ? (valor / 100).toFixed(2) : valor ?? '' };
        return (
          <label key={c.nome}>{c.rotulo}{c.obrigatorio && ' *'}
            {c.tipo === 'select' ? <select {...props}>{!c.obrigatorio && <option value="">—</option>}{c.opcoes?.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              : c.tipo === 'textarea' ? <textarea {...props} rows={3} />
              : <input {...props} type={c.tipo === 'dinheiro' ? 'number' : c.tipo ?? 'text'} step={c.tipo === 'dinheiro' ? '0.01' : undefined} min={c.tipo === 'dinheiro' ? 0 : undefined} />}
          </label>
        );
      })}
      {erro && <p role="alert" className="erro">{erro}</p>}
      <div><button disabled={salvando}>{salvando ? 'Salvando…' : botao}</button></div>
    </form>
  );
}

export const Kpi = ({ titulo, valor, sub }: { titulo: string; valor: ReactNode; sub?: ReactNode }) => (
  <div className="card kpi"><span>{titulo}</span><strong>{valor}</strong>{sub && <small>{sub}</small>}</div>
);

const ROTULO: Linha = { verde: 'No ar', amarelo: 'Atenção', vermelho: 'Fora do ar', desconhecido: 'Sem dados' };
export const Status = ({ s }: { s: string }) => <span className="status"><span className={`dot ${s}`} aria-hidden />{ROTULO[s] ?? s}</span>;

export const Secao = ({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) => (
  <section className="card"><header><h2>{titulo}</h2>{acoes}</header>{children}</section>
);

export const Carregando = ({ q }: { q: { isLoading: boolean; error: Error | null } }) =>
  q.isLoading ? <p>Carregando…</p> : q.error ? <p role="alert" className="erro">{q.error.message}</p> : null;

const NAV: [string, string][] = [
  ['/', 'Visão geral'], ['/financeiro', 'Financeiro'], ['/faturas', 'Faturas'], ['/clientes', 'Clientes'],
  ['/sistemas', 'Sistemas'], ['/saude', 'Saúde'], ['/notificacoes', 'Notificações'], ['/auditoria', 'Auditoria'], ['/configuracoes', 'Configurações'],
];

export function Layout() {
  const nav = useNavigate();
  const me = useDados('/auth/me');
  const notif = useDados<Linha[]>('/notificacoes', { refetchInterval: 30_000 });
  const naoLidas = notif.data?.filter((n) => !n.lida_em).length ?? 0;
  if (!me.data) return null;
  return (
    <div className="app">
      <nav aria-label="Principal">
        <strong className="logo">VL Command</strong>
        {NAV.map(([to, t]) => (
          <NavLink key={to} to={to} end={to === '/'}>{t}{to === '/notificacoes' && naoLidas > 0 && <span className="badge" aria-label={`${naoLidas} não lidas`}>{naoLidas}</span>}</NavLink>
        ))}
        <button className="link sair" onClick={async () => { await api('/auth/logout', 'POST'); nav('/login'); }}>Sair ({me.data.email})</button>
      </nav>
      <main><Outlet /></main>
    </div>
  );
}
