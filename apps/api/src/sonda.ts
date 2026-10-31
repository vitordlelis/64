// Sonda externa: rode em outra região/provedor. Confirma quedas antes de virarem incidente.
// Uso: API_URL=https://command.exemplo.com SONDA_TOKEN=... node apps/api/src/sonda.ts
import { checar } from './jobs/uptime.ts';

const { API_URL, SONDA_TOKEN } = process.env;
if (!API_URL || !SONDA_TOKEN) throw new Error('defina API_URL e SONDA_TOKEN');
const headers = { authorization: `Bearer ${SONDA_TOKEN}`, 'content-type': 'application/json' };

async function ciclo() {
  const r = await fetch(`${API_URL}/api/sonda/alvos`, { headers });
  if (!r.ok) throw new Error(`alvos: HTTP ${r.status}`);
  const alvos: { id: string; url: string }[] = await r.json();
  const resultados = await Promise.all(alvos.map(async (a) => ({ sistema_id: a.id, ...(await checar(a.url)) })));
  const p = await fetch(`${API_URL}/api/sonda/resultados`, { method: 'POST', headers, body: JSON.stringify(resultados) });
  if (!p.ok) throw new Error(`resultados: HTTP ${p.status}`);
}

for (;;) {
  await ciclo().catch((e) => console.error('sonda', e));
  await new Promise((r) => setTimeout(r, 60_000));
}
