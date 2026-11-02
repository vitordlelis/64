// Cena 3D do escritório: sala escura com neon laranja, núcleo holográfico, robôs nas mesas e telões com dados reais.
// Tudo é geometria simples + texturas desenhadas em canvas 2D (sem modelos nem fontes externas).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, MeshReflectorMaterial, OrbitControls } from '@react-three/drei';
import { CanvasTexture, DoubleSide, Shape, SRGBColorSpace, type Group, type Mesh } from 'three';
import { brl, type Linha } from '../api';
import { ESTADO, FUNCAO } from './Agentes';

const LARANJA = '#ff7a1a';
const AZUL = '#38bdf8';
const COR: Linha = { diretor: '#a78bfa', marketing: '#f472b6', designer: '#fbbf24', engenheiro: '#60a5fa', soc: '#34d399', pentester: '#94a3b8' };
const COR_ESTADO: Linha = { trabalhando: AZUL, aguardando: '#fbbf24', ocioso: '#64748b', pausado: '#475569' };
// 6 mesas: 4 ao fundo (dos lados do núcleo) e 2 à frente; os robôs olham para o fundo, como na referência.
const POSICOES: [number, number][] = [[-6.4, -0.2], [-3.2, -0.2], [3.2, -0.2], [6.4, -0.2], [-2.6, 3.6], [2.6, 3.6]];

// ---------- texturas em canvas ----------
function useTextura(w: number, h: number, desenhar: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const t = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    desenhar(c.getContext('2d')!);
    const tx = new CanvasTexture(c);
    tx.colorSpace = SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

const FONTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';
function moldura(g: CanvasRenderingContext2D, w: number, h: number, titulo: string) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b1426'); grad.addColorStop(1, '#060a14');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(56,189,248,.55)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#e2e8f0'; g.font = `700 44px ${FONTE}`; g.textBaseline = 'top'; g.fillText(titulo, 36, 30);
}

function grafico(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, valores: number[]) {
  g.strokeStyle = 'rgba(148,163,184,.15)'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x, y + (h * i) / 4); g.lineTo(x + w, y + (h * i) / 4); g.stroke(); }
  if (valores.length < 2) return;
  const max = Math.max(...valores, 1);
  const pts = valores.map((v, i) => [x + (w * i) / (valores.length - 1), y + h - (v / max) * h * 0.9] as const);
  const area = g.createLinearGradient(0, y, 0, y + h);
  area.addColorStop(0, 'rgba(56,189,248,.45)'); area.addColorStop(1, 'rgba(56,189,248,0)');
  g.beginPath(); g.moveTo(pts[0]![0], y + h); pts.forEach(([px, py]) => g.lineTo(px, py)); g.lineTo(pts.at(-1)![0], y + h); g.fillStyle = area; g.fill();
  g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.strokeStyle = AZUL; g.lineWidth = 5; g.shadowColor = AZUL; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
}

// ---------- marca VL Systems (polígonos do SVG oficial) ----------
const VL_A = [[205, 255], [335, 255], [440, 465], [545, 255], [675, 255], [487, 625], [393, 625]];
const VL_B = [[548, 465], [680, 255], [810, 255], [678, 465], [810, 465], [745, 585], [485, 585]];
const forma = (p: number[][]) => {
  const s = new Shape();
  p.forEach(([x, y], i) => { const px = (x! - 507) / 330, py = -(y! - 440) / 330; if (i) s.lineTo(px, py); else s.moveTo(px, py); });
  return s;
};

