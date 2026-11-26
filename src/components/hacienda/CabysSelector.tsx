// Selector reutilizable de código CABYS: buscador en el catálogo oficial de Hacienda (con debounce)
// más los "Sugeridos para su clínica" (tabla cabys_sugeridos según el perfil de la empresa).
// Pensado para el formulario de servicios; también se puede usar dentro de <Field> (recibe id y aria-*).
import { useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cx } from '../ui/cx';
import { etiquetaIva, useBusquedaCabys, useCabysSugeridos, type CabysItem } from './haciendaCliente';

export interface ChipsSugeridosProps {
  sugeridos: CabysItem[];
  cargando: boolean;
  error: string | null;
  /** Código marcado como elegido (se resalta). */
  seleccionado?: string;
  onSelect: (item: CabysItem) => void;
  titulo?: string;
}

/** Chips de códigos CABYS sugeridos; se acomodan en varias líneas en pantallas angostas. */
export function ChipsSugeridos({ sugeridos, cargando, error, seleccionado, onSelect, titulo = 'Sugeridos para su clínica' }: ChipsSugeridosProps) {
  if (!cargando && !error && sugeridos.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted mb-2">
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        {titulo}
      </p>
      {cargando ? (
        <div role="status" aria-label="Cargando sugeridos" className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-40 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-44 rounded-full" />
        </div>
      ) : error ? (
        <p className="text-xs text-danger">No se pudieron cargar los sugeridos: {error}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sugeridos.map(s => {
            const activo = seleccionado === s.codigo;
            return (
              <li key={s.codigo} className="max-w-full">
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  aria-pressed={activo}
                  title={`${s.codigo} — ${s.descripcion}`}
                  className={cx(
                    'inline-flex max-w-full items-center gap-1.5 min-h-9 px-3 rounded-full border text-xs font-medium text-left transition-colors',
                    activo ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border bg-surface text-fg hover:bg-surface-muted'
                  )}
                >
                  {activo && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{s.descripcion}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface CabysSelectorProps {
  /** Código CABYS elegido (13 dígitos) o ''. */
  value: string;
  /** Se llama al elegir un código (item con descripción e IVA) o al quitarlo ('' y null). */
  onChange: (codigo: string, item: CabysItem | null) => void;
  /** Acota los sugeridos a una especialidad ('Fisioterapia' o 'Nutrición') más los generales. */
  perfil?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  invalid?: boolean;
  /** Sin @types/react, `key` debe declararse para que TS lo acepte. */
  key?: string | number;
}

export default function CabysSelector({ value, onChange, perfil, disabled, id, invalid, ...aria }: CabysSelectorProps) {
  const [termino, setTermino] = useState('');
  const [elegido, setElegido] = useState<CabysItem | null>(null);
  const { resultados, cargando, error, buscado } = useBusquedaCabys(termino);
  const sugeridos = useCabysSugeridos(perfil);

  const elegir = (item: CabysItem) => {
    setElegido(item);
    setTermino('');
    onChange(item.codigo, item);
  };

  const quitar = () => {
    setElegido(null);
    onChange('', null);
  };

  // Descripción del valor actual si se conoce (elegido aquí o entre los sugeridos).
  const actual = value
    ? (elegido?.codigo === value ? elegido : sugeridos.sugeridos.find(s => s.codigo === value)) ?? null
    : null;
  const mostrarLista = termino.trim().length >= 3;

  return (
    <div className="space-y-3 min-w-0">
      <ChipsSugeridos {...sugeridos} seleccionado={value} onSelect={elegir} />

      <Input
        id={id}
        aria-describedby={aria['aria-describedby']}
        invalid={invalid}
        type="search"
        inputMode="search"
        autoComplete="off"
        disabled={disabled}
        value={termino}
        onChange={(e: any) => setTermino(e.target.value)}
        placeholder="Buscar en el catálogo CABYS (p. ej. masaje) o escribir el código"
        leadingIcon={<Search />}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {mostrarLista && !cargando ? (error ? error : `${resultados.length} resultados`) : ''}
      </p>

      {mostrarLista && (
        <div className="rounded-control border border-border bg-surface">
          {cargando ? (
            <div className="p-3 space-y-2" aria-hidden="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-3 text-sm text-danger">{error}</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-sm text-fg-muted">
              Sin resultados para «{buscado}». El catálogo usa términos como «masaje», «hidroterapia» o «ejercicio».
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border">
              {resultados.map(r => (
                <li key={r.codigo}>
                  <button
                    type="button"
                    onClick={() => elegir(r)}
                    disabled={disabled}
                    className="w-full min-h-11 px-3 py-2 text-left hover:bg-surface-muted flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
                  >
                    <span className="font-mono text-xs text-fg-muted shrink-0">{r.codigo}</span>
                    <span className="text-sm text-fg break-words min-w-0 flex-1">{r.descripcion}</span>
                    <Badge tone="info" className="self-start sm:self-center">{etiquetaIva(r.impuesto)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {value && (
        <div className="flex items-start gap-2 rounded-control bg-surface-muted px-3 py-2 min-w-0">
          <Check className="w-4 h-4 mt-0.5 text-success shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-mono font-semibold text-fg">{value}</span>
            {actual && <span className="block text-fg-muted break-words">{actual.descripcion}</span>}
          </div>
          {actual && <Badge tone="info">{etiquetaIva(actual.impuesto)}</Badge>}
          {!disabled && (
            <button type="button" onClick={quitar} className="shrink-0 w-8 h-8 -m-1 rounded-control flex items-center justify-center text-fg-muted hover:bg-border" aria-label="Quitar código CABYS">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
