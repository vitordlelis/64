import { Link } from 'react-router-dom';
import { brl, data, pct, useDados, type Linha } from '../api';
import { Carregando, Kpi, Secao, Status } from '../ui';

export function Inicio() {
  const fin = useDados('/financeiro');
  const saude = useDados('/saude', { refetchInterval: 15_000 });
  const notif = useDados<Linha[]>('/notificacoes');
  const f = fin.data, s = saude.data;
  const problemas = s?.sistemas.filter((x: Linha) => x.status_saude !== 'verde') ?? [];
  const abertos = s?.incidentes.filter((i: Linha) => !i.fim_em) ?? [];
  return (
    <>
      <h1>Visão geral</h1>
      <Carregando q={fin} />
      {f && (
        <div className="kpis">
          <Kpi titulo="MRR" valor={brl(f.mrr)} sub={`ARR ${brl(f.arr)}`} />
          <Kpi titulo="Receita do mês" valor={brl(f.receita_mes)} sub={f.meta_mes ? `${pct(f.receita_mes / f.meta_mes, 0)} da meta de ${brl(f.meta_mes)}` : 'sem meta definida'} />
          <Kpi titulo="Em atraso" valor={brl(f.inadimplencia.valor)} sub={`inadimplência 12m: ${pct(f.inadimplencia.taxa)}`} />
          <Kpi titulo="Sistemas" valor={`${(s?.sistemas.length ?? 0) - problemas.length}/${s?.sistemas.length ?? 0} no ar`} sub={`${abertos.length} incidente(s) aberto(s)`} />
        </div>
      )}
      <div className="grid2">
        <Secao titulo="Sistemas que precisam de atenção">
          {!s?.sistemas.length ? <p>Nenhum sistema cadastrado. <Link to="/clientes">Cadastre um cliente</Link> e depois os sistemas dele.</p> : problemas.length === 0 ? <p>Tudo no ar.</p> : (
            <ul className="lista">{problemas.map((x: Linha) => <li key={x.id}><Status s={x.status_saude} /> <Link to={`/sistemas/${x.id}`}>{x.nome}</Link> — {x.cliente_nome}</li>)}</ul>
          )}
        </Secao>
        <Secao titulo="Notificações recentes" acoes={<Link to="/notificacoes">ver todas</Link>}>
          {notif.data && !notif.data.length && <p>Nenhuma notificação.</p>}
          <ul className="lista">{notif.data?.slice(0, 6).map((n) => (
            <li key={n.id} className={n.severidade}>{n.link ? <Link to={n.link}>{n.titulo}</Link> : n.titulo} <small>{data(n.criado_em)}</small></li>
          ))}</ul>
        </Secao>
      </div>
    </>
  );
}