function Marca() {
  const [a, b] = useMemo(() => [forma(VL_A), forma(VL_B)], []);
  const texto = useTextura(1400, 520, (g) => {
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f8fafc'; g.font = `800 150px ${FONTE}`; g.fillText('VL', 0, 170);
    g.fillStyle = '#cbd5e1'; g.font = `400 78px ${FONTE}`; g.letterSpacing = '22px'; g.fillText('SYSTEMS', 0, 280); g.letterSpacing = '0px';
    g.fillStyle = LARANJA; g.fillRect(720, 30, 6, 300);
    g.fillStyle = '#f8fafc'; g.font = `700 112px ${FONTE}`; g.fillText('AI', 790, 140); g.fillText('Agents', 790, 260);
    g.fillStyle = '#94a3b8'; g.font = `500 44px ${FONTE}`; g.fillText('Automação. Inteligência.', 790, 340); g.fillText('Resultados.', 790, 395);
  }, []);
  const extrude = { depth: 0.08, bevelEnabled: false };
  return (
    <group position={[-7.4, 3.2, -6.85]}>
      <mesh position={[0.6, 0, -0.05]}><boxGeometry args={[6.6, 3.2, 0.06]} /><meshStandardMaterial color="#0d0f16" roughness={0.6} /></mesh>
      <group position={[-1.6, 0.35, 0]} scale={0.95}>
        <mesh><extrudeGeometry args={[a, extrude]} /><meshStandardMaterial color="#2563eb" emissive="#2563eb" emissiveIntensity={1.6} toneMapped={false} /></mesh>
        <mesh><extrudeGeometry args={[b, extrude]} /><meshStandardMaterial color={AZUL} emissive={AZUL} emissiveIntensity={1.6} toneMapped={false} /></mesh>
      </group>
      <mesh position={[1.25, 0.1, 0.02]}><planeGeometry args={[3.9, 1.45]} /><meshBasicMaterial map={texto} transparent toneMapped={false} /></mesh>
      {/* jardineira iluminada embaixo da marca */}
      <mesh position={[0.6, -2.55, 0.5]}><boxGeometry args={[5.6, 0.5, 0.9]} /><meshStandardMaterial color="#121219" /></mesh>
      <mesh position={[0.6, -2.29, 0.96]}><boxGeometry args={[5.6, 0.03, 0.03]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      {[-1.8, -0.6, 0.6, 1.8, 3].map((x) => <Folhagem key={x} position={[x, -2.25, 0.5]} escala={0.55} />)}
      <pointLight position={[0.6, -1.6, 1.2]} color="#ffb070" intensity={6} distance={5} />
    </group>
  );
}

// ---------- janelas com a cidade à noite ----------
function Janela() {
  const cidade = useTextura(1024, 512, (g) => {
    const ceu = g.createLinearGradient(0, 0, 0, 512);
    ceu.addColorStop(0, '#050816'); ceu.addColorStop(0.6, '#13183a'); ceu.addColorStop(1, '#3b1d2e');
    g.fillStyle = ceu; g.fillRect(0, 0, 1024, 512);
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); // sempre a mesma cidade
    for (let camada = 0; camada < 2; camada++) {
      for (let x = 0; x < 1024;) {
        const w = 30 + rnd() * 60, h = (camada ? 140 : 220) + rnd() * (camada ? 160 : 230);
        g.fillStyle = camada ? '#0a0d1c' : '#070912';
        g.fillRect(x, 512 - h, w, h);
        for (let wy = 512 - h + 10; wy < 500; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 10) {
          if (rnd() < (camada ? 0.35 : 0.22)) { g.fillStyle = rnd() < 0.8 ? 'rgba(255,196,120,.85)' : 'rgba(125,211,252,.8)'; g.fillRect(wx, wy, 4, 6); }
        }
        x += w + 4;
      }
    }
  }, []);
  return (
    <group position={[-0.7, 3.1, -6.9]}>
      <mesh><planeGeometry args={[5.4, 3.6]} /><meshBasicMaterial map={cidade} toneMapped={false} /></mesh>
      {[-2.7, -0.9, 0.9, 2.7].map((x) => <mesh key={x} position={[x, 0, 0.05]}><boxGeometry args={[0.08, 3.6, 0.08]} /><meshStandardMaterial color="#05060a" /></mesh>)}
      <mesh position={[0, 1.8, 0.05]}><boxGeometry args={[5.5, 0.1, 0.1]} /><meshStandardMaterial color="#05060a" /></mesh>
    </group>
  );
}

