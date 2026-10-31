// Chamada ao Claude com loop manual de ferramentas. As ferramentas dos agentes só leem dados ou
// registram PROPOSTAS no banco — nenhuma age no mundo real (isso é exclusivo do Executor).
import Anthropic from '@anthropic-ai/sdk';

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const MODELOS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

// US$ por milhão de tokens (entrada, saída) — tabela de preços da API em out/2026.
const PRECO: [string, number, number][] = [['claude-haiku-5-5', 0.1, 0.5], ['claude-sonnet-5-5', 2, 10], ['claude-opus-5-5', 4, 20]];
export function custoUsd(modelo: string, u: { input_tokens: number; output_tokens: number }) {
  const [, ent, sai] = PRECO.find(([m]) => modelo.startsWith(m)) ?? PRECO[2]!;
  return (u.input_tokens * ent + u.output_tokens * sai) / 1e6;
}

export type Ferramenta = Anthropic.Beta.BetaTool;
type Conversa = {
  modelo: string; system: string; instrucao: string; ferramentas: Ferramenta[];
  executar: (nome: string, entrada: Record<string, unknown>) => Promise<string>; maxVoltas?: number;
};

let cliente: Anthropic | undefined;

export async function conversar({ modelo, system, instrucao, ferramentas, executar, maxVoltas = 8 }: Conversa) {
  cliente ??= new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: instrucao }];
  let tokensEntrada = 0, tokensSaida = 0, custo = 0, texto = '';
  for (let volta = 0; volta < maxVoltas; volta++) {
    const r = await cliente.beta.messages.create({
      model: modelo, max_tokens: 16000, system, tools: ferramentas, messages,
      // Fallback no servidor quando o modelo recusa (Haiku não tem fallback).
      ...(modelo.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    });
    tokensEntrada += r.usage.input_tokens;
    tokensSaida += r.usage.output_tokens;
    custo += custoUsd(r.model, r.usage);
    const t = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (t) texto = t;
    if (r.stop_reason === 'refusal') throw new Error(`o modelo recusou o pedido (${r.stop_details?.category ?? 'sem categoria'})`);
    if (r.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !usos.length) break;
    messages.push({ role: 'assistant', content: r.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(usos.map(async (u) => {
      try {
        return { type: 'tool_result' as const, tool_use_id: u.id, content: await executar(u.name, u.input as Record<string, unknown>) };
      } catch (e) {
        return { type: 'tool_result' as const, tool_use_id: u.id, content: `Erro: ${(e as Error).message}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: resultados });
  }
  return { texto, tokensEntrada, tokensSaida, custo };
}
