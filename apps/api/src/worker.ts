// Processo único de jobs agendados. Um lock no Postgres garante uma só instância ativa.
import { pool, q } from './db.ts';
import { rodarUptime, rodarVencimentos } from './jobs/uptime.ts';
import { gerarFaturas, marcarVencidas, sincronizarAsaas } from './jobs/faturas.ts';

const MIN = 60_000;
const JOBS: [string, number, () => Promise<unknown>][] = [
  ['uptime', MIN, rodarUptime],
  ['asaas', 5 * MIN, sincronizarAsaas],
  ['faturas', 60 * MIN, async () => { await gerarFaturas(); await marcarVencidas(); }],
  ['vencimentos', 6 * 60 * MIN, rodarVencimentos],
  ['limpeza', 24 * 60 * MIN, () => q(`delete from check_saude where checado_em < now() - interval '90 days';
    delete from evento_bruto where ocorrido_em < now() - interval '30 days'; delete from sessao where expira_em < now();`)],
];

const lock = await pool.connect();
while (!(await lock.query('select pg_try_advisory_lock(7002) as ok')).rows[0].ok) {
  console.log('outro worker está ativo; aguardando...');
  await new Promise((r) => setTimeout(r, 30_000));
}
console.log('worker ativo');

for (const [nome, cada, fn] of JOBS) {
  let rodando = false;
  const rodar = async () => {
    if (rodando) return; // não sobrepõe execuções lentas
    rodando = true;
    try { await fn(); } catch (e) { console.error(`job ${nome} falhou`, e); } finally { rodando = false; }
  };
  void rodar();
  setInterval(rodar, cada);
}
