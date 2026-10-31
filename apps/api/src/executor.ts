// Executor: o ÚNICO processo que age no mundo real (envia mensagens, bloqueia IPs).
// Só executa tarefas com status 'aprovada' — o banco garante que aprovada tem um admin em aprovada_por.
// Em produção, só este serviço deve receber RESEND/WHATSAPP/CLOUDFLARE (ver .env.example).
import { fileURLToPath } from 'node:url';
import { q } from './db.ts';
import { executar, removerBloqueio } from './acoes.ts';
import { registrar } from './auditoria.ts';
import { notificar } from './notificar.ts';

export async function processarUma(): Promise<boolean> {
  const [t] = await q(`update tarefa set status = 'executando' where id = (
      select id from tarefa where status = 'aprovada' and acao_tipo is not null order by decidida_em for update skip locked limit 1
    ) returning *`);
  if (!t) return false;
  try {
    const resultado = await executar(t);
    await q("update tarefa set status = 'concluida', executada_em = now(), resultado = $2 where id = $1", [t.id, resultado]);
    await registrar({ autor_tipo: 'executor', acao: `executou ${t.acao_tipo}`, entidade: 'tarefa', entidade_id: t.id, contexto: resultado });
  } catch (e) {
    const erro = (e as Error).message;
    await q("update tarefa set status = 'falhou', executada_em = now(), resultado = $2 where id = $1", [t.id, { erro }]);
    await registrar({ autor_tipo: 'executor', acao: `falhou ${t.acao_tipo}`, entidade: 'tarefa', entidade_id: t.id, contexto: { erro } });
    await notificar('tarefa_falhou', 'aviso', `Falha ao executar "${t.titulo}": ${erro}`, '/aprovacoes');
  }
  return true;
}

// Bloqueios vencidos saem sozinhos (o prazo fez parte do que o admin aprovou).
export async function expirarBloqueios() {
  for (const b of await q('select id from bloqueio_ip where removido_em is null and expira_em < now()')) {
    await removerBloqueio(b.id).catch((e) => console.error('desbloqueio falhou', b.id, e));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('executor ativo');
  let ciclos = 0;
  for (;;) {
    try {
      while (await processarUma());
      if (ciclos++ % 12 === 0) await expirarBloqueios();
    } catch (e) {
      console.error('executor', e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
