import { Link, useSearchParams } from 'react-router-dom';
import { api, brl, data, useAcao, useDados, hoje, type Linha } from '../api';
import { Carregando, Formulario, Secao, Vazio } from '../ui';
import { Receipt } from 'lucide-react';
import { confirmar } from '../feedback';

export function TabelaFaturas({ faturas, mostrarCliente = true }: { faturas: Linha[]; mostrarCliente?: boolean }) {
  const pagar = useAcao((id: string) => api(`/faturas/${id}/pagar`, 'POST'));
  const cancelar = useAcao((id: string) => api(`/faturas/${id}/cancelar`, 'POST'));
  if (!faturas.length) return <Vazio icone={Receipt} titulo="Nenhuma fatura aqui" texto="As mensalidades são geradas automaticamente a partir dos contratos; faturas avulsas você cria abaixo." />;
  return (
    <table>
      <thead><tr>{mostrarCliente && <th>Cliente</th>}<th>Tipo</th><th>Competência</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>{faturas.map((f) => (
        <tr key={f.id}>
          {mostrarCliente && <td><Link to={`/clientes/${f.cliente_id}`}>{f.cliente_nome}</Link></td>}
          <td>{f.tipo}</td><td>{data(f.competencia).slice(3)}</td><td>{data(f.vencimento)}</td><td className="num">{brl(f.valor_cent)}</td>
          <td><span className={`pill ${f.status}`}>{f.status}</span></td>
          <td className="acoes">
            {f.link_pagamento && <a href={f.link_pagamento} target="_blank" rel="noreferrer">link</a>}
            {['aberta', 'vencida'].includes(f.status) && <>
              <button className="link" onClick={async () => (await confirmar({ titulo: `Marcar ${brl(f.valor_cent)} como pago?`, texto: f.cliente_nome ? `Fatura de ${f.cliente_nome}.` : undefined, acao: 'Marcar como paga' })) && pagar.mutate(f.id)}>marcar paga</button>
              <button className="link perigo" onClick={async () => (await confirmar({ titulo: 'Cancelar esta fatura?', texto: 'A cobrança no Asaas também será cancelada.', acao: 'Cancelar fatura', perigo: true })) && cancelar.mutate(f.id)}>cancelar</button>
            </>}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function Faturas() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const faturas = useDados<Linha[]>(`/faturas?status=${status}`);
  const clientes = useDados<Linha[]>('/clientes');
  const criar = useAcao((v: Linha) => api('/faturas', 'POST', v), false);
  return (
    <>
      <header className="titulo">
        <h1>Faturas</h1>
        <label>Status <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">todas</option>{['aberta', 'vencida', 'paga', 'cancelada'].map((s) => <option key={s}>{s}</option>)}
        </select></label>
      </header>
      <Secao titulo="Lista"><Carregando q={faturas} />{faturas.data && <TabelaFaturas faturas={faturas.data} />}</Secao>
      {clientes.data && (
        <Secao titulo="Nova fatura avulsa">
          <Formulario botao="Gerar fatura" onSalvar={criar.mutateAsync} campos={[
            { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', obrigatorio: true, opcoes: clientes.data.map((c) => [c.id, c.nome]) },
            { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: [['projeto', 'Projeto (valor único)'], ['recorrente', 'Recorrente']] },
            { nome: 'valor_cent', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrigatorio: true },
            { nome: 'vencimento', rotulo: `Vencimento (hoje: ${data(hoje())})`, tipo: 'date', obrigatorio: true },
          ]} />
        </Secao>
      )}
    </>
  );
}
