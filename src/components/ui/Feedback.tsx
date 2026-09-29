import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

// Avisos (toasts) y confirmaciones propias, en reemplazo de alert()/confirm() del navegador:
// no bloquean la página, distinguen éxito de error, se pueden leer con lector de pantalla y
// respetan el estilo de la app. Se usan de forma imperativa desde cualquier componente:
//   notify.success('Paciente guardado');
//   if (!(await confirmar({ title: '¿Eliminar?', tone: 'danger' }))) return;
// <FeedbackHost /> debe estar montado una sola vez (ver main.tsx).

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'default';
}

interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

interface FeedbackState {
  toasts: ToastItem[];
  confirms: ConfirmRequest[];
}

let state: FeedbackState = { toasts: [], confirms: [] };
const listeners = new Set<() => void>();
let seq = 0;

const setState = (next: FeedbackState) => {
  state = next;
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

const push = (tone: ToastTone, message: string, title?: string) => {
  const id = ++seq;
  // Máximo 4 visibles: los más viejos se descartan para no tapar la pantalla
  setState({ ...state, toasts: [...state.toasts.slice(-3), { id, tone, message, title }] });
  return id;
};

export const dismissToast = (id: number) => {
  setState({ ...state, toasts: state.toasts.filter(t => t.id !== id) });
};

export const notify = {
  success: (message: string, title?: string) => push('success', message, title),
  error: (message: string, title?: string) => push('error', message, title),
  info: (message: string, title?: string) => push('info', message, title),
  warning: (message: string, title?: string) => push('warning', message, title)
};

export function confirmar(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    setState({ ...state, confirms: [...state.confirms, { ...options, id: ++seq, resolve }] });
  });
}

const resolveConfirm = (id: number, ok: boolean) => {
  const req = state.confirms.find(c => c.id === id);
  setState({ ...state, confirms: state.confirms.filter(c => c.id !== id) });
  req?.resolve(ok);
};

const TOAST_STYLES: Record<ToastTone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200', iconColor: 'text-emerald-600' },
  error: { icon: AlertCircle, ring: 'border-rose-200', iconColor: 'text-rose-600' },
  warning: { icon: AlertTriangle, ring: 'border-amber-200', iconColor: 'text-amber-600' },
  info: { icon: Info, ring: 'border-sky-200', iconColor: 'text-sky-600' }
};

function ToastCard({ toast }: { toast: ToastItem; key?: number }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.tone === 'error' || toast.tone === 'warning' ? 8000 : 4500);

  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = setTimeout(() => dismissToast(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [paused, toast.id]);

  const { icon: Icon, ring, iconColor } = TOAST_STYLES[toast.tone];
  const urgent = toast.tone === 'error' || toast.tone === 'warning';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto w-full sm:w-96 bg-white border ${ring} shadow-lg shadow-slate-900/10 rounded-2xl p-3.5 flex items-start gap-3 animate-toast-in`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
      <div className="flex-1 min-w-0 text-sm">
        {toast.title && <p className="font-bold text-slate-900">{toast.title}</p>}
        <p className="text-slate-700 break-words">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 -m-1.5 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        aria-label="Cerrar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({ request }: { request: ConfirmRequest; key?: number }) {
  const titleId = useId();
  const descId = useId();
  const ref = useDialog<HTMLDivElement>(true, () => resolveConfirm(request.id, false));
  const tone = request.tone ?? 'default';
  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;
  const iconBox = tone === 'danger' ? 'bg-rose-50 text-rose-600' : tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600';
  const confirmBtn = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : tone === 'warning'
    ? 'bg-amber-600 hover:bg-amber-700 text-white'
    : 'bg-slate-900 hover:bg-slate-800 text-white';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.message ? descId : undefined}
        tabIndex={-1}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 animate-dialog-in focus:outline-hidden"
      >
        <div className="flex items-start gap-4">
          <div className={`shrink-0 p-2.5 rounded-2xl ${iconBox}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-900">{request.title}</h2>
            {request.message && (
              <p id={descId} className="text-sm text-slate-600 mt-1.5 whitespace-pre-line">{request.message}</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {/* El foco inicial va a "Cancelar": un Enter accidental no ejecuta la acción destructiva */}
          <button
            type="button"
            data-autofocus
            onClick={() => resolveConfirm(request.id, false)}
            className="min-h-11 px-4 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
          >
            {request.cancelText ?? 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(request.id, true)}
            className={`min-h-11 px-4 rounded-xl text-sm font-bold transition-colors ${confirmBtn}`}
          >
            {request.confirmText ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackHost() {
  const { toasts, confirms } = useSyncExternalStore(subscribe, () => state, () => state);
  const current = confirms[0];

  return (
    <>
      <div
        aria-live="polite"
        className="fixed z-[80] inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 p-4 flex flex-col items-stretch sm:items-end gap-2 pointer-events-none print:hidden"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {toasts.map(t => <ToastCard key={t.id} toast={t} />)}
      </div>
      {current && <ConfirmDialog key={current.id} request={current} />}
    </>
  );
}
