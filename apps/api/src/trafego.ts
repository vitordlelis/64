// Tráfego de cada sistema: deploys e visitas do Cloudflare Pages + métricas do Google Analytics 4.
// Liga sozinho sistema <-> projeto/propriedade pelo repositório ou pelo endereço, avisa deploy com falha e queda de visitas,
// e gera dicas práticas a partir dos números (usadas na tela e pelos agentes).
import { q } from './db.ts';
import { notificar } from './notificar.ts';
import { analyticsSite, contaCloudflare, deploysPages, projetosPages, sitesAnalytics } from './cloudflare.ts';
import { chaveGoogle, relatorioGa } from './google.ts';

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const host = (u?: string | null) => { try { return u ? new URL(u).hostname : null; } catch { return null; } };
const soma = (l: J[], k: string) => l.reduce((a, x) => a + (x[k] ?? 0), 0);

// Visitas dos últimos 7 dias contra os 7 anteriores (dias = série diária, mais antiga primeiro).
export function variacaoSemanal(dias: J[]) {
  const atual = soma(dias.slice(-7), 'visitas'), anterior = soma(dias.slice(-14, -7), 'visitas');
  return { atual, anterior, pct: anterior ? Math.round(((atual - anterior) / anterior) * 100) : null };
}

export function dicas(t: J): string[] {
  const d: string[] = [];
  const ga = t.ga && !t.ga.erro ? t.ga : null, cfa = t.cloudflare?.analytics;
  const fonte = ga ?? cfa;
  if (t.cloudflare?.deploy?.status === 'failure') d.push(`O último deploy no Cloudflare falhou (${t.cloudflare.deploy.mensagem ?? 'sem mensagem'}): o site continua na versão anterior. Veja o log do build no Cloudflare.`);
  if (!fonte) return d;
  const v = variacaoSemanal(fonte.dias ?? []);
  if (v.pct != null && v.anterior >= 20 && v.pct <= -30) d.push(`As visitas caíram ${-v.pct}% nesta semana (${v.atual} contra ${v.anterior}). Confira se houve deploy, queda ou mudança nos anúncios/redes.`);
  if (v.pct != null && v.anterior >= 20 && v.pct >= 50) d.push(`As visitas subiram ${v.pct}% nesta semana. Descubra a origem (abaixo) e reforce o que funcionou.`);
  const ap = fonte.aparelhos ?? [], totalAp = soma(ap, 'valor');
  const cel = ap.filter((a: J) => /mobile|smartphone|tablet/i.test(a.nome)).reduce((a: number, x: J) => a + x.valor, 0);
  if (totalAp >= 30 && cel / totalAp >= 0.6) d.push(`${Math.round((cel / totalAp) * 100)}% acessam pelo celular: priorize a versão mobile (botões grandes, WhatsApp visível, carregamento rápido).`);
  if (ga) {
    if (ga.totais.sessoes >= 30 && ga.totais.engajamento < 0.4) d.push(`Só ${Math.round(ga.totais.engajamento * 100)}% das visitas são engajadas: deixe a primeira tela mais clara (o que é, para quem, e um botão de ação).`);
    if (ga.totais.sessoes >= 30 && !ga.totais.conversoes) d.push('Nenhuma conversão registrada: marque como “evento-chave” no GA o envio de formulário, clique no WhatsApp ou compra, para medir resultado e não só visitas.');
    const org = ga.origens?.find((o: J) => /organic search/i.test(o.nome));
    if (ga.totais.sessoes >= 50 && (!org || org.valor / ga.totais.sessoes < 0.1)) d.push('Pouco tráfego vindo do Google (busca orgânica): vale cuidar do SEO (títulos, descrição, Google Meu Negócio).');
    if (ga.totais.sessoes >= 30 && ga.totais.conversoes) d.push(`Taxa de conversão: ${((ga.totais.conversoes / ga.totais.sessoes) * 100).toFixed(1)}% das sessões (28 dias).`);
  }
  return d;
}

