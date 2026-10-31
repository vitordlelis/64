import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.ts';

const dir = new URL('../../../db/migrations/', import.meta.url);

export async function migrate(reset = false) {
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock(7001)'); // duas instâncias subindo juntas não aplicam em dobro
    if (reset) {
      const { rows: [{ db }] } = await c.query('select current_database() as db');
      if (!db.endsWith('_test')) throw new Error('--reset só é permitido em banco *_test');
      await c.query('drop schema public cascade; create schema public');
    }
    await c.query('create table if not exists schema_migrations (nome text primary key, aplicada_em timestamptz not null default now())');
    const feitas = new Set((await c.query('select nome from schema_migrations')).rows.map((r) => r.nome));
    for (const nome of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      if (feitas.has(nome)) continue;
      await c.query('begin');
      try {
        await c.query(await readFile(new URL(nome, dir), 'utf8'));
        await c.query('insert into schema_migrations (nome) values ($1)', [nome]);
        await c.query('commit');
      } catch (e) {
        await c.query('rollback');
        throw e;
      }
      console.log('migração aplicada:', nome);
    }
  } finally {
    await c.query('select pg_advisory_unlock(7001)').catch(() => {});
    c.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate(process.argv.includes('--reset'));
  await pool.end();
}
