import { Link } from 'react-router-dom';
import { data, useDados, type Linha } from '../api';
import { Carregando, Secao, Status } from '../ui';

export function Saude() {
  const saude = useDados('/saude', { refetchInterval: 15_000 });
  const porCliente = Object.groupBy<string, Linha>(saude.data?.sistemas ?? [], (s) => s.cliente_nome);
  return (
    <>
      <h1>Saúde dos sistemas</h1>
      <p className="ajuda">Atualiza a cada 15 s. Amarelo = lento ou 1–2 falhas; vermelho = 3 falhas seguidas não desmentidas pela sonda externa.</p>
      <Carregando q={saude} />
      <div className="semaforo">
        {Object.entries(porCliente).map(([cliente, sistemas]) => (
          <section key={cliente} className="card">
            <h2>{cliente}</h2>
            <ul className="lista">{sistemas!.map((s) => (
              <li key={s.id}><Status s={s.status_saude} /> <Link to={`/sistemas/${s.id}`}>{s.nome}</Link>
                <small> {s.latencia_ms != null ? `${s.latencia_ms} ms` : ''} · 24h {s.uptime_24h ?? '—'}%</small></li>
            ))}</ul>
          </section>
        ))}
      </div>
      <Secao titulo="Incidentes">
        <table><thead><tr><th>Sistema</th><th>Tipo</th><th>Início</th><th>Fim</th><th>Descrição</th></tr></thead>
          <tbody>{saude.data?.incidentes.map((i: Linha) => (
            <tr key={i.id}><td><Link to={`/sistemas/${i.sistema_id}`}>{i.sistema_nome}</Link></td><td>{i.tipo}</td><td>{data(i.inicio_em)}</td>
              <td>{i.fim_em ? data(i.fim_em) : <strong className="erro">em andamento</strong>}</td><td>{i.descricao}</td></tr>
          ))}</tbody></table>
      </Secao>
    </>
  );
}
