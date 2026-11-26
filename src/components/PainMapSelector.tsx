import { MapPin } from 'lucide-react';

interface PainMapProps {
  selectedZone: string;
  onSelectZone: (zoneId: string) => void;
  painScore: number;
}

export default function PainMapSelector({ selectedZone, onSelectZone, painScore }: PainMapProps) {
  const zones = [
    { id: 'cervical', label: 'Cervical / Cuello', x: '50%', y: '16%' },
    { id: 'hombro_izq', label: 'Hombro Izquierdo', x: '35%', y: '22%' },
    { id: 'hombro_der', label: 'Hombro Derecho', x: '65%', y: '22%' },
    { id: 'lumbar', label: 'Región Lumbar (Baja)', x: '50%', y: '45%' },
    { id: 'cadera_der', label: 'Cadera Derecha', x: '60%', y: '53%' },
    { id: 'rodilla_der', label: 'Rodilla Derecha', x: '58%', y: '73%' },
    { id: 'tobillo_izq', label: 'Tobillo Izquierdo', x: '42%', y: '88%' }
  ];

  // Colors depending on Pain Score (EVA)
  const getPainColor = (score: number, active: boolean) => {
    if (!active) return 'bg-surface-muted hover:bg-brand-soft border-border-strong text-fg-muted';
    if (score >= 8) return 'bg-danger ring-danger/30 border-surface text-white scale-110';
    if (score >= 5) return 'bg-warning ring-warning/30 border-surface text-white scale-110';
    return 'bg-success ring-success/30 border-surface text-white scale-110';
  };

  return (
    <div className="bg-surface rounded-card p-5 border border-border shadow-xs flex flex-col items-center">
      <div className="w-full flex items-start justify-between gap-3 mb-4 pb-3 border-b border-border">
        <div>
          <h4 className="text-body font-semibold text-fg">Mapa Anatómico Digital</h4>
          <p className="text-xs text-fg-muted">Selecciona el foco del dolor muscular o articular</p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand/20 px-2.5 py-1 rounded-full">
          EVA: {painScore}/10
        </span>
      </div>

      <div className="relative w-full max-w-[240px] aspect-[4/5] bg-surface-muted rounded-card border border-border p-4 flex justify-center items-center overflow-hidden">
        {/* Simple stylized SVG outline of the human back/front */}
        <svg viewBox="0 0 100 120" className="absolute inset-0 w-full h-full opacity-40 stroke-fg-subtle fill-none stroke-[1.5]" aria-hidden="true">
          {/* Head */}
          <circle cx="50" cy="15" r="8" />
          {/* Neck */}
          <path d="M48,23 L48,27 L52,27 L52,23 Z" />
          {/* Torso & arms */}
          <path d="M30,30 C30,30 40,25 50,25 C60,25 70,30 70,30 L73,45 L67,45 L65,32 L63,65 L50,65 L37,65 L35,32 L33,45 L27,45 Z" />
          {/* Hips and legs */}
          <path d="M37,65 L37,95 L43,95 L45,75 L50,75 L55,75 L57,95 L63,95 L63,65 Z" />
          {/* Feet */}
          <path d="M43,95 L39,98 L43,99 Z" />
          {/* Hands */}
          <circle cx="26" cy="47" r="2" />
          <circle cx="74" cy="47" r="2" />
        </svg>

        {/* Anatomical hot nodes */}
        {zones.map((zone) => {
          const isActive = selectedZone === zone.id;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onSelectZone(zone.id)}
              className={`absolute transition-all duration-300 rounded-full border-2 w-8 h-8 flex items-center justify-center text-[11px] font-bold shadow-md ring-4 ring-transparent before:absolute before:-inset-1 before:content-[''] ${getPainColor(painScore, isActive)}`}
              style={{ left: zone.x, top: zone.y, transform: 'translate(-50%, -50%)' }}
              title={zone.label}
              aria-label={`Zona de dolor: ${zone.label}`}
              aria-pressed={isActive}
            >
              <MapPin className="w-4 h-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Interactive Legend */}
      <div className="w-full mt-4 bg-surface-muted p-3 rounded-card border border-border">
        <span className="text-xs font-semibold text-fg-muted block mb-2">Zonas de interés</span>
        <div className="flex flex-wrap gap-2">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => onSelectZone(z.id)}
              aria-pressed={selectedZone === z.id}
              className={`min-h-10 text-xs font-semibold px-3 rounded-full border transition-colors ${
                selectedZone === z.id
                  ? 'bg-brand-solid border-brand-solid text-brand-fg'
                  : 'bg-surface border-border-strong text-fg hover:bg-brand-soft'
              }`}
            >
              {z.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
