import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { Carregando, Formulario, Secao } from '../ui';

const TIPO: Linha = { forca_bruta: 'Força bruta no login', pico_requisicoes: 'Pico de requisições', varredura: 'Varredura de caminhos',
  anomalia_erros: 'Anomalia de erros 5xx', pentest_achado: 'Achado de pen test', outro: 'Outro' };

export function Seguranca() {
  const [status, setStatus] = useState('');
  const eventos = useDados<Linha[]>(`/seguranca/eventos?status=${status}`, { refetchInterval: 15_000 });
  const bloqueios = useDados<Linha[]>('/seguranca/bloqueios');
  const sistemas = useDados<Linha[]>('/sistemas');
  const mudar = useAcao((a: { id: string; status: string }) => api(`/seguranca/eventos/${a.id}`, 'PATCH', { status: a.status }));
  const tarefa = useAcao((corpo: Linha) => api('/tarefas', 'POST', corpo), false);
  const ativos = bloqueios.data?.filter((b) => !b.removido_em) ?? [];
  return (
    <>
      <header className="titulo">
        <h1>Segurança (SOC Nível 1)</h1>
        <label>Status <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">todos</option>{['aberto', 'reconhecido', 'resolvido', 'falso_positivo'].map((s) => <option key={s}>{s}</option>)}
        </select></label>
      </header>
      <p className="ajuda">Somente defensivo e somente nos sistemas da VL Systems. Os sistemas enviam eventos com a chave gerada na página de cada sistema.</p>
      <Secao titulo="Linha do tempo de eventos">
        <Carregando q={eventos} />
        {eventos.data && !eventos.data.length && <p>Nenhum evento.</p>}
        <table>
          <thead><tr><th>Quando</th><th>Sistema</th><th>O que houve</th><th>Severidade</th><th>IP</th><th>Recomendação</th><th>Status</th></tr></thead>
          <tbody>{eventos.data?.map((e) => (
            <tr key={e.id}>
              <td>{data(e.detectado_em)}</td><td><Link to={`/sistemas/${e.sistema_id}`}>{e.sistema_nome}</Link><br /><small>{e.cliente_nome}</small></td>
              <td><strong>{TIPO[e.tipo]}</strong><br /><small>{e.descricao}</small></td>
              <td><span className={`pill sev-${e.severidade}`}>{e.severidade}</span></td><td><code>{e.ip ?? '—'}</code></td>
              <td><small>{e.recomendacao}</small></td>
              <td><select aria-label="Status do evento" value={e.status} onChange={(x) => mudar.mutate({ id: e.id, status: x.target.value })}>
                {['aberto', 'reconhecido', 'resolvido', 'falso_positivo'].map((s) => <option key={s}>{s}</option>)}</select></td>
            </tr>
          ))}</tbody>
        </table>
      </Secao>
      <div className="grid2">
        <Secao titulo={`IPs bloqueados (${ativos.length})`}>
          {!ativos.length ? <p>Nenhum bloqueio ativo.</p> : (
            <table><thead><tr><th>IP</th><th>Sistema</th><th>Expira</th><th></th></tr></thead>
              <tbody>{ativos.map((b) => (
                <tr key={b.id}><td><code>{b.ip}</code></td><td>{b.sistema_nome}</td><td>{data(b.expira_em)}</td>
                  <td><button className="link" onClick={() => confirm(`Desbloquear ${b.ip}?`) && tarefa.mutate({ acao_tipo: 'desbloquear_ip', acao_payload: { bloqueio_id: b.id }, titulo: `Desbloquear IP ${b.ip}`, sistema_id: b.sistema_id })}>desbloquear</button></td></tr>
              ))}</tbody></table>
          )}
        </Secao>
        {sistemas.data && (
          <Secao titulo="Bloquear um IP manualmente">
            <Formulario botao="Bloquear (exige código)" onSalvar={(v) => tarefa.mutateAsync({
              acao_tipo: 'bloquear_ip', acao_payload: { sistema_id: v.sistema_id, ip: v.ip, horas: v.horas ?? 24 },
              titulo: `Bloquear IP ${v.ip} por ${v.horas ?? 24} h`, sistema_id: v.sistema_id, codigo: v.codigo,
            })} campos={[
              { nome: 'sistema_id', rotulo: 'Sistema', tipo: 'select', obrigatorio: true, opcoes: sistemas.data.map((s) => [s.id, s.nome]) },
              { nome: 'ip', rotulo: 'IP (um só, sem faixa)', obrigatorio: true },
              { nome: 'horas', rotulo: 'Por quantas horas (máx. 720)', tipo: 'number' },
              { nome: 'codigo', rotulo: 'Código do autenticador', obrigatorio: true },
            ]} />
          </Secao>
        )}
      </div>
    </>
  );
}
