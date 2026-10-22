import React, { useState } from 'react';
import { Proveedor } from '../data/mockData';
import { Truck, Plus, Edit, Power } from 'lucide-react';
import { notify } from './ui/Feedback';
import { errorIdentificacion } from '../utils/identificacion';

interface ProveedorManagerProps {
  proveedores: Proveedor[];
  onSaveProveedor: (proveedor: Partial<Proveedor>) => Promise<void>;
}

export default function ProveedorManager({ proveedores, onSaveProveedor }: ProveedorManagerProps) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [tipoIdentificacion, setTipoIdentificacion] = useState<'01' | '02' | '03' | '04'>('02');
  const [identificacion, setIdentificacion] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const abrirNuevo = () => {
    setEditId(null);
    setTipoIdentificacion('02');
    setIdentificacion('');
    setNombre('');
    setCorreo('');
    setTelefono('');
    setDireccion('');
    setError('');
    setFormAbierto(true);
  };

  const abrirEditar = (p: Proveedor) => {
    setEditId(p.id);
    setTipoIdentificacion(p.tipoIdentificacion);
    setIdentificacion(p.identificacion);
    setNombre(p.nombre);
    setCorreo(p.correo || '');
    setTelefono(p.telefono || '');
    setDireccion(p.direccion || '');
    setError('');
    setFormAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identificacion.trim() || !nombre.trim()) {
      setError('Indique identificación y nombre del proveedor.');
      return;
    }
    const problema = errorIdentificacion(tipoIdentificacion, identificacion.trim());
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onSaveProveedor({
        id: editId ?? undefined,
        tipoIdentificacion,
        identificacion: identificacion.trim(),
        nombre: nombre.trim(),
        correo: correo.trim() || null,
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        activo: true
      });
      setFormAbierto(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = (p: Proveedor) => {
    onSaveProveedor({ ...p, activo: !p.activo })
      .then(() => notify.success(p.activo ? `${p.nombre} quedó inactivo.` : `${p.nombre} quedó activo.`))
      .catch((err: any) => notify.error(err.message || 'No se pudo actualizar el proveedor.'));
  };

  const visibles = proveedores.filter(p => mostrarInactivos || p.activo);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Proveedores</h3>
            <p className="text-[11px] text-slate-500">Directorio de proveedores para Cuentas por Pagar</p>
          </div>
        </div>
        {!formAbierto && (
          <button
            onClick={abrirNuevo}
            className="min-h-10 flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-3 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Nuevo proveedor
          </button>
        )}
      </div>

      {formAbierto && (
        <form onSubmit={handleGuardar} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 mb-4">
          {error && <p role="alert" className="text-[11px] text-rose-700 font-semibold">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="proveedorm-tipo-identificacion" className="block text-slate-600 text-xs font-medium mb-1">Tipo Identificación</label>
              <select id="proveedorm-tipo-identificacion"
                value={tipoIdentificacion}
                onChange={(e) => setTipoIdentificacion(e.target.value as '01' | '02' | '03' | '04')}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="01">Física (9 dígitos)</option>
                <option value="02">Jurídica (10 dígitos)</option>
                <option value="03">DIMEX (11-12 dígitos)</option>
                <option value="04">NITE (10 dígitos)</option>
              </select>
            </div>
            <div>
              <label htmlFor="proveedorm-identificacion" className="block text-slate-600 text-xs font-medium mb-1">Identificación *</label>
              <input id="proveedorm-identificacion" type="text" inputMode="numeric" value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="proveedorm-nombre" className="block text-slate-600 text-xs font-medium mb-1">Nombre *</label>
              <input id="proveedorm-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div>
              <label htmlFor="proveedorm-correo" className="block text-slate-600 text-xs font-medium mb-1">Correo</label>
              <input id="proveedorm-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div>
              <label htmlFor="proveedorm-telefono" className="block text-slate-600 text-xs font-medium mb-1">Teléfono</label>
              <input id="proveedorm-telefono" type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="proveedorm-direccion" className="block text-slate-600 text-xs font-medium mb-1">Dirección</label>
              <input id="proveedorm-direccion" type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setFormAbierto(false)} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">Cancelar</button>
            <button type="submit" disabled={guardando} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60">
              {guardando ? 'Guardando…' : editId != null ? 'Guardar Cambios' : 'Guardar Proveedor'}
            </button>
          </div>
        </form>
      )}

      <label className="inline-flex items-center gap-1.5 min-h-9 text-[11px] text-slate-600 mb-2 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
        Mostrar inactivos
      </label>

      <div className="space-y-1.5">
        {visibles.length === 0 && !formAbierto && (
          <p className="text-slate-500 text-xs text-center py-4">Todavía no has registrado ningún proveedor.</p>
        )}
        {visibles.map(p => (
          <div key={p.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
            <div className="min-w-0">
              <span className="font-semibold text-slate-800 text-xs block">{p.nombre}</span>
              <span className="text-[11px] text-slate-600 break-words">{p.identificacion}{p.telefono ? ` · ${p.telefono}` : ''}{p.correo ? ` · ${p.correo}` : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${p.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </span>
              <button type="button" onClick={() => abrirEditar(p)} title="Editar" className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label={`Editar ${p.nombre}`}>
                <Edit className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => handleToggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label={`${p.activo ? 'Desactivar' : 'Activar'} ${p.nombre}`}>
                <Power className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