// ---------- telões com dados reais ----------
function Teloes({ fin, saude, lista }: { fin?: Linha; saude?: Linha; lista: Linha[] }) {
  const mes = new Date().getMonth();
  const serie = (fin?.mensal ?? []).slice(0, mes + 1).map((m: Linha) => (m.projeto + m.recorrente) / 100);
  const metricas = useTextura(1100, 640, (g) => {
    moldura(g, 1100, 640, 'Métricas em Tempo Real');
    const kpi = (x: number, rot: string, val: string, cor = '#f8fafc') => {
      g.fillStyle = '#94a3b8'; g.font = `500 28px ${FONTE}`; g.fillText(rot, x, 110);
      g.fillStyle = cor; g.font = `800 50px ${FONTE}`; g.fillText(val, x, 148);
    };
    kpi(36, 'Receita do mês', fin ? brl(fin.receita_mes) : '—', '#4ade80');
    kpi(400, 'MRR', fin ? brl(fin.mrr) : '—');
    kpi(760, 'Clientes ativos', fin ? String(fin.clientes_ativos) : '—');
    grafico(g, 40, 260, 1020, 330, serie);
  }, [fin?.receita_mes, fin?.mrr, fin?.clientes_ativos, serie.join()]);

  const ativos = lista.filter((a) => a.ativo).length;
  const agentes = useTextura(640, 640, (g) => {
    moldura(g, 640, 640, 'Agentes Ativos');
    g.fillStyle = '#4ade80'; g.beginPath(); g.arc(48, 122, 10, 0, 7); g.fill();
    g.font = `600 32px ${FONTE}`; g.fillText(`Online ${ativos}/${lista.length}`, 70, 104);
    lista.forEach((a, i) => {
      const y = 180 + i * 72;
      g.fillStyle = COR[a.funcao] ?? '#94a3b8'; g.beginPath(); g.arc(56, y + 18, 18, 0, 7); g.fill();
      g.fillStyle = '#e2e8f0'; g.font = `600 32px ${FONTE}`; g.fillText(a.nome, 92, y);
      g.fillStyle = '#64748b'; g.font = `400 22px ${FONTE}`; g.fillText(FUNCAO[a.funcao] ?? a.funcao, 92, y + 38);
      const e = a.ativo ? a.estado : 'pausado';
      g.fillStyle = COR_ESTADO[e] ?? '#64748b'; g.font = `600 24px ${FONTE}`; g.textAlign = 'right';
      g.fillText(e === 'pausado' ? 'Pausado' : (ESTADO[e] ?? e), 610, y + 8); g.textAlign = 'left';
    });
  }, [lista.map((a) => `${a.nome}${a.ativo}${a.estado}`).join()]);

  const sistemas: Linha[] = saude?.sistemas ?? [];
  const ups = sistemas.map((s) => s.uptime_24h).filter((v) => v != null) as number[];
  const uptime = ups.length ? ups.reduce((x, y) => x + y, 0) / ups.length : null;
  const pendentes = lista.reduce((x, a) => x + (a.aguardando ?? 0), 0);
  const custo = lista.reduce((x, a) => x + Number(a.custo_hoje_usd ?? 0), 0);
  const perf = useTextura(560, 640, (g) => {
    moldura(g, 560, 640, 'Performance Geral');
    g.lineWidth = 22; g.strokeStyle = 'rgba(56,189,248,.15)'; g.beginPath(); g.arc(150, 230, 90, 0, 7); g.stroke();
    if (uptime != null) {
      g.strokeStyle = AZUL; g.shadowColor = AZUL; g.shadowBlur = 16; g.beginPath(); g.arc(150, 230, 90, -Math.PI / 2, -Math.PI / 2 + (uptime / 100) * Math.PI * 2); g.stroke(); g.shadowBlur = 0;
    }
    g.fillStyle = '#f8fafc'; g.font = `800 44px ${FONTE}`; g.textAlign = 'center'; g.fillText(uptime != null ? `${Math.round(uptime)}%` : '—', 150, 208); g.textAlign = 'left';
    g.fillStyle = '#94a3b8'; g.font = `500 24px ${FONTE}`; g.fillText('uptime 24h', 290, 200); g.fillText(`${sistemas.length} sistema(s)`, 290, 234);
    const linha = (y: number, rot: string, val: string, cor: string) => {
      g.fillStyle = '#94a3b8'; g.font = `500 26px ${FONTE}`; g.fillText(rot, 36, y);
      g.fillStyle = cor; g.font = `800 44px ${FONTE}`; g.fillText(val, 36, y + 34);
    };
    linha(370, 'Aguardando sua aprovação', String(pendentes), pendentes ? '#fbbf24' : '#4ade80');
    linha(490, 'Custo da IA hoje', `US$ ${custo.toFixed(2)}`, '#f8fafc');
  }, [uptime, sistemas.length, pendentes, custo.toFixed(2)]);

  const Painel = ({ x, w, map }: { x: number; w: number; map: CanvasTexture }) => (
    <group position={[x, 3.5, -6.8]}>
      <mesh position={[0, 0, -0.04]}><boxGeometry args={[w + 0.12, 2.48, 0.06]} /><meshStandardMaterial color="#05070d" /></mesh>
      <mesh><planeGeometry args={[w, 2.36]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>
    </group>
  );
  return (
    <>
      <Painel x={3.95} w={3.7} map={metricas} />
      <Painel x={7.0} w={2.15} map={agentes} />
      <Painel x={9.15} w={1.9} map={perf} />
      <pointLight position={[7.5, 3.4, -5.6]} color={AZUL} intensity={5} distance={6} />
    </>
  );
}

// ---------- núcleo holográfico ----------
function Nucleo({ ativo }: { ativo: boolean }) {
  const cerebro = useRef<Group>(null);
  const aneis = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    if (cerebro.current) {
      cerebro.current.rotation.y += dt * (ativo ? 0.9 : 0.25);
      cerebro.current.scale.setScalar(1 + Math.sin(t * (ativo ? 4 : 1.5)) * (ativo ? 0.05 : 0.02));
    }
    if (aneis.current) aneis.current.rotation.z += dt * 0.15;
  });
  return (
    <group position={[0, 0, -3.4]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><cylinderGeometry args={[1.5, 1.6, 0.5, 48]} /><meshStandardMaterial color="#111219" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.5, 0.025, 8, 96]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      <mesh position={[0, 2.1, 0]}><cylinderGeometry args={[0.95, 0.95, 3.2, 48, 1, true]} />
        <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.4} transparent opacity={0.16} side={DoubleSide} depthWrite={false} /></mesh>
      {[0.6, 3.68].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.95, 0.03, 8, 64]} /><meshBasicMaterial color={AZUL} toneMapped={false} /></mesh>)}
      <group ref={cerebro} position={[0, 2.15, 0]}>
        <mesh scale={[1, 0.8, 1.15]}><icosahedronGeometry args={[0.62, 3]} /><meshBasicMaterial color={AZUL} wireframe transparent opacity={0.75} toneMapped={false} /></mesh>
        <mesh scale={[0.9, 0.72, 1.05]}><icosahedronGeometry args={[0.6, 2]} /><meshBasicMaterial color="#1d4ed8" transparent opacity={0.35} toneMapped={false} /></mesh>
        <mesh><boxGeometry args={[0.02, 0.9, 1.3]} /><meshBasicMaterial color="#020617" transparent opacity={0.6} /></mesh>
      </group>
      <pointLight position={[0, 2.2, 0]} color={AZUL} intensity={ativo ? 14 : 8} distance={8} />
      {/* anéis de luz laranja no teto */}
      <group ref={aneis} position={[0, 6.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><torusGeometry args={[2.6, 0.05, 8, 128]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
        <mesh><torusGeometry args={[1.7, 0.04, 8, 128]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
        <mesh><torusGeometry args={[3.4, 0.03, 8, 128]} /><meshBasicMaterial color="#f5f5f5" toneMapped={false} /></mesh>
      </group>
      <pointLight position={[0, 5.4, 0]} color={LARANJA} intensity={12} distance={10} />
    </group>
  );
}

// ---------- plantas, sofá ----------
function Folhagem({ position, escala = 1 }: { position: [number, number, number]; escala?: number }) {
  const folhas = useMemo(() => Array.from({ length: 7 }, (_, i) => [Math.cos(i * 0.9) * 0.18, 0.35 + (i % 3) * 0.15, Math.sin(i * 0.9) * 0.18, i] as const), []);
  return (
    <group position={position} scale={escala}>
      {folhas.map(([x, y, z, i]) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.sin(i) * 0.6, i, Math.cos(i) * 0.6]}><coneGeometry args={[0.16, 0.8, 5]} />
          <meshStandardMaterial color={i % 2 ? '#2f7d32' : '#3f9b43'} roughness={0.8} /></mesh>
      ))}
    </group>
  );
}
function Vaso({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.32, 0.26, 0.7, 20]} /><meshStandardMaterial color="#16161d" metalness={0.4} roughness={0.4} /></mesh>
      <Folhagem position={[0, 0.6, 0]} escala={1.1} />
    </group>
  );
}

