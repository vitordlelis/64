import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh } from 'three';
import { api, brl, useAcao, useDados, type Linha } from '../api';
import { ESTADO, FUNCAO, useComando } from './Agentes';

const COR: Linha = { diretor: '#7c3aed', marketing: '#db2777', designer: '#f59e0b', engenheiro: '#2563eb', soc: '#16a34a', pentester: '#475569' };
const MONITOR: Linha = { trabalhando: '#38bdf8', aguardando: '#fbbf24', ocioso: '#1e293b' };
// 2 fileiras de 3 mesas
const POSICOES: [number, number][] = [[-4, -1], [0, -1], [4, -1], [-4, 3], [0, 3], [4, 3]];

function Mesa({ a, x, z, selecionado, onClick }: { a: Linha; x: number; z: number; selecionado: boolean; onClick: () => void }) {
  const corpo = useRef<Group>(null);
  const alerta = useRef<Mesh>(null);
  const estado = a.ativo ? a.estado : 'pausado';
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + x;
    if (corpo.current) {
      corpo.current.position.y = estado === 'trabalhando' ? Math.abs(Math.sin(t * 8)) * 0.04 : estado === 'ocioso' ? Math.sin(t) * 0.01 : 0;
      corpo.current.rotation.x = estado === 'ocioso' ? -0.15 : estado === 'trabalhando' ? 0.08 : 0; // ocioso: encostado na cadeira
    }
    if (alerta.current) alerta.current.position.y = 2.35 + Math.sin(t * 3) * 0.1;
  });
  const cor = estado === 'pausado' ? '#9ca3af' : COR[a.funcao];
  return (
    <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      {/* mesa */}
      <mesh position={[0, 0.75, -0.6]} castShadow receiveShadow><boxGeometry args={[2.2, 0.08, 1]} /><meshStandardMaterial color="#a16207" /></mesh>
      {[[-1, -1], [1, -1], [-1, -0.2], [1, -0.2]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx!, 0.37, lz!]}><boxGeometry args={[0.06, 0.74, 0.06]} /><meshStandardMaterial color="#713f12" /></mesh>
      ))}
      {/* monitor: brilha conforme o estado */}
      <mesh position={[0, 1.15, -0.9]}><boxGeometry args={[0.9, 0.55, 0.05]} />
        <meshStandardMaterial color={MONITOR[estado] ?? '#1e293b'} emissive={MONITOR[estado] ?? '#000'} emissiveIntensity={estado === 'ocioso' || estado === 'pausado' ? 0 : 0.8} /></mesh>
      <mesh position={[0, 0.85, -0.9]}><boxGeometry args={[0.1, 0.2, 0.1]} /><meshStandardMaterial color="#334155" /></mesh>
      {/* cadeira */}
      <mesh position={[0, 0.45, 0.35]}><boxGeometry args={[0.7, 0.08, 0.7]} /><meshStandardMaterial color="#1f2937" /></mesh>
      <mesh position={[0, 0.85, 0.68]}><boxGeometry args={[0.7, 0.8, 0.08]} /><meshStandardMaterial color="#1f2937" /></mesh>
      {/* personagem */}
      <group ref={corpo}>
        <mesh position={[0, 1.05, 0.3]} castShadow><capsuleGeometry args={[0.28, 0.5, 6, 12]} /><meshStandardMaterial color={cor} /></mesh>
        <mesh position={[0, 1.68, 0.25]} castShadow><sphereGeometry args={[0.24, 20, 20]} /><meshStandardMaterial color="#fcd9b6" /></mesh>
      </group>
      {estado === 'aguardando' && (
        <mesh ref={alerta} position={[0, 2.35, 0.25]}><octahedronGeometry args={[0.16]} /><meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} /></mesh>
      )}
      {selecionado && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[1.25, 1.4, 48]} /><meshBasicMaterial color="#4f46e5" /></mesh>}
      <Html position={[0, 2.75, 0.25]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div className={`placa ${estado}`}><strong>{a.nome}</strong><span>{estado === 'pausado' ? 'Pausado' : ESTADO[estado]}</span></div>
      </Html>
    </group>
  );
}

// Texto do telão desenhado num canvas 2D e usado como textura (funciona em qualquer GPU, sem fontes externas).
function Telao({ total, ano }: { total: number; ano: number }) {
  const textura = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 380;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f172a'; g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.fillStyle = '#94a3b8'; g.font = '600 54px system-ui, sans-serif'; g.fillText(`Faturamento ${ano}`, 512, 120);
    g.fillStyle = '#4ade80'; g.font = '800 120px system-ui, sans-serif'; g.fillText(brl(total), 512, 270);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [total, ano]);
  return (
    <group position={[0, 3.2, -4.4]}>
      <mesh><boxGeometry args={[7.2, 2.8, 0.12]} /><meshStandardMaterial color="#020617" /></mesh>
      <mesh position={[0, 0, 0.07]}><planeGeometry args={[7, 2.6]} /><meshBasicMaterial map={textura} toneMapped={false} /></mesh>
    </group>
  );
}

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
  const fin = useDados('/financeiro');
  const [sel, setSel] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [ouvido, setOuvido] = useState('');
  const { enviar, resposta } = useComando();
  const lista: Linha[] = useMemo(() => agentes.data?.agentes ?? [], [agentes.data]);
  const atual = lista.find((a) => a.id === sel);
  const pendentes = useDados<Linha[]>('/tarefas?status=aguardando', { refetchInterval: 5000 });
  const aprovar = useAcao((id: string) => api(`/tarefas/${id}/aprovar`, 'POST', {}));
  const total = fin.data?.mensal.reduce((s: number, m: Linha) => s + m.projeto + m.recorrente, 0) ?? 0;

  async function pedir(frase: string, voz: boolean) {
    const f = semAcento(frase);
    // "confirmo": aprova a proposta pendente do agente selecionado — sempre com um clique de confirmação na tela
    if (/^\s*(confirmo|confirmado|pode executar|aprovado)\b/.test(f)) {
      const props = pendentes.data?.filter((t) => t.agente_id === atual?.id) ?? [];
      if (props.length !== 1) return falar(props.length ? 'Há mais de uma proposta. Aprove pela tela de aprovações.' : 'Não há proposta pendente para confirmar.');
      if (props[0]!.impacto === 'alto') return falar('Essa ação é de alto impacto e precisa do código do autenticador na tela de aprovações.');
      if (confirm(`Aprovar "${props[0]!.titulo}"?`)) aprovar.mutate(props[0]!.id, { onSuccess: () => falar('Aprovado.') });
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
        <Canvas shadows camera={{ position: [0, 9, 12.5], fov: 55 }} onPointerMissed={() => setSel(null)}>
          <color attach="background" args={['#0b0d15']} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[5, 10, 6]} intensity={1.2} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[16, 12]} /><meshStandardMaterial color="#1e2433" /></mesh>
          <mesh position={[0, 2.5, -4.6]}><boxGeometry args={[16, 5, 0.2]} /><meshStandardMaterial color="#151a28" /></mesh>
          <mesh position={[-8, 2.5, 0.4]}><boxGeometry args={[0.2, 5, 10]} /><meshStandardMaterial color="#121725" /></mesh>
          <Telao total={total} ano={new Date().getFullYear()} />
          {lista.map((a, i) => <Mesa key={a.id} a={a} x={POSICOES[i]![0]} z={POSICOES[i]![1]} selecionado={a.id === sel} onClick={() => setSel(a.id)} />)}
          <OrbitControls target={[0, 1, 0.5]} maxPolarAngle={Math.PI / 2.2} minDistance={6} maxDistance={20} />
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
