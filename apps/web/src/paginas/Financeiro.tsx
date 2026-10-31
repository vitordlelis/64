import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { brl, MESES, pct, useDados, type Linha } from '../api';
import { Carregando, Kpi, Secao } from '../ui';

const reais = (v: number) => brl(v * 100);
const eixo = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

export function Financeiro() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const fin = useDados(`/financeiro?ano=${ano}`);
  const f = fin.data;
  const mensal = f?.mensal.map((m: Linha, i: number) => ({
    mes: MESES[i], projeto: m.projeto / 100, recorrente: m.recorrente / 100, meta: m.meta / 100,
    ano_anterior: m.ano_anterior / 100, mrr: m.mrr / 100, churn: +(m.churn * 100).toFixed(2),
  }));
  const total = f?.mensal.reduce((s: number, m: Linha) => s + m.projeto + m.recorrente, 0) ?? 0;
  // compara o mesmo período: no ano corrente, só até o mês atual
  const ateMes = ano === anoAtual ? new Date().getMonth() : 11;
  const totalAnterior = f?.mensal.reduce((s: number, m: Linha, i: number) => (i <= ateMes ? s + m.ano_anterior : s), 0) ?? 0;

  return (
    <>
      <header className="titulo">
        <h1>Financeiro</h1>
        <label>Ano <select value={ano} onChange={(e) => setAno(+e.target.value)}>{[0, 1, 2, 3].map((d) => <option key={d}>{anoAtual - d}</option>)}</select></label>
      </header>
      <Carregando q={fin} />
      {f && (
        <>
          <div className="kpis">
            <Kpi titulo="MRR" valor={brl(f.mrr)} sub={`ARR ${brl(f.arr)}`} />
            <Kpi titulo={`Receita ${ano}`} valor={brl(total)} sub={totalAnterior ? `${pct(total / totalAnterior - 1)} vs mesmo período de ${ano - 1}` : `sem receita em ${ano - 1}`} />
            <Kpi titulo="Ticket médio" valor={brl(f.ticket_medio)} sub={`${f.clientes_ativos} cliente(s) com mensalidade`} />
            <Kpi titulo="Permanência média" valor={f.permanencia_meses == null ? '—' : `${f.permanencia_meses} meses`} />
            <Kpi titulo="Inadimplência (12m)" valor={pct(f.inadimplencia.taxa)} sub={`${brl(f.inadimplencia.valor)} em atraso`} />
          </div>
          <Secao titulo="Receita recebida por mês — projeto × recorrente">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={mensal}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={eixo} />
                <Tooltip formatter={(v) => reais(Number(v))} /><Legend />
                <Bar dataKey="recorrente" name="Recorrente" stackId="r" fill="#0ea5e9" />
                <Bar dataKey="projeto" name="Projeto" stackId="r" fill="#6366f1" />
                <Line dataKey="meta" name="Meta" stroke="#f59e0b" strokeWidth={2} />
                <Line dataKey="ano_anterior" name={`${ano - 1}`} stroke="#94a3b8" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </Secao>
          <div className="grid2">
            <Secao titulo="Evolução do MRR">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={mensal}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={eixo} />
                  <Tooltip formatter={(v) => reais(Number(v))} /><Line dataKey="mrr" name="MRR" stroke="#0ea5e9" strokeWidth={2} /></LineChart>
              </ResponsiveContainer>
            </Secao>
            <Secao titulo="Churn de receita (% do MRR cancelado no mês)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={mensal}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} /><Bar dataKey="churn" name="Churn" fill="#ef4444" /></BarChart>
              </ResponsiveContainer>
            </Secao>
          </div>
          <Secao titulo="Previsão de receita recorrente (próximos 12 meses)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={f.previsao.map((p: Linha) => ({ mes: `${MESES[+p.mes.slice(5, 7) - 1]}/${p.mes.slice(2, 4)}`, valor: p.valor / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={eixo} />
                <Tooltip formatter={(v) => reais(Number(v))} /><Bar dataKey="valor" name="Previsto" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </Secao>
          <Secao titulo="Por cliente">
            <table>
              <thead><tr><th>Cliente</th><th className="num">MRR</th><th className="num">Receita total</th><th className="num">Em atraso</th></tr></thead>
              <tbody>{f.por_cliente.map((c: Linha) => (
                <tr key={c.id}><td><Link to={`/clientes/${c.id}`}>{c.nome}</Link></td><td className="num">{brl(c.mrr)}</td>
                  <td className="num">{brl(c.receita_total)}</td><td className={`num ${c.em_atraso ? 'erro' : ''}`}>{brl(c.em_atraso)}</td></tr>
              ))}</tbody>
            </table>
          </Secao>
        </>
      )}
    </>
  );
}
