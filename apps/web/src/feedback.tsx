// Avisos flutuantes (toasts) e janelas de confirmação/pergunta no estilo do sistema,
// no lugar de alert/confirm/prompt do navegador. Uso: avisar('Salvo'), await confirmar({...}), await perguntar({...}).
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';

type Tipo = 'ok' | 'erro' | 'info' | 'aviso';
type Aviso = { id: number; texto: string; tipo: Tipo };
type Pedido = {
  titulo: string; texto?: string; acao?: string; perigo?: boolean;
  campo?: { rotulo: string; placeholder?: string };   // presente = pergunta com texto
  responder: (v: string | boolean | null) => void;
};

let ouvir: { aviso?: (a: Aviso) => void; pedido?: (p: Pedido) => void } = {};
let seq = 0;

export function avisar(texto: string, tipo: Tipo = 'ok') {
  ouvir.aviso?.({ id: ++seq, texto, tipo });
}

export const confirmar = (o: { titulo: string; texto?: string; acao?: string; perigo?: boolean }) =>
  new Promise<boolean>((r) => (ouvir.pedido ? ouvir.pedido({ ...o, responder: (v) => r(v === true) }) : r(window.confirm(o.titulo))));

export const perguntar = (o: { titulo: string; texto?: string; acao?: string; rotulo: string; placeholder?: string }) =>
  new Promise<string | null>((r) => ouvir.pedido?.({ ...o, campo: { rotulo: o.rotulo, placeholder: o.placeholder }, responder: (v) => r(typeof v === 'string' ? v : null) }));

const ICONE = { ok: CircleCheck, erro: CircleX, info: Info, aviso: TriangleAlert };

export function Feedback() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState('');
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ouvir = {
      aviso: (a) => {
        setAvisos((l) => [...l.slice(-3), a]);
        setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== a.id)), a.tipo === 'erro' ? 7000 : 3500);
      },
      pedido: (p) => { setTexto(''); setPedido(p); },
    };
    return () => { ouvir = {}; };
  }, []);

  useEffect(() => { if (pedido && !dialogo.current?.open) dialogo.current?.showModal(); }, [pedido]);

  const fechar = (v: string | boolean | null) => {
    pedido?.responder(v);
    dialogo.current?.close();
    setPedido(null);
  };

  return (
    <>
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => {
          const I = ICONE[a.tipo];
          return (
            <div key={a.id} className={`aviso ${a.tipo}`}>
              <I size={18} aria-hidden /><span>{a.texto}</span>
              <button className="icone" aria-label="Fechar aviso" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))}><X size={14} /></button>
            </div>
          );
        })}
      </div>
      <dialog ref={dialogo} className="modal" onCancel={(e) => { e.preventDefault(); fechar(null); }}
        onClick={(e) => { if (e.target === dialogo.current) fechar(null); }}>
        {pedido && (
          <form method="dialog" onSubmit={(e) => { e.preventDefault(); fechar(pedido.campo ? texto : true); }}>
            <h2>{pedido.titulo}</h2>
            {pedido.texto && <p>{pedido.texto}</p>}
            {pedido.campo && (
              <label>{pedido.campo.rotulo}
                <textarea autoFocus rows={3} value={texto} placeholder={pedido.campo.placeholder} onChange={(e) => setTexto(e.target.value)} />
              </label>
            )}
            <div className="modal-acoes">
              <button type="button" className="secundario" onClick={() => fechar(null)}>Cancelar</button>
              <button autoFocus={!pedido.campo} className={pedido.perigo ? 'perigoso' : ''}>{pedido.acao ?? 'Confirmar'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
