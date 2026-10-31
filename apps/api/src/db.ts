import pg from 'pg';

pg.types.setTypeParser(20, Number);              // bigint (centavos, ids) -> number
pg.types.setTypeParser(1700, Number);            // numeric (somas) -> number
pg.types.setTypeParser(1082, (v: string) => v);  // date fica 'AAAA-MM-DD', sem fuso

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c TimeZone=America/Sao_Paulo',      // current_date e meses no fuso do negócio
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}
