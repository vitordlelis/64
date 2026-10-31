import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { camposSistema } from '../campos';
import { Carregando, Formulario, Kpi, Secao, Status } from '../ui';

export function Sistemas() {
  const sistemas = useDados<Linha[]>('/sistemas');
  const clientes = useDados<Linha[]>('/clientes');
  const criar = useAcao((v: Linha) => api('/sistemas', 'POST', v), false);
  const nome = (cid: string) => clientes.data?.find((c) => c.id === cid)?.nome ?? '—';
  return (
    <>
      <h1>Sistemas</h1>
      <Secao titulo="Lista">
        <Carregando q={sistemas} />
        <table>
          <thead><tr><th>Status</th><th>Sistema</th><th>Cliente</th><th>URL</th><th>SSL vence</th><th>Domínio vence</th></tr></thead>
          <tbody>{sistemas.data?.map((s) => (
            <tr key={s.id}><td><Status s={s.status_saude} /></td><td><Link to={`/sistemas/${s.id}`}>{s.nome}</Link></td>
              <td><Link to={`/clientes/${s.cliente_id}`}>{nome(s.cliente_id)}</Link></td><td><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></td>
              <td>{data(s.ssl_expira_em)}</td><td>{data(s.dominio_expira_em)}</td></tr>
          ))}</tbody>
        </table>
      </Secao>
      {clientes.data && <Secao titulo="Novo sistema"><Formulario campos={camposSistema(clientes.data)} onSalvar={criar.mutateAsync} botao="Cadastrar" /></Secao>}
    </>
  );
}

export function Sistema() {
  const { id } = useParams();
  const sistema = useDados(`/sistemas/${id}`);
  const saude = useDados(`/sistemas/${id}/saude`, { refetchInterval: 30_000 });
  const salvar = useAcao((v: Linha) => api(`/sistemas/${id}`, 'PATCH', v), false);
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
      <Secao titulo="Tempo de resposta (24h)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={h?.checks.filter((c: Linha) => c.origem === 'principal').map((c: Linha) => ({ hora: new Date(c.checado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), ms: c.latencia_ms }))}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hora" minTickGap={40} /><YAxis unit=" ms" width={70} />
            <Tooltip /><Line dataKey="ms" name="Latência" stroke="#0ea5e9" dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </Secao>
      <div className="grid2">
        <Secao titulo="Incidentes">
          {!h?.incidentes.length ? <p>Nenhum incidente.</p> : (
            <table><thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Descrição</th></tr></thead>
              <tbody>{h.incidentes.map((i: Linha) => <tr key={i.id}><td>{i.tipo}</td><td>{data(i.inicio_em)}</td><td>{i.fim_em ? data(i.fim_em) : <strong className="erro">em andamento</strong>}</td><td>{i.descricao}</td></tr>)}</tbody></table>
          )}
        </Secao>
        <ChaveIngestao id={s.id} />
        <Secao titulo="Dados e base de conhecimento"><Formulario key={s.id} campos={camposSistema()} inicial={s} onSalvar={salvar.mutateAsync} /></Secao>
      </div>
    </>
  );
}

function ChaveIngestao({ id }: { id: string }) {
  const [chave, setChave] = useState('');
  const gerar = useAcao(async () => setChave((await api<Linha>(`/sistemas/${id}/chave-ingestao`, 'POST')).chave));
  const exemplo = `fetch('${location.origin}/api/ingest/eventos', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vlc-chave': '${chave || 'SUA_CHAVE'}' },
  body: JSON.stringify([{ tipo: 'login_falho', ip: req.ip, caminho: '/login' }]),
}).catch(() => {}); // tipos: login_falho, http_4xx, http_5xx, req`;
  return (
    <Secao titulo="Segurança: envio de eventos">
      <p className="ajuda">O sistema do cliente envia eventos (login falho, 4xx, 5xx) para o SOC detectar ataques. Gerar uma nova chave invalida a anterior.</p>
      <button onClick={() => (!chave || confirm('Gerar outra chave? A atual deixa de funcionar.')) && gerar.mutate(undefined)}>Gerar chave de ingestão</button>
      {chave && <p role="status"><strong>Copie agora, ela não será mostrada de novo:</strong> <code>{chave}</code></p>}
      <pre>{exemplo}</pre>
    </Secao>
  );
}
