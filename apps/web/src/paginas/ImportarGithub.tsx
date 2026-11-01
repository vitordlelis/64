// Importa vários repositórios do GitHub de uma vez como sistemas monitorados.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderGit2, Lock } from 'lucide-react';
import { api, data, useAcao, useDados, type Linha } from '../api';
import { avisar } from '../feedback';
import { Carregando, Secao, Vazio } from '../ui';
import { useRepos } from './Sistemas';

type Escolha = { marcado: boolean; url: string; cliente: string };

export default function ImportarGithub() {
  const nav = useNavigate();
  const g = useDados('/github');
  const repos = useRepos();
  const sistemas = useDados<Linha[]>('/sistemas');
  const clientes = useDados<Linha[]>('/clientes');
  const [esc, setEsc] = useState<Record<string, Escolha>>({});
  const ligados = useMemo(() => new Set((sistemas.data ?? []).map((s) => s.github_repo)), [sistemas.data]);
  const livres = (repos.data ?? []).filter((r) => !ligados.has(r.nome));
  const de = (r: Linha): Escolha => esc[r.nome] ?? { marcado: false, url: r.homepage ?? '', cliente: '' };
  const mudar = (r: Linha, m: Partial<Escolha>) => setEsc((e) => ({ ...e, [r.nome]: { ...de(r), ...m } }));
  const marcados = livres.filter((r) => de(r).marcado);
  const importar = useAcao(() => api<Linha>('/github/importar', 'POST', {
    itens: marcados.map((r) => ({ repo: r.nome, url: de(r).url.trim() || null, cliente_id: de(r).cliente || null })),
  }));

  if (g.data && !g.data.conectado) return (
    <>
      <h1>Importar do GitHub</h1>
      <Secao titulo="GitHub não conectado">
        <Vazio icone={FolderGit2} titulo="Conecte sua conta do GitHub primeiro" texto="Leva 2 minutos: o passo a passo está em Configurações."
          acao={<Link to="/configuracoes#github" className="botao">Ir para Configurações</Link>} />
      </Secao>
    </>
  );

  return (
    <>
      <header className="titulo">
        <h1>Importar do GitHub</h1>
        {!!livres.length && <button className="secundario" onClick={() => {
          const todos = marcados.length < livres.length;
          setEsc(Object.fromEntries(livres.map((r) => [r.nome, { ...de(r), marcado: todos }])));
        }}>{marcados.length < livres.length ? 'Marcar todos' : 'Desmarcar todos'}</button>}
      </header>
      <p className="ajuda">Marque os repositórios dos sistemas que você criou. Cada um vira um sistema monitorado: o código pelo GitHub
        e, se você informar o endereço publicado, também se o site está no ar e a latência.</p>
      <Secao titulo={repos.data ? `${livres.length} repositório(s) disponível(is)${ligados.size ? ` · ${ligados.size} já importado(s)` : ''}` : 'Repositórios'}>
        <Carregando q={repos} linhas={5} />
        {repos.data && !livres.length && <Vazio icone={FolderGit2} titulo="Todos os seus repositórios já foram importados" acao={<Link to="/sistemas" className="botao">Ver sistemas</Link>} />}
        {!!livres.length && (
          <table className="importar-tabela">
            <thead><tr><th aria-label="Importar" /><th>Repositório</th><th>Endereço publicado (para medir se está no ar)</th><th>Cliente</th></tr></thead>
            <tbody>{livres.map((r) => {
              const e = de(r);
              return (
                <tr key={r.nome} className={e.marcado ? 'marcado' : ''}>
                  <td><input type="checkbox" aria-label={`Importar ${r.nome}`} checked={e.marcado} onChange={(x) => mudar(r, { marcado: x.target.checked })} /></td>
                  <td onClick={() => mudar(r, { marcado: !e.marcado })} style={{ cursor: 'pointer' }}>
                    <strong>{r.nome}</strong> {r.privado && <Lock size={12} aria-label="privado" />}
                    <br /><small>{r.descricao ?? 'sem descrição'} · atualizado {data(r.push).slice(0, 10)}</small>
                  </td>
                  <td><input type="url" aria-label={`Endereço de ${r.nome}`} placeholder="https://… (opcional)" value={e.url}
                    onChange={(x) => mudar(r, { url: x.target.value, marcado: true })} /></td>
                  <td><select aria-label={`Cliente de ${r.nome}`} value={e.cliente} onChange={(x) => mudar(r, { cliente: x.target.value, marcado: true })}>
                    <option value="">VL Systems (meus sistemas)</option>
                    {clientes.data?.filter((c) => c.nome !== 'VL Systems (meus sistemas)').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Secao>
      {!!livres.length && (
        <div className="barra-acao">
          <span>{marcados.length ? `${marcados.length} selecionado(s)` : 'Nenhum selecionado'}{marcados.some((r) => !de(r).url.trim()) && <small> · os sem endereço entram só com o código monitorado; você pode informar depois</small>}</span>
          <button disabled={!marcados.length || importar.isPending} onClick={() => importar.mutate(undefined, {
            onSuccess: (r) => { avisar(`${(r as Linha).importados} sistema(s) importado(s)`); nav('/sistemas'); },
          })}>{importar.isPending ? 'Importando…' : `Importar ${marcados.length || ''} sistema(s)`}</button>
        </div>
      )}
      <Secao titulo="Onde acho o endereço publicado?">
        <ul>
          <li><strong>Lovable:</strong> botão <em>Publish</em> → o endereço termina em <code>.lovable.app</code> (ou o seu domínio).</li>
          <li><strong>Vercel:</strong> projeto → <em>Domains</em> (termina em <code>.vercel.app</code> ou o seu domínio).</li>
          <li><strong>Netlify / Bolt:</strong> painel do site → endereço <code>.netlify.app</code> ou o seu domínio.</li>
          <li>Dica: preencha o campo <em>Website</em> do repositório no GitHub e o VL Command encontra sozinho na próxima importação.</li>
        </ul>
      </Secao>
    </>
  );
}
