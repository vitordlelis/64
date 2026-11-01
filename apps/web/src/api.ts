import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { avisar } from './feedback';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = Record<string, any>;

export async function api<T = Linha>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const temCorpo = body !== undefined;
  const r = await fetch('/api' + url, {
    method, credentials: 'same-origin',
    headers: temCorpo ? { 'content-type': 'application/json' } : {},
    body: temCorpo ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && url !== '/auth/login') location.assign('/login');
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.erro ?? j?.message ?? `Erro ${r.status}`);
  return j as T;
}

export const useDados = <T = Linha>(url: string, opts: Partial<UseQueryOptions<T>> = {}) =>
  useQuery<T>({ queryKey: [url], queryFn: () => api<T>(url), ...opts });

// Qualquer escrita invalida todas as consultas: simples e sempre consistente.
// Botões mostram o erro num aviso flutuante; formulários (alertar = false) mostram o erro no próprio formulário.
export function useAcao<A>(fn: (a: A) => Promise<unknown>, alertar = true) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries(), onError: (e) => alertar && avisar(e.message, 'erro') });
}

export const brl = (cent: number | null | undefined) =>
  ((cent ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const data = (d: string | null | undefined) =>
  !d ? '—' : d.length === 10 ? d.split('-').reverse().join('/') : new Date(d).toLocaleString('pt-BR');
export const pct = (x: number | null | undefined, casas = 1) => (x == null ? '—' : `${(x * 100).toFixed(casas)}%`);
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
