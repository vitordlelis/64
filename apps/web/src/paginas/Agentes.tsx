import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { Carregando, Secao } from '../ui';

export const FUNCAO: Linha = { diretor: 'Diretora (orquestradora)', marketing: 'Marketing', designer: 'Designer', engenheiro: 'Engenheiro de software', soc: 'SOC Nível 1', pentester: 'Pen Tester (sob demanda)' };
export const ESTADO: Linha = { trabalhando: 'Trabalhando', aguardando: 'Aguardando sua aprovação', ocioso: 'Ocioso' };
const usd = (v: number) => `US$ ${Number(v).toFixed(2)}`;

// Envia um pedido e acompanha até o agente responder.
export function useComando() {
  const [resposta, setResposta] = useState<{ agente: string; texto: string; status: string } | null>(null);
  const enviar = useAcao(async ({ agente, texto, voz }: { agente: Linha; texto: string; voz?: boolean }) => {
    const t = await api<Linha>(`/agentes/${agente.id}/comando`, 'POST', { texto, voz });
    setResposta({ agente: agente.nome, texto: 'Pensando…', status: 'rascunho' });
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await api<Linha>(`/tarefas/${t.id}/resposta`);
      if (r.status !== 'rascunho') {
        const texto = r.resultado?.resposta ?? r.resultado?.erro ?? '';
        setResposta({ agente: agente.nome, texto, status: r.status });
        return texto as string;
      }
    }
    return '';
  });
  return { enviar, resposta };
}

function Cartao({ a }: { a: Linha }) {
  const [texto, setTexto] = useState('');
  const [hist, setHist] = useState(false);
  const atividades = useDados<Linha[]>(`/agentes/${a.id}/atividades`, { enabled: hist });
  const salvar = useAcao((v: Linha) => api(`/agentes/${a.id}`, 'PATCH', v));
  const { enviar, resposta } = useComando();
  return (
    <section className={`card agente ${a.estado}`}>
      <header>
        <div><h2>{a.nome}</h2><small>{FUNCAO[a.funcao]}</small></div>
        <span className={`pill est-${a.estado}`}>{a.ativo ? ESTADO[a.estado] : 'Pausado'}</span>
      </header>
      {a.tarefa_atual && <p><small>Agora: {a.tarefa_atual}</small></p>}
      {a.aguardando > 0 && <p><Link to="/aprovacoes">{a.aguardando} proposta(s) aguardando você</Link></p>}
      {a.ultima && <p className="ultima"><small>{data(a.ultima.criado_em)}</small> {a.ultima.erro ? <span className="erro">Erro: {a.ultima.erro}</span> : a.ultima.resumo}</p>}
      <div className="linha">
        <label>Modelo <select value={a.modelo} onChange={(e) => salvar.mutate({ modelo: e.target.value })}>
          <option value="claude-opus-5-5">Claude Opus 5.5 (melhor)</option><option value="claude-sonnet-5-5">Claude Sonnet 5.5</option><option value="claude-haiku-5-5">Claude Haiku 5.5 (mais barato)</option>
        </select></label>
        <span><small>Hoje: {usd(a.custo_hoje_usd)} de {usd(a.teto_custo_dia_cent / 100)}</small></span>
        <button className="link" onClick={() => salvar.mutate({ ativo: !a.ativo })}>{a.ativo ? 'pausar' : 'ativar'}</button>
        <button className="link" onClick={() => setHist(!hist)}>{hist ? 'ocultar histórico' : 'histórico'}</button>
      </div>
      {a.funcao !== 'pentester' && (
        <form className="comando" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { enviar.mutate({ agente: a, texto }); setTexto(''); } }}>
          <input aria-label={`Pedido para ${a.nome}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Peça algo para ${a.nome}…`} />
          <button disabled={enviar.isPending}>Enviar</button>
        </form>
      )}
      {resposta && <div className="previa" role="status"><strong>{resposta.agente}:</strong> {resposta.texto}</div>}
      {hist && (
        <ul className="lista">{atividades.data?.map((x) => (
          <li key={x.id}><small>{data(x.criado_em)} · {x.tipo} · {usd(x.custo_usd)}</small> {x.erro ? <span className="erro">{x.erro}</span> : x.resumo}</li>
        ))}</ul>
      )}
    </section>
  );
}

export function Agentes() {
  const r = useDados('/agentes', { refetchInterval: 5000 });
  return (
    <>
      <header className="titulo"><h1>Agentes de IA</h1><Link to="/escritorio">Ver no escritório 3D →</Link></header>
      <p className="ajuda">Os agentes leem os dados do sistema e <strong>propõem</strong> ações; nada é executado sem sua aprovação em <Link to="/aprovacoes">Aprovações</Link>.
        Custos em dólar (cobrados pela Anthropic), com teto diário por agente.</p>
      {r.data && !r.data.ia_configurada && (
        <p className="aviso-demo">Os agentes estão desligados: falta a chave da API do Claude. Crie o arquivo <code>.env</code> na pasta do VL Command com a linha
          <code> ANTHROPIC_API_KEY=sua-chave</code> (obtida em console.anthropic.com) e religue o sistema.</p>
      )}
      <Carregando q={r} />
      <div className="grid2">{r.data?.agentes.map((a: Linha) => <Cartao key={a.id} a={a} />)}</div>
      <Secao titulo="Como cada um trabalha">
        <ul>
          <li><strong>Helena</strong> faz um resumo diário (em horário comercial) e pode delegar tarefas aos outros.</li>
          <li><strong>Rafael</strong> revisa incidentes e lentidão todo dia; <strong>Marcos</strong> revisa cobranças e mensagens toda semana; <strong>Lara</strong> analisa os sites uma vez por mês.</li>
          <li><strong>Vigia</strong> analisa cada alerta de segurança médio ou grave assim que ele surge.</li>
          <li><strong>Sentinela</strong> só age quando você dispara um pen test na página de um sistema.</li>
        </ul>
      </Secao>
    </>
  );
}
