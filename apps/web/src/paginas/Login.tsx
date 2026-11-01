import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useDados } from '../api';

function PrimeiroAcesso({ segredo }: { segredo: string }) {
  const nav = useNavigate();
  const [erro, setErro] = useState('');
  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (fd.senha !== fd.confirmar) return setErro('As senhas não conferem.');
    try {
      await api('/auth/primeiro-acesso', 'POST', { email: fd.email, senha: fd.senha, codigo: fd.codigo, segredo });
      nav('/');
    } catch (x) { setErro((x as Error).message); }
  }
  return (
    <form className="card form" onSubmit={criar}>
      <h1>Bem-vindo ao VL Command</h1>
      <p>Crie o seu acesso de administrador. Ele é único e protegido por senha + código do celular.</p>
      <label>Seu e-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha (mínimo 12 caracteres)<input name="senha" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label>Repita a senha<input name="confirmar" type="password" autoComplete="new-password" minLength={12} required /></label>
      <div className="previa">
        <strong>Autenticador:</strong> no app (Google Authenticator, Microsoft Authenticator ou Authy), adicione uma conta
        <em> digitando a chave</em> abaixo, com o nome “VL Command”:
        <p><code className="chave">{segredo.match(/.{1,4}/g)!.join(' ')}</code></p>
      </div>
      <label>Código de 6 dígitos que aparece no app<input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required /></label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button>Criar acesso e entrar</button>
    </form>
  );
}

export function Login() {
  const nav = useNavigate();
  const [erro, setErro] = useState('');
  const primeiro = useDados<{ disponivel: boolean; segredo?: string }>('/auth/primeiro-acesso', { staleTime: Infinity });
  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    try { await api('/auth/login', 'POST', fd); nav('/'); } catch (x) { setErro((x as Error).message); }
  }
  if (primeiro.isLoading) return null;
  return (
    <main className="login">
      {primeiro.data?.disponivel ? <PrimeiroAcesso segredo={primeiro.data.segredo!} /> : (
        <form className="card form" onSubmit={entrar}>
          <h1>VL Command</h1>
          <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
          <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
          <label>Código do autenticador<input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required /></label>
          {erro && <p role="alert" className="erro">{erro}</p>}
          <button>Entrar</button>
        </form>
      )}
    </main>
  );
}
