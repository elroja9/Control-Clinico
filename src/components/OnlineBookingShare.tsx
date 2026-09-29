import React, { useState } from 'react';
import { Company } from '../data/mockData';
import { Share2, Copy, ExternalLink, Check, Calendar } from 'lucide-react';

interface OnlineBookingShareProps {
  company: Company;
}

export default function OnlineBookingShare({ company }: OnlineBookingShareProps) {
  const [copiado, setCopiado] = useState(false);
  const bookingUrl = `${window.location.origin}/agendar?clinica=${company.id}`;

  const handleCopiar = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleCompartir = () => {
    if ((navigator as any).share) {
      (navigator as any).share({
        title: `Agendar cita en ${company.nombreComercial}`,
        text: `Reserva tu cita en línea con ${company.nombreComercial}`,
        url: bookingUrl
      }).catch(() => {});
    } else {
      handleCopiar();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs max-w-lg">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <Calendar className="w-5 h-5 text-slate-500" style={{ color: company.colorPrimario }} />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Reservas en Línea</h3>
          <p className="text-[11px] text-slate-500">Comparte este enlace con tus pacientes para que agenden su cita por su cuenta, sin necesidad de llamar</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
        <span className="block text-slate-500 text-[11px] font-semibold uppercase mb-1">Tu enlace de reservas</span>
        <a href={bookingUrl} target="_blank" rel="noreferrer" className="font-mono text-teal-700 break-all hover:underline">{bookingUrl}</a>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCopiar}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold"
        >
          {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
        <button
          onClick={handleCompartir}
          className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg font-semibold"
          style={{ backgroundColor: company.colorPrimario }}
        >
          <Share2 className="w-3.5 h-3.5" />
          Compartir
        </button>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver página
        </a>
      </div>
    </div>
  );
}
