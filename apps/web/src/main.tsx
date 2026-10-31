import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './ui';
import { Login } from './paginas/Login';
import { Inicio } from './paginas/Inicio';
import { Financeiro } from './paginas/Financeiro';
import { Faturas } from './paginas/Faturas';
import { Clientes, Cliente } from './paginas/Clientes';
import { Sistemas, Sistema } from './paginas/Sistemas';
import { Saude } from './paginas/Saude';
import { Notificacoes, Auditoria, Configuracoes } from './paginas/Admin';
import { Aprovacoes } from './paginas/Aprovacoes';
import { Mensagens } from './paginas/Mensagens';
import { Seguranca } from './paginas/Seguranca';
import { Agentes } from './paginas/Agentes';
import './estilo.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<Inicio />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="faturas" element={<Faturas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<Cliente />} />
            <Route path="sistemas" element={<Sistemas />} />
            <Route path="sistemas/:id" element={<Sistema />} />
            <Route path="saude" element={<Saude />} />
            <Route path="aprovacoes" element={<Aprovacoes />} />
            <Route path="mensagens" element={<Mensagens />} />
            <Route path="seguranca" element={<Seguranca />} />
            <Route path="agentes" element={<Agentes />} />
            <Route path="notificacoes" element={<Notificacoes />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