function Lounge() {
  return (
    <group position={[8.2, 0, 5.6]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.001, 1.4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.6, 3]} /><meshStandardMaterial color="#1a1412" roughness={1} /></mesh>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[3.4, 0.45, 1]} /><meshStandardMaterial color="#1c1d24" roughness={0.9} /></mesh>
      <mesh position={[0, 0.75, -0.42]} castShadow><boxGeometry args={[3.4, 0.6, 0.22]} /><meshStandardMaterial color="#1c1d24" roughness={0.9} /></mesh>
      {[-1.6, 1.6].map((x) => <mesh key={x} position={[x, 0.5, 0]}><boxGeometry args={[0.22, 0.55, 1]} /><meshStandardMaterial color="#17181e" /></mesh>)}
      <mesh position={[0, 0.25, 1.6]} castShadow><boxGeometry args={[1.8, 0.08, 0.9]} /><meshStandardMaterial color="#08080b" metalness={0.8} roughness={0.15} /></mesh>
      <mesh position={[0, 0.12, 1.6]}><boxGeometry args={[1.6, 0.22, 0.7]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0, 0.25, 2.06]}><boxGeometry args={[1.8, 0.02, 0.02]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      <Vaso position={[2.2, 0, -0.3]} />
    </group>
  );
}

// ---------- mesa + robô de cada agente ----------
function telaEstado(estado: string) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = '#050a16'; g.fillRect(0, 0, 512, 300);
  if (estado === 'trabalhando') {
    g.fillStyle = '#0b1b33'; g.fillRect(0, 0, 130, 300);
    for (let i = 0; i < 6; i++) { g.fillStyle = i === 1 ? AZUL : 'rgba(148,163,184,.5)'; g.fillRect(18, 30 + i * 40, 90, 12); }
    grafico(g, 150, 40, 340, 120, [3, 5, 4, 7, 6, 9, 8, 11]);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(56,189,248,.8)'; g.fillRect(160 + i * 55, 280 - (30 + ((i * 37) % 80)), 34, 30 + ((i * 37) % 80)); }
  } else if (estado === 'aguardando') {
    g.fillStyle = '#fbbf24'; g.font = `800 40px ${FONTE}`; g.textAlign = 'center';
    g.fillText('Aguardando', 256, 130); g.fillText('aprovação', 256, 185);
  } else {
    g.fillStyle = 'rgba(56,189,248,.25)'; g.font = `800 64px ${FONTE}`; g.textAlign = 'center'; g.fillText('VL', 256, 170);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Robo({ cor, estado }: { cor: string; estado: string }) {
  const corpo = useRef<Group>(null);
  const bracoE = useRef<Group>(null);
  const bracoD = useRef<Group>(null);
  const fase = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + fase;
    const digitando = estado === 'trabalhando';
    if (bracoE.current) bracoE.current.rotation.x = 1.05 + (digitando ? Math.sin(t * 14) * 0.06 : 0);
    if (bracoD.current) bracoD.current.rotation.x = 1.05 + (digitando ? Math.cos(t * 13) * 0.06 : 0);
    if (corpo.current) corpo.current.rotation.x = estado === 'ocioso' ? 0.12 + Math.sin(t) * 0.01 : estado === 'pausado' ? 0.18 : -0.06;
  });
  const branco = estado === 'pausado' ? '#6b7280' : '#e8ebf0';
  const luz = estado === 'pausado' ? '#334155' : cor;
  const mat = <meshStandardMaterial color={branco} metalness={0.05} roughness={0.32} />;
  const escuro = <meshStandardMaterial color="#1b1e27" metalness={0.5} roughness={0.4} />;
  const Braco = ({ lado, r }: { lado: number; r: React.RefObject<Group | null> }) => (
    <group ref={r} position={[0.36 * lado, 1.48, 0]}>
      <mesh position={[0, -0.22, 0]}><capsuleGeometry args={[0.075, 0.3, 4, 10]} />{mat}</mesh>
      <mesh position={[0, -0.46, 0]}><sphereGeometry args={[0.08, 12, 12]} />{escuro}</mesh>
      <mesh position={[0, -0.66, -0.04]}><capsuleGeometry args={[0.065, 0.28, 4, 10]} />{mat}</mesh>
    </group>
  );
  return (
    <group ref={corpo} position={[0, 0, 0.35]}>
      {/* tronco */}
      <mesh position={[0, 1.2, 0]} castShadow><capsuleGeometry args={[0.27, 0.42, 6, 16]} />{mat}</mesh>
      <mesh position={[0, 1.02, 0]}><cylinderGeometry args={[0.2, 0.24, 0.16, 16]} />{escuro}</mesh>
      <mesh position={[0, 1.28, 0.25]}><boxGeometry args={[0.28, 0.32, 0.06]} />{escuro}</mesh>
      {[-1, 1].map((l) => <mesh key={l} position={[0.33 * l, 1.48, 0]} castShadow><sphereGeometry args={[0.12, 16, 16]} />{mat}</mesh>)}
      <Braco lado={-1} r={bracoE} />
      <Braco lado={1} r={bracoD} />
      {/* pernas sentadas */}
      {[-1, 1].map((l) => (
        <group key={l}>
          <mesh position={[0.13 * l, 0.62, -0.22]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.09, 0.36, 4, 10]} />{mat}</mesh>
          <mesh position={[0.13 * l, 0.32, -0.45]}><capsuleGeometry args={[0.08, 0.38, 4, 10]} />{mat}</mesh>
        </group>
      ))}
      {/* cabeça com viseira e luzes na cor do agente */}
      <mesh position={[0, 1.72, 0]}><cylinderGeometry args={[0.07, 0.08, 0.12, 12]} />{escuro}</mesh>
      <group position={[0, 1.97, 0]}>
        <mesh castShadow><sphereGeometry args={[0.24, 24, 24]} />{mat}</mesh>
        <mesh position={[0, 0.01, -0.11]} scale={[1, 0.55, 0.7]}><sphereGeometry args={[0.21, 24, 24]} /><meshStandardMaterial color="#05070c" metalness={0.9} roughness={0.1} /></mesh>
        {[-1, 1].map((l) => (
          <group key={l} position={[0.23 * l, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh><cylinderGeometry args={[0.1, 0.1, 0.06, 20]} />{escuro}</mesh>
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.075, 0.018, 8, 24]} /><meshBasicMaterial color={luz} toneMapped={false} /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.22, 0.02]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.24, 0.025, 8, 24, Math.PI]} />{escuro}</mesh>
      </group>
    </group>
  );
}

