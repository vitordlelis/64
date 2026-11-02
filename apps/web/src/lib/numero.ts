// Separa o primeiro número de um texto formatado (R$ 1.234,56 · 98% · US$ 0.25 · 1.400) e sabe reescrevê-lo no mesmo formato.
export function lerNumero(texto: string) {
  const m = texto.match(/-?\d[\d.,]*\d|-?\d/);
  if (!m) return null;
  const t = m[0];
  const milharPt = /^-?\d{1,3}(\.\d{3})+$/.test(t);
  const pt = t.includes(',') || milharPt;                 // 1.234,56 ou 1.400; senão 0.25 (ponto decimal)
  const valor = Number(pt ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  const decimais = pt ? (t.split(',')[1]?.length ?? 0) : (t.split('.')[1]?.length ?? 0);
  const formatar = (v: number) => (pt ? v.toLocaleString('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais }) : v.toFixed(decimais));
  return { antes: texto.slice(0, m.index), depois: texto.slice(m.index! + t.length), valor, formatar };
}
