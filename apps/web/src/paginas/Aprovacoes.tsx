import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { Carregando, Secao, Vazio } from '../ui';
import { CircleCheck } from 'lucide-react';
import { perguntar } from '../feedback';

const ORIGEM: Linha = { evento: 'automático', admin_texto: 'você', admin_voz: 'você (voz)', autonoma: 'iniciativa do agente', diretor: 'pedido da diretora' };

function Detalhe({ id }: { id: string }) {
  const t = useDados(`/tarefas/${id}`);
  if (!t.data) return <Carregando q={t} />;
  return t.data.envios.length ? (
    <table>
      <thead><tr><th>Cliente</th><th>Para</th><th>Mensagem</th><th>Status</th></tr></thead>
      <tbody>{t.data.envios.map((e: Linha) => (
        <tr key={e.id}><td>{e.cliente_nome}</td><td>{e.destino}</td><td className="msg">{e.conteudo}</td><td>{e.status}{e.erro && <small className="erro"> {e.erro}</small>}</td></tr>
      ))}</tbody>
    </table>
  ) : <pre>{JSON.stringify(t.data.acao_payload, null, 2)}</pre>;
}

function Cartao({ t }: { t: Linha }) {
  const [aberto, setAberto] = useState(t.status === 'aguardando');
  const [codigo, setCodigo] = useState('');
  const aprovar = useAcao(() => api(`/tarefas/${t.id}/aprovar`, 'POST', { codigo }));
  const rejeitar = useAcao((motivo: string) => api(`/tarefas/${t.id}/rejeitar`, 'POST', { motivo }));
  return (
    <section className={`card tarefa ${t.status}`}>
      <header>
        <div>
          <h2>{t.titulo}</h2>
          <small>{t.agente_nome ? `${t.agente_nome} · ` : ''}{ORIGEM[t.origem] ?? t.origem} · {data(t.criada_em)}{t.sistema_nome && ` · ${t.sistema_nome}`}</small>
        </div>
        <span className={`pill ${t.status}`}>{t.status}{t.impacto === 'alto' && ' · alto impacto'}</span>
      </header>
      <p>{t.descricao}</p>
      {t.motivo_rejeicao && <p><small>Motivo da rejeição: {t.motivo_rejeicao}</small></p>}
      {t.resultado && <pre>{JSON.stringify(t.resultado, null, 2)}</pre>}
      {t.acao_tipo && <button className="link" onClick={() => setAberto(!aberto)}>{aberto ? 'ocultar detalhes' : `ver o que será feito${t.envios ? ` (${t.envios} mensagens)` : ''}`}</button>}
      {aberto && t.acao_tipo && <Detalhe id={t.id} />}
      {t.status === 'aguardando' && (
        <div className="acoes decisao">
          {t.impacto === 'alto' && <label>Código do autenticador<input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" maxLength={6} /></label>}
          <button onClick={() => aprovar.mutate(undefined)} disabled={aprovar.isPending}>Aprovar e executar</button>
          <button className="secundario" onClick={async () => { const m = await perguntar({ titulo: 'Rejeitar esta proposta?', texto: 'Nada será executado.', rotulo: 'Motivo (opcional)', placeholder: 'Ex.: agora não é o momento', acao: 'Rejeitar' }); if (m !== null) rejeitar.mutate(m); }}>Rejeitar</button>
        </div>
      )}
    </section>
  );
}

export function Aprovacoes() {
  const tarefas = useDados<Linha[]>('/tarefas', { refetchInterval: 10_000 });
  const aguardando = tarefas.data?.filter((t) => t.status === 'aguardando') ?? [];
  const resto = tarefas.data?.filter((t) => t.status !== 'aguardando') ?? [];
  return (
    <>
      <h1>Aprovações</h1>
      <p className="ajuda">Nada que tenha efeito (mensagens, bloqueios, ações dos agentes) acontece sem a sua aprovação aqui. Ações de alto impacto pedem o código do autenticador.</p>
      <Carregando q={tarefas} />
      {tarefas.data && !aguardando.length && <Secao titulo="Aguardando você"><Vazio icone={CircleCheck} titulo="Tudo em dia" texto="Quando um agente, o SOC ou uma automação propuser algo, aparece aqui para você aprovar ou rejeitar." /></Secao>}
      {aguardando.map((t) => <Cartao key={t.id} t={t} />)}
      {resto.length > 0 && (
        <Secao titulo="Histórico">
          <table>
            <thead><tr><th>Quando</th><th>Tarefa</th><th>Quem propôs</th><th>Status</th><th>Resultado</th></tr></thead>
            <tbody>{resto.map((t) => (
              <tr key={t.id}><td>{data(t.criada_em)}</td><td>{t.titulo}</td><td>{t.agente_nome ?? ORIGEM[t.origem]}</td>
                <td><span className={`pill ${t.status}`}>{t.status}</span></td>
                <td><small>{t.resultado ? JSON.stringify(t.resultado) : t.motivo_rejeicao ?? ''}</small></td></tr>
            ))}</tbody>
          </table>
        </Secao>
      )}
      <p><Link to="/mensagens">Ir para Mensagens</Link> · <Link to="/seguranca">Ir para Segurança</Link></p>
    </>
  );
}