function Mesa({ a, x, z, selecionado, onClick, telas }: { a: Linha; x: number; z: number; selecionado: boolean; onClick: () => void; telas: Record<string, CanvasTexture> }) {
  const alerta = useRef<Mesh>(null);
  const estado = a.ativo ? a.estado : 'pausado';
  useFrame(({ clock }) => { if (alerta.current) { alerta.current.position.y = 2.75 + Math.sin(clock.getElapsedTime() * 3) * 0.08; alerta.current.rotation.y += 0.03; } });
  const tela = telas[estado] ?? telas.ocioso!;
  const corTela = estado === 'trabalhando' ? 1 : estado === 'aguardando' ? 0.9 : 0.35;
  return (
    <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      {/* mesa escura com filete laranja */}
      <mesh position={[0, 0.78, -0.75]} castShadow receiveShadow><boxGeometry args={[2.5, 0.07, 1.1]} /><meshStandardMaterial color="#14151b" metalness={0.5} roughness={0.25} /></mesh>
      <mesh position={[0, 0.76, -0.19]}><boxGeometry args={[2.5, 0.025, 0.02]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      {[-1, 1].map((l) => (
        <group key={l} position={[1.15 * l, 0.38, -0.75]}>
          <mesh castShadow><boxGeometry args={[0.16, 0.76, 1.05]} /><meshStandardMaterial color="#101117" /></mesh>
          <mesh position={[0.085 * l, 0, 0.5]}><boxGeometry args={[0.012, 0.7, 0.02]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
        </group>
      ))}
      {/* dois monitores e periféricos */}
      {[-0.52, 0.52].map((mx, i) => (
        <group key={mx} position={[mx, 1.27, -1.08]} rotation={[0, -mx * 0.35, 0]}>
          <mesh><boxGeometry args={[0.98, 0.6, 0.04]} /><meshStandardMaterial color="#0a0b10" /></mesh>
          <mesh position={[0, 0, 0.022]}><planeGeometry args={[0.92, 0.54]} /><meshBasicMaterial map={tela} toneMapped={false} color={i ? '#ffffff' : '#dfe9ff'} opacity={corTela} transparent /></mesh>
          <mesh position={[0, -0.4, -0.02]}><boxGeometry args={[0.06, 0.24, 0.06]} /><meshStandardMaterial color="#1f2129" /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.83, -0.58]}><boxGeometry args={[0.7, 0.025, 0.22]} /><meshStandardMaterial color="#1a1c24" /></mesh>
      <mesh position={[0.62, 0.86, -0.55]}><cylinderGeometry args={[0.055, 0.05, 0.13, 16]} /><meshStandardMaterial color="#0d0e12" /></mesh>
      {/* cadeira gamer */}
      <group position={[0, 0, 0.45]}>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.7, 0.1, 0.65]} /><meshStandardMaterial color="#17181f" /></mesh>
        <mesh position={[0, 0.98, 0.33]} rotation={[0.08, 0, 0]} castShadow><boxGeometry args={[0.62, 0.86, 0.1]} /><meshStandardMaterial color="#17181f" /></mesh>
        <mesh position={[0, 0.98, 0.39]} rotation={[0.08, 0, 0]}><boxGeometry args={[0.04, 0.74, 0.02]} /><meshBasicMaterial color={estado === 'pausado' ? '#334155' : COR[a.funcao]} toneMapped={false} /></mesh>
        <mesh position={[0, 0.26, 0]}><cylinderGeometry args={[0.04, 0.04, 0.42, 10]} /><meshStandardMaterial color="#2a2c35" metalness={0.8} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i * 1.257) * 0.22, 0.05, Math.sin(i * 1.257) * 0.22]} rotation={[0, -i * 1.257, 0]}><boxGeometry args={[0.44, 0.04, 0.05]} /><meshStandardMaterial color="#2a2c35" /></mesh>)}
      </group>
      <group position={[0, 0, 0.1]}><Robo cor={COR[a.funcao] ?? AZUL} estado={estado} /></group>
      {estado === 'aguardando' && (
        <mesh ref={alerta} position={[0, 2.75, 0.4]}><octahedronGeometry args={[0.15]} /><meshBasicMaterial color="#fbbf24" toneMapped={false} /></mesh>
      )}
      {selecionado && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -0.1]}><ringGeometry args={[1.45, 1.55, 64]} /><meshBasicMaterial color={AZUL} toneMapped={false} /></mesh>}
      <Html position={[0, 3.05, 0.4]} center distanceFactor={11} zIndexRange={[10, 0]}>
        <div className={`placa ${estado}`}><strong>{a.nome}</strong><span>{estado === 'pausado' ? 'Pausado' : ESTADO[estado]}</span></div>
      </Html>
    </group>
  );
}

