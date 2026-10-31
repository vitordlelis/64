import { criarApp } from './app.ts';

const app = await criarApp();
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
