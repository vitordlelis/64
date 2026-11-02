import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { api, useAcao, useDados, type Linha } from '../api';
import { Cena } from './EscritorioCena';
import { ESTADO, FUNCAO, useComando } from './Agentes';
import { confirmar } from '../feedback';

// ---------- voz (Web Speech API) ----------
type Reconhecimento = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: (e: { error: string }) => void; onend: () => void };
const Reconhecedor = (window as unknown as { SpeechRecognition?: new () => Reconhecimento; webkitSpeechRecognition?: new () => Reconhecimento }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Reconhecimento }).webkitSpeechRecognition;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const falar = (texto: string) => {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(texto.slice(0, 600));
  u.lang = 'pt-BR';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
};

export default function Escritorio() {
  const agentes = useDados('/agentes', { refetchInterval: 3000 });
  const fin = useDados('/financeiro', { refetchInterval: 60_000 });
  const saude = useDados('/saude', { refetchInterval: 60_000 });
  const [sel, setSel] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [ouvido, setOuvido] = useState('');
  const { enviar, resposta } = useComando();
  const lista: Linha[] = useMemo(() => agentes.data?.agentes ?? [], [agentes.data]);
  const atual = lista.find((a) => a.id === sel);
  const pendentes = useDados<Linha[]>('/tarefas?status=aguardando', { refetchInterval: 5000 });
  const aprovar = useAcao((id: string) => api(`/tarefas/${id}/aprovar`, 'POST', {}));

  async function pedir(frase: string, voz: boolean) {
    const f = semAcento(frase);
    // "confirmo": aprova a proposta pendente do agente selecionado — sempre com um clique de confirmação na tela
    if (/^\s*(confirmo|confirmado|pode executar|aprovado)\b/.test(f)) {
      const props = pendentes.data?.filter((t) => t.agente_id === atual?.id) ?? [];
      if (props.length !== 1) return falar(props.length ? 'Há mais de uma proposta. Aprove pela tela de aprovações.' : 'Não há proposta pendente para confirmar.');
      if (props[0]!.impacto === 'alto') return falar('Essa ação é de alto impacto e precisa do código do autenticador na tela de aprovações.');
      if (await confirmar({ titulo: `Aprovar "${props[0]!.titulo}"?`, acao: 'Aprovar' })) aprovar.mutate(props[0]!.id, { onSuccess: () => falar('Aprovado.') });
      return;
    }
    const alvo = lista.find((a) => a.funcao !== 'pentester' && f.includes(semAcento(a.nome))) ?? atual ?? lista.find((a) => a.funcao === 'diretor');
    if (!alvo) return;
    setSel(alvo.id);
    const r = await enviar.mutateAsync({ agente: alvo, texto: frase, voz });
    if (voz && r) falar(`${alvo.nome}: ${r}`);
  }

  function ouvir() {
    if (!Reconhecedor) return;
    const rec = new Reconhecedor();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0]![0].transcript; setOuvido(t); void pedir(t, true); };
    rec.onerror = (e) => setOuvido(e.error === 'not-allowed' ? 'Permita o uso do microfone no navegador.' : `Não entendi (${e.error}).`);
    rec.onend = () => setOuvindo(false);
    setOuvindo(true);
    rec.start();
  }

  return (
    <div className="escritorio">
      <div className="cena" aria-hidden>
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 5.6, 14.5], fov: 50 }} onPointerMissed={() => setSel(null)}>
          <Cena lista={lista} sel={sel} setSel={setSel} fin={fin.data} saude={saude.data} />
        </Canvas>
      </div>

      <aside className="painel card">
        <h1>Escritório</h1>
        {agentes.data && !agentes.data.ia_configurada && <p className="aviso-demo">Agentes sem chave da API: os estados mostrados são os registrados, mas eles não respondem pedidos.</p>}
        <div className="voz">
          <button onClick={ouvir} disabled={!Reconhecedor || ouvindo} title={Reconhecedor ? '' : 'Seu navegador não tem reconhecimento de voz (use Chrome ou Edge) — use o campo de texto.'}>
            {ouvindo ? '🎙️ Ouvindo…' : '🎙️ Falar'}
          </button>
          <small>Diga o nome do agente e o pedido. Ex.: “Rafael, por que o site de imóveis caiu?”. Para aprovar: “confirmo”.</small>
        </div>
        {ouvido && <p><small>Você disse:</small> “{ouvido}”</p>}
        <form className="comando" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { void pedir(texto, false); setTexto(''); } }}>
          <input aria-label="Pedido por texto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={atual ? `Pedir para ${atual.nome}…` : 'Ex.: Helena, como foi o dia?'} />
          <button disabled={enviar.isPending}>Enviar</button>
        </form>
        {resposta && <div className="previa" role="status"><strong>{resposta.agente}:</strong> {resposta.texto}</div>}

        {atual ? (
          <section>
            <h2>{atual.nome} <small>· {FUNCAO[atual.funcao]}</small></h2>
            <p><span className={`pill est-${atual.estado}`}>{atual.ativo ? ESTADO[atual.estado] : 'Pausado'}</span></p>
            {atual.tarefa_atual && <p>Agora: {atual.tarefa_atual}</p>}
            {atual.aguardando > 0 && <p><Link to="/aprovacoes">{atual.aguardando} proposta(s) aguardando você →</Link></p>}
            {atual.ultima && <p className="ultima">{atual.ultima.erro ? <span className="erro">{atual.ultima.erro}</span> : atual.ultima.resumo}</p>}
          </section>
        ) : <p className="ajuda">Clique em um agente para ver o que está fazendo. Arraste para girar a câmera; role para aproximar.</p>}

        {/* versão em texto da cena, para leitores de tela */}
        <ul className="lista">{lista.map((a) => (
          <li key={a.id}><button className="link" onClick={() => setSel(a.id)}>{a.nome}</button> <small>{a.ativo ? ESTADO[a.estado] : 'Pausado'}</small></li>
        ))}</ul>
      </aside>
    </div>
  );
}