export function Cena({ lista, sel, setSel, fin, saude }: { lista: Linha[]; sel: string | null; setSel: (id: string) => void; fin?: Linha; saude?: Linha }) {
  const telas = useMemo(() => ({ trabalhando: telaEstado('trabalhando'), aguardando: telaEstado('aguardando'), ocioso: telaEstado('ocioso'), pausado: telaEstado('pausado') }), []);
  useEffect(() => () => Object.values(telas).forEach((t) => t.dispose()), [telas]);
  const algumTrabalhando = lista.some((a) => a.ativo && a.estado === 'trabalhando');
  const leve = typeof window !== 'undefined' && window.innerWidth < 900; // celular: reflexo do piso mais barato
  return (
    <>
      <color attach="background" args={['#050508']} />
      <fog attach="fog" args={['#050508', 18, 34]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#c7d2fe', '#1a1208', 0.7]} />
      <directionalLight position={[2, 10, 12]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-8} />
      <pointLight position={[-6, 4.5, 2]} color={LARANJA} intensity={6} distance={10} />
      <pointLight position={[6, 4.5, 2]} color={LARANJA} intensity={6} distance={10} />

      {/* piso brilhante */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]} receiveShadow>
        <planeGeometry args={[24, 17]} />
        <MeshReflectorMaterial resolution={leve ? 256 : 768} blur={[300, 80]} mixBlur={1} mixStrength={leve ? 4 : 9} roughness={0.75}
          depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.3} color="#15151c" metalness={0.5} mirror={0} />
      </mesh>
      {/* paredes e filetes de neon */}
      <mesh position={[0, 4.5, -7]} receiveShadow><boxGeometry args={[24, 9, 0.2]} /><meshStandardMaterial color="#0b0c11" roughness={0.8} /></mesh>
      <mesh position={[-12, 4.5, 1]}><boxGeometry args={[0.2, 9, 17]} /><meshStandardMaterial color="#0a0b10" roughness={0.8} /></mesh>
      <mesh position={[0, 5.9, -6.85]}><boxGeometry args={[24, 0.05, 0.05]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      <mesh position={[-11.85, 5.9, 1]}><boxGeometry args={[0.05, 0.05, 17]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>
      {/* teto escuro com faixas de luz, como a referência */}
      <mesh position={[0, 6.4, 1]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[24, 17]} /><meshStandardMaterial color="#0a0a0e" side={DoubleSide} /></mesh>
      {[-8, -4.6, 4.6, 8].map((x) => <mesh key={x} position={[x, 6.36, 1]}><boxGeometry args={[0.06, 0.03, 17]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>)}
      {[-4.5, 4.5].map((z) => <mesh key={z} position={[0, 6.36, z]}><boxGeometry args={[24, 0.03, 0.06]} /><meshBasicMaterial color="#e5e7eb" toneMapped={false} transparent opacity={0.6} /></mesh>)}
      <mesh position={[0, 0.06, -6.85]}><boxGeometry args={[24, 0.03, 0.03]} /><meshBasicMaterial color={LARANJA} toneMapped={false} /></mesh>

      <Marca />
      <Janela />
      <Teloes fin={fin} saude={saude} lista={lista} />
      <Nucleo ativo={algumTrabalhando} />
      <Lounge />
      {([[-11, -6], [-1.9, -5.8], [2.3, -5.8], [11, -1.5], [-11, 7]] as [number, number][]).map(([x, z]) => <Vaso key={`${x}${z}`} position={[x, 0, z]} />)}

      {lista.map((a, i) => POSICOES[i] && <Mesa key={a.id} a={a} x={POSICOES[i]![0]} z={POSICOES[i]![1]} selecionado={a.id === sel} onClick={() => setSel(a.id)} telas={telas} />)}
      <OrbitControls target={[0, 2.3, -2]} maxPolarAngle={Math.PI / 2.15} minDistance={5} maxDistance={22} enablePan={false} />
    </>
  );
}
