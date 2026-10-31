// Cliente mínimo da API v3 do Asaas (https://docs.asaas.com).
export const asaasAtivo = () => Boolean(process.env.ASAAS_API_KEY);

export async function asaas(caminho: string, method = 'GET', body?: object) {
  const r = await fetch((process.env.ASAAS_URL ?? 'https://api.asaas.com/v3') + caminho, {
    method,
    headers: { 'content-type': 'application/json', access_token: process.env.ASAAS_API_KEY!, 'user-agent': 'vl-command' },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Asaas ${method} ${caminho}: ${r.status} ${JSON.stringify(j.errors ?? j)}`);
  return j;
}
