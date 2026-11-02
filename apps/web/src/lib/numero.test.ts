// node src/lib/numero.test.ts
import assert from 'node:assert/strict';
import { lerNumero } from './numero.ts';
const caso = (t: string, valor: number) => { const n = lerNumero(t)!; assert.equal(n.valor, valor, t); assert.equal(n.antes + n.formatar(n.valor) + n.depois, t, t); };
caso('R$ 1.234,56', 1234.56);
caso('R$ 0,00', 0);
caso('98%', 98);
caso('US$ 0.25', 0.25);
caso('1.400', 1400);
caso('12 ms', 12);
caso('3', 3);
caso('-46%', -46);
caso('R$ 128.750', 128750);
assert.equal(lerNumero('—'), null);
console.log('lerNumero ok');
