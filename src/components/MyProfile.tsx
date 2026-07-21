import React, { useState, useEffect } from 'react';
import { User } from '../data/mockData';
import { MapPin, Clock, Save } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

interface MyProfileProps {
  currentUser: User;
  onSaveUser: (user: User) => void;
}

export default function MyProfile({ currentUser, onSaveUser }: MyProfileProps) {
  const [ubicacionDireccion, setUbicacionDireccion] = useState(currentUser.ubicacionDireccion || '');
  const [ubicacionLat, setUbicacionLat] = useState<number | null>(currentUser.ubicacionLat);
  const [ubicacionLng, setUbicacionLng] = useState<number | null>(currentUser.ubicacionLng);
  const [maxTiempoTrasladoMinutos, setMaxTiempoTrasladoMinutos] = useState(currentUser.maxTiempoTrasladoMinutos);
  const [mapsListo, setMapsListo] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => loadGoogleMapsScript(data.googleMapsApiKey))
      .then(() => setMapsListo(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mapsListo) return;
    const input = document.getElementById('mi-perfil-direccion-input') as HTMLInputElement | null;
    if (!input) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, { fields: ['formatted_address', 'geometry'] });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        setUbicacionDireccion(place.formatted_address || input.value);
        setUbicacionLat(place.geometry.location.lat());
        setUbicacionLng(place.geometry.location.lng());
      }
    });
  }, [mapsListo]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveUser({ ...currentUser, ubicacionDireccion, ubicacionLat, ubicacionLng, maxTiempoTrasladoMinutos });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs max-w-lg">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <MapPin className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Mi Perfil — Visitas a Domicilio</h3>
          <p className="text-[11px] text-slate-500">Configura tu ubicación principal para que los pacientes puedan agendar visitas a domicilio contigo</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-slate-600 font-medium mb-1">Dirección Principal</label>
          <input
            id="mi-perfil-direccion-input"
            type="text"
            value={ubicacionDireccion}
            onChange={(e) => setUbicacionDireccion(e.target.value)}
            placeholder="Escriba su dirección exacta"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="block text-slate-600 font-medium mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tiempo máximo de traslado aceptado (minutos)</label>
          <input
            type="number"
            min={0}
            value={maxTiempoTrasladoMinutos}
            onChange={(e) => setMaxTiempoTrasladoMinutos(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <button type="submit" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold">
          <Save className="w-3.5 h-3.5" />
          {guardado ? 'Guardado ✓' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