export async function sincronizarTrafego(sistemaId?: string) {
  const cfc = await contaCloudflare(), gk = await chaveGoogle();
  if (!cfc && !gk) return;
  const projetos = cfc ? await projetosPages(cfc.token, cfc.conta).catch(() => null) : null;
  const sites = cfc ? await sitesAnalytics(cfc.token, cfc.conta) : [];
  const [gi] = gk ? await q("select dados from integracao where nome = 'google'") : [];
  const props: J[] = gi?.dados.propriedades ?? [];
  const sistemas = await q(`select s.id, s.nome, s.url, s.github_repo, s.cf_projeto, s.ga_propriedade, s.trafego, c.nome as cliente
    from sistema s join cliente c on c.id = s.cliente_id where $1::uuid is null or s.id = $1 order by s.criado_em`, [sistemaId ?? null]);

  // Projeto/propriedade já ligado a outro sistema não é ligado de novo automaticamente.
  const usados = await q('select cf_projeto, ga_propriedade from sistema');
  const cfUsado = new Set(usados.map((u) => u.cf_projeto)), gaUsado = new Set(usados.map((u) => u.ga_propriedade));
  for (const s of sistemas) {
    // Liga automaticamente pelo repositório do GitHub ou pelo endereço; o admin pode trocar em "Dados".
    let h = host(s.url);
    const p = projetos?.find((x) => x.nome === s.cf_projeto)
      ?? (!s.cf_projeto ? projetos?.find((x) => !cfUsado.has(x.nome) && ((s.github_repo && x.repo === s.github_repo) || (h && (x.subdominio === h || x.dominios.includes(h))))) : undefined);
    if (p && !s.cf_projeto) cfUsado.add(p.nome);
    if (p && !s.cf_projeto) await q('update sistema set cf_projeto = $2 where id = $1 and cf_projeto is null', [s.id, p.nome]);
    if (p && !s.url) {
      const url = `https://${p.dominios.find((d) => !d.endsWith('.pages.dev')) ?? p.subdominio}`;
      await q('update sistema set url = $2 where id = $1 and url is null', [s.id, url]);
      h = host(url);
    }
    const prop = props.find((x) => x.id === s.ga_propriedade) ?? (!s.ga_propriedade && h ? props.find((x) => !gaUsado.has(x.id) && x.hosts.includes(h!)) : undefined);
    if (prop && !s.ga_propriedade) gaUsado.add(prop.id);
    if (prop && !s.ga_propriedade) await q('update sistema set ga_propriedade = $2 where id = $1 and ga_propriedade is null', [s.id, prop.id]);
    if (!p && !prop) continue;

    const t: J = { cloudflare: null, ga: null };
    if (p && cfc) {
      try {
        const tag = sites.find((x) => [p.subdominio, ...p.dominios, h].includes(x.host))?.tag;
        t.cloudflare = {
          projeto: p.nome, subdominio: p.subdominio, dominios: p.dominios, deploy: p.deploy,
          deploys: await deploysPages(cfc.token, cfc.conta, p.nome).catch(() => []),
          analytics: tag ? await analyticsSite(cfc.token, cfc.conta, tag) : null,
        };
      } catch (e) { t.cloudflare = { projeto: p.nome, erro: (e as Error).message }; }
    }
    if (prop && gk) {
      try { t.ga = { propriedade: prop.id, nome: prop.nome, medicao: prop.medicao, ...(await relatorioGa(gk, prop.id)) }; }
      catch (e) { t.ga = { propriedade: prop.id, medicao: prop.medicao, erro: (e as Error).message }; }
    }
    t.dicas = dicas(t);

    // Alertas: só uma vez por deploy com falha e uma vez por semana de queda.
    const antes = s.trafego ?? {};
    const dep = t.cloudflare?.deploy;
    if (dep?.status === 'failure' && antes.cloudflare?.deploy?.id !== dep.id) {
      await notificar('cloudflare', 'aviso', `Deploy falhou no Cloudflare: ${s.nome} (${s.cliente})`, `/sistemas/${s.id}`);
    }
    const fonte = t.ga && !t.ga.erro ? t.ga : t.cloudflare?.analytics;
    const v = fonte ? variacaoSemanal(fonte.dias ?? []) : null;
    const semana = new Date().toISOString().slice(0, 10);
    t.queda_avisada_em = antes.queda_avisada_em;
    if (v?.pct != null && v.anterior >= 20 && v.pct <= -50 && (!antes.queda_avisada_em || Date.now() - Date.parse(antes.queda_avisada_em) > 7 * 86_400_000)) {
      await notificar('trafego', 'aviso', `Visitas caíram ${-v.pct}% em ${s.nome} (${s.cliente}) nesta semana`, `/sistemas/${s.id}`);
      t.queda_avisada_em = semana;
    }
    await q('update sistema set trafego = $2, trafego_atualizado_em = now() where id = $1', [s.id, t]);
  }
}
