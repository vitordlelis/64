import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { Carregando, Formulario, Secao, type Campo } from '../ui';

const GATILHOS: [string, string][] = [
  ['manual', 'Só envio manual'], ['dias_vencimento', 'Dias em relação ao vencimento da fatura'], ['fatura_gerada', 'Quando a fatura é gerada'],
  ['pagamento_confirmado', 'Quando o pagamento é confirmado'], ['assinatura_expirando', 'Dias antes da renovação da assinatura'],
  ['dominio_expirando', 'Dias antes do vencimento do domínio'], ['ssl_expirando', 'Dias antes do vencimento do SSL'], ['agendado', 'Agendado (data e repetição)'],
];
const simNao: [string, string][] = [['true', 'Sim'], ['false', 'Não']];
const CAMPOS: Campo[] = [
  { nome: 'nome', rotulo: 'Nome do modelo', obrigatorio: true },
  { nome: 'canal', rotulo: 'Canal', tipo: 'select', obrigatorio: true, opcoes: [['email', 'E-mail'], ['whatsapp', 'WhatsApp']] },
  { nome: 'assunto', rotulo: 'Assunto (e-mail)' },
  { nome: 'corpo', rotulo: 'Texto — use {nome_cliente} {valor} {data_vencimento} {nome_sistema} {link_pagamento}', tipo: 'textarea', obrigatorio: true },
  { nome: 'gatilho', rotulo: 'Quando enviar', tipo: 'select', obrigatorio: true, opcoes: GATILHOS },
  { nome: 'gatilho_dias', rotulo: 'Dias (ex.: -3 = 3 dias antes; 2 = 2 dias depois)', tipo: 'number' },
  { nome: 'proximo_envio_em', rotulo: 'Agendado para (se "Agendado")', tipo: 'datetime-local' },
  { nome: 'repeticao', rotulo: 'Repetir (se "Agendado")', tipo: 'select', obrigatorio: true, opcoes: [['nenhuma', 'Não repetir'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']] },
  { nome: 'exige_confirmacao', rotulo: 'Pedir minha aprovação antes de enviar', tipo: 'select', obrigatorio: true, opcoes: simNao },
  { nome: 'horario_comercial', rotulo: 'Só em horário comercial (seg–sex, 8h–18h)', tipo: 'select', obrigatorio: true, opcoes: simNao },
  { nome: 'ativo', rotulo: 'Ativo', tipo: 'select', obrigatorio: true, opcoes: simNao },
  { nome: 'wa_template_nome', rotulo: 'WhatsApp: nome do template aprovado na Meta' },
];
// datetime-local manda "AAAA-MM-DDTHH:MM" sem fuso; converte para ISO com o fuso do navegador.
const paraApi = (v: Linha) => ({ ...v, proximo_envio_em: v.proximo_envio_em ? new Date(v.proximo_envio_em).toISOString() : v.proximo_envio_em });
const paraForm = (m: Linha) => ({ ...m, ativo: String(m.ativo), exige_confirmacao: String(m.exige_confirmacao), horario_comercial: String(m.horario_comercial),
  proximo_envio_em: m.proximo_envio_em ? new Date(new Date(m.proximo_envio_em).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : null });

function Modelos({ clientes }: { clientes: Linha[] }) {
  const modelos = useDados<Linha[]>('/modelos');
  const [edit, setEdit] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Linha | null>(null);
  const salvar = useAcao((v: Linha) => (edit ? api(`/modelos/${edit}`, 'PATCH', paraApi(v)) : api('/modelos', 'POST', paraApi(v))), false);
  const atual = modelos.data?.find((m) => m.id === edit);
  return (
    <>
      <Secao titulo="Modelos">
        <Carregando q={modelos} />
        <table>
          <thead><tr><th>Nome</th><th>Canal</th><th>Quando</th><th>Aprovação</th><th>Ativo</th><th></th></tr></thead>
          <tbody>{modelos.data?.map((m) => (
            <tr key={m.id}><td>{m.nome}</td><td>{m.canal}</td>
              <td>{GATILHOS.find(([g]) => g === m.gatilho)?.[1]}{m.gatilho_dias != null && ` (${m.gatilho_dias} dias)`}</td>
              <td>{m.exige_confirmacao ? 'pede aprovação' : 'automático'}</td><td>{m.ativo ? 'sim' : 'não'}</td>
              <td className="acoes"><button className="link" onClick={() => { setEdit(m.id); setPrevia(null); }}>editar</button>
                {clientes[0] && <button className="link" onClick={async () => setPrevia(await api('/mensagens/previa', 'POST', { modelo_id: m.id, cliente_id: clientes[0]!.id }))}>prévia</button>}</td></tr>
          ))}</tbody>
        </table>
        {previa && <div className="previa"><strong>Prévia com dados de {clientes[0]?.nome}:</strong>{previa.assunto && <p><em>{previa.assunto}</em></p>}<p>{previa.texto}</p></div>}
      </Secao>
      <Secao titulo={atual ? `Editar: ${atual.nome}` : 'Novo modelo'} acoes={atual && <button className="link" onClick={() => setEdit(null)}>novo modelo</button>}>
        <Formulario key={edit ?? 'novo'} campos={CAMPOS} inicial={atual && paraForm(atual)} onSalvar={salvar.mutateAsync} botao={atual ? 'Salvar' : 'Criar modelo'} />
      </Secao>
    </>
  );
}

function Disparo({ clientes }: { clientes: Linha[] }) {
  const nav = useNavigate();
  const modelos = useDados<Linha[]>('/modelos');
  const [modelo, setModelo] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const disparar = useAcao(() => api('/mensagens/disparo', 'POST', { modelo_id: modelo, cliente_ids: sel }));
  const ativos = clientes.filter((c) => c.status === 'ativo');
  return (
    <Secao titulo="Disparo manual">
      <p className="ajuda">Escolha o modelo e os clientes. O envio vai para <strong>Aprovações</strong>, onde você vê cada mensagem antes de confirmar.</p>
      <label>Modelo <select value={modelo} onChange={(e) => setModelo(e.target.value)}><option value="">—</option>{modelos.data?.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.canal})</option>)}</select></label>
      <fieldset className="clientes">
        <legend><button className="link" onClick={() => setSel(sel.length ? [] : ativos.map((c) => c.id))}>{sel.length ? 'desmarcar todos' : 'marcar todos'}</button></legend>
        {ativos.map((c) => (
          <label key={c.id} className="check"><input type="checkbox" checked={sel.includes(c.id)}
            onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />{c.nome}</label>
        ))}
      </fieldset>
      <button disabled={!modelo || !sel.length || disparar.isPending} onClick={() => disparar.mutate(undefined, { onSuccess: () => nav('/aprovacoes') })}>
        Preparar envio para {sel.length} cliente(s)
      </button>
    </Secao>
  );
}

function Historico() {
  const envios = useDados<Linha[]>('/envios', { refetchInterval: 15_000 });
  return (
    <Secao titulo="Histórico de envios">
      <Carregando q={envios} />
      <table>
        <thead><tr><th>Quando</th><th>Cliente</th><th>Modelo</th><th>Canal</th><th>Para</th><th>Status</th></tr></thead>
        <tbody>{envios.data?.map((e) => (
          <tr key={e.id} title={e.conteudo}><td>{data(e.criado_em)}</td><td>{e.cliente_nome}</td><td>{e.modelo_nome}</td><td>{e.canal}</td><td>{e.destino}</td>
            <td><span className={`pill ${e.status}`}>{e.status}</span>{e.erro && <small className="erro"> {e.erro}</small>}</td></tr>
        ))}</tbody>
      </table>
    </Secao>
  );
}

export function Mensagens() {
  const [aba, setAba] = useState<'modelos' | 'disparo' | 'historico'>('modelos');
  const clientes = useDados<Linha[]>('/clientes');
  const me = useDados('/auth/me');
  return (
    <>
      <h1>Mensagens</h1>
      {me.data?.modo_demonstracao && <p className="aviso-demo">Modo demonstração: as mensagens são marcadas como enviadas, mas nada sai de verdade.</p>}
      <div role="tablist" className="abas">
        {([['modelos', 'Modelos'], ['disparo', 'Disparo manual'], ['historico', 'Histórico']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativa' : ''} onClick={() => setAba(k)}>{t}</button>
        ))}
      </div>
      {clientes.data && (aba === 'modelos' ? <Modelos clientes={clientes.data} /> : aba === 'disparo' ? <Disparo clientes={clientes.data} /> : <Historico />)}
    </>
  );
}
