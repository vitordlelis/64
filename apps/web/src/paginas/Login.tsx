import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Login() {
  const nav = useNavigate();
  const [erro, setErro] = useState('');
  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    try { await api('/auth/login', 'POST', fd); nav('/'); } catch (x) { setErro((x as Error).message); }
  }
  return (
    <main className="login">
      <form className="card form" onSubmit={entrar}>
        <h1>VL Command</h1>
        <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
        <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
        <label>Código do autenticador<input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required /></label>
        {erro && <p role="alert" className="erro">{erro}</p>}
        <button>Entrar</button>
      </form>
    </main>
  );
}
