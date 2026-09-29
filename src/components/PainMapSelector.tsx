import { useState } from 'react';
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
    if (!active) return 'bg-slate-300 hover:bg-teal-400 border-white text-slate-700';
    if (score >= 8) return 'bg-rose-600 ring-rose-300 border-white text-white scale-110';
    if (score >= 5) return 'bg-amber-500 ring-amber-300 border-white text-white scale-110';
    return 'bg-emerald-500 ring-emerald-300 border-white text-white scale-110';
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
        <div>
          <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">Mapa Anatómico Digital</h4>
          <p className="text-[11px] text-slate-500">Selecciona el foco del dolor muscular o articular</p>
        </div>
        <span className="text-[11px] font-mono font-semibold bg-teal-950 text-teal-300 border border-teal-800 px-2 py-0.5 rounded-md">
          EVA: {painScore}/10
        </span>
      </div>

      <div className="relative w-full max-w-[240px] aspect-[4/5] bg-slate-950/80 rounded-xl border border-slate-800/60 p-4 flex justify-center items-center overflow-hidden">
        {/* Simple stylized SVG outline of the human back/front */}
        <svg viewBox="0 0 100 120" className="absolute inset-0 w-full h-full opacity-10 stroke-slate-500 fill-none stroke-[1.5]">
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
              onClick={() => onSelectZone(zone.id)}
              className={`absolute transition-all duration-300 cursor-pointer rounded-full border-2 w-7 h-7 flex items-center justify-center text-[11px] font-bold shadow-md focus:outline-hidden ring-4 ring-transparent ${getPainColor(painScore, isActive)}`}
              style={{ left: zone.x, top: zone.y, transform: 'translate(-50%, -50%)' }}
              title={zone.label}
              aria-label={`Zona de dolor: ${zone.label}`}
              aria-pressed={isActive}
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Interactive Legend */}
      <div className="w-full mt-4 bg-slate-950 p-2.5 rounded-xl border border-slate-700/50">
        <span className="text-[11px] font-semibold text-slate-500 block mb-1.5 uppercase">Zonas de Interés</span>
        <div className="flex flex-wrap gap-1.5">
          {zones.map((z) => (
            <button
              key={z.id}
              onClick={() => onSelectZone(z.id)}
              className={`text-[11px] font-medium px-2 py-1 rounded-md transition-all ${
                selectedZone === z.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
