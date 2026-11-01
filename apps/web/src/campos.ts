import type { Campo } from './ui';
import type { Linha } from './api';

export const CAMPOS_CLIENTE: Campo[] = [
  { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
  { nome: 'documento', rotulo: 'CPF/CNPJ (só números)' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
  { nome: 'whatsapp', rotulo: 'WhatsApp (+5511999999999)' },
  { nome: 'canal_preferido', rotulo: 'Canal preferido', tipo: 'select', obrigatorio: true, opcoes: [['whatsapp', 'WhatsApp'], ['email', 'E-mail']] },
  { nome: 'status', rotulo: 'Status', tipo: 'select', obrigatorio: true, opcoes: [['ativo', 'Ativo'], ['inativo', 'Inativo']] },
];

// Com repos (GitHub conectado) o repositório vira uma lista; sem, campo de texto "dono/nome".
export const camposSistema = (clientes?: Linha[], repos?: Linha[]): Campo[] => [
  ...(clientes ? [{ nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', obrigatorio: true, opcoes: clientes.map((c) => [c.id, c.nome]) } as Campo] : []),
  { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
  { nome: 'url', rotulo: 'URL', tipo: 'url', obrigatorio: true },
  repos ? { nome: 'github_repo', rotulo: 'Repositório no GitHub', tipo: 'select', opcoes: repos.map((r) => [r.nome, `${r.nome}${r.privado ? ' (privado)' : ''}`]) }
    : { nome: 'github_repo', rotulo: 'Repositório no GitHub (dono/nome)' },
  { nome: 'health_url', rotulo: 'URL de health check (opcional)', tipo: 'url' },
  { nome: 'latencia_limite_ms', rotulo: 'Limite de latência (ms)', tipo: 'number' },
  { nome: 'hospedagem', rotulo: 'Hospedagem' },
  { nome: 'dominio', rotulo: 'Domínio' },
  { nome: 'dominio_expira_em', rotulo: 'Domínio vence em', tipo: 'date' },
  { nome: 'ssl_expira_em', rotulo: 'SSL vence em (atualizado automaticamente)', tipo: 'date' },
  { nome: 'waf_zona_id', rotulo: 'Cloudflare: ID da zona (para bloqueio de IP)' },
  { nome: 'credenciais_ref', rotulo: 'Onde estão os acessos (referência no cofre — nunca a senha)' },
  { nome: 'notas', rotulo: 'Notas', tipo: 'textarea' },
];

export const camposAssinatura = (sistemas: Linha[]): Campo[] => [
  { nome: 'sistema_id', rotulo: 'Sistema', tipo: 'select', opcoes: sistemas.map((s) => [s.id, s.nome]) },
  { nome: 'valor_projeto_cent', rotulo: 'Valor do projeto (R$)', tipo: 'dinheiro' },
  { nome: 'valor_mensal_cent', rotulo: 'Mensalidade (R$/mês)', tipo: 'dinheiro' },
  { nome: 'ciclo', rotulo: 'Ciclo de cobrança', tipo: 'select', obrigatorio: true, opcoes: [['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual']] },
  { nome: 'dia_vencimento', rotulo: 'Dia de vencimento (1–28)', tipo: 'number' },
  { nome: 'inicio_em', rotulo: 'Início', tipo: 'date', obrigatorio: true },
  { nome: 'renovacao_em', rotulo: 'Renovação', tipo: 'date' },
];
