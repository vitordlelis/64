import { q } from './db.ts';

type Severidade = 'info' | 'aviso' | 'critico';
export async function notificar(tipo: string, severidade: Severidade, titulo: string, link?: string) {
  await q('insert into notificacao (tipo, severidade, titulo, link) values ($1,$2,$3,$4)', [tipo, severidade, titulo, link ?? null]);
  const { RESEND_API_KEY, ADMIN_EMAIL, EMAIL_FROM, APP_URL } = process.env;
  if (severidade === 'info' || !RESEND_API_KEY || !ADMIN_EMAIL) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM ?? 'VL Command <alertas@vlsystems.com.br>', to: ADMIN_EMAIL,
      subject: `[VL Command] ${titulo}`, text: `${titulo}\n\n${link ? (APP_URL ?? '') + link : ''}`,
    }),
  }).then((r) => { if (!r.ok) console.error('e-mail de alerta falhou', r.status); })
    .catch((e) => console.error('e-mail de alerta falhou', e));
}
