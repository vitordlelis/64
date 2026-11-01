import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { camposSistema } from '../campos';
import { Carregando, Formulario, Kpi, Secao, Status, Vazio } from '../ui';
import { Plus, Server } from 'lucide-react';
import { avisar, confirmar } from '../feedback';

export function Sistemas() {
  const sistemas = useDados<Linha[]>('/sistemas');
  const clientes = useDados<Linha[]>('/clientes');
  const criar = useAcao((v: Linha) => api('/sistemas', 'POST', v), false);
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
          <thead><tr><th>Status</th><th>Sistema</th><th>Cliente</th><th>URL</th><th>SSL vence</th><th>Domínio vence</th></tr></thead>
          <tbody>{sistemas.data?.map((s) => (
            <tr key={s.id}><td><Status s={s.status_saude} /></td><td><Link to={`/sistemas/${s.id}`}>{s.nome}</Link></td>
              <td><Link to={`/clientes/${s.cliente_id}`}>{nome(s.cliente_id)}</Link></td><td><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></td>
              <td>{data(s.ssl_expira_em)}</td><td>{data(s.dominio_expira_em)}</td></tr>
          ))}</tbody>
        </table>}
      </Secao>
      {!!clientes.data?.length && <Secao titulo="Novo sistema" id="novo"><Formulario campos={camposSistema(clientes.data)} onSalvar={criar.mutateAsync} botao="Cadastrar" /></Secao>}
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
        <ChaveIngestao id={s.id} />
        <PenTest s={s} />
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
      <button onClick={async () => (!chave || await confirmar({ titulo: 'Gerar outra chave?', texto: 'A chave atual deixa de funcionar imediatamente.', acao: 'Gerar nova chave', perigo: true })) && gerar.mutate(undefined)}>Gerar chave de ingestão</button>
      {chave && <p role="status"><strong>Copie agora, ela não será mostrada de novo:</strong> <code>{chave}</code></p>}
      <pre>{exemplo}</pre>
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
