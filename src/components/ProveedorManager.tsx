import React, { useState } from 'react';
import { Proveedor } from '../data/mockData';
import { Truck, Plus, Edit, Power } from 'lucide-react';
import { notify } from './ui/Feedback';
import { errorIdentificacion } from '../utils/identificacion';
import { Card } from './ui/Card';
import { ResponsiveModal } from './ui/ResponsiveModal';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';

const labelCls = 'block text-fg font-semibold mb-1.5 text-xs';

interface ProveedorManagerProps {
  proveedores: Proveedor[];
  onSaveProveedor: (proveedor: Partial<Proveedor>) => Promise<void>;
  soloLectura?: boolean; // Contador: solo consulta el directorio
}

export default function ProveedorManager({ proveedores, onSaveProveedor, soloLectura = false }: ProveedorManagerProps) {
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
    <section aria-labelledby="proveedores-titulo">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 id="proveedores-titulo" className="text-heading font-semibold text-fg tracking-tight">Proveedores</h3>
          <p className="text-body text-fg-muted">Directorio de proveedores para Cuentas por Pagar</p>
        </div>
        {!soloLectura && !formAbierto && (
          <Button onClick={abrirNuevo} icon={<Plus className="w-4 h-4" aria-hidden="true" />} className="w-full sm:w-auto">
            Nuevo proveedor
          </Button>
        )}
      </div>

      <ResponsiveModal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        title={editId != null ? 'Editar proveedor' : 'Nuevo proveedor'}
        icon={<Truck aria-hidden="true" />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>Cancelar</Button>
            <Button type="submit" form="form-proveedor" disabled={guardando}>
              {guardando ? 'Guardando…' : editId != null ? 'Guardar Cambios' : 'Guardar Proveedor'}
            </Button>
          </>
        }
      >
        <form id="form-proveedor" onSubmit={handleGuardar} className="space-y-4">
          {error && <p role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger/20 text-xs text-danger font-semibold">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="proveedorm-tipo-identificacion" className={labelCls}>Tipo Identificación</label>
              <Select id="proveedorm-tipo-identificacion"
                value={tipoIdentificacion}
                onChange={(e: any) => setTipoIdentificacion(e.target.value as '01' | '02' | '03' | '04')}
              >
                <option value="01">Física (9 dígitos)</option>
                <option value="02">Jurídica (10 dígitos)</option>
                <option value="03">DIMEX (11-12 dígitos)</option>
                <option value="04">NITE (10 dígitos)</option>
              </Select>
            </div>
            <div>
              <label htmlFor="proveedorm-identificacion" className={labelCls}>Identificación *</label>
              <Input id="proveedorm-identificacion" type="text" inputMode="numeric" value={identificacion} onChange={(e: any) => setIdentificacion(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="proveedorm-nombre" className={labelCls}>Nombre *</label>
              <Input id="proveedorm-nombre" type="text" value={nombre} onChange={(e: any) => setNombre(e.target.value)} />
            </div>
            <div>
              <label htmlFor="proveedorm-correo" className={labelCls}>Correo</label>
              <Input id="proveedorm-correo" type="email" value={correo} onChange={(e: any) => setCorreo(e.target.value)} />
            </div>
            <div>
              <label htmlFor="proveedorm-telefono" className={labelCls}>Teléfono</label>
              <Input id="proveedorm-telefono" type="text" value={telefono} onChange={(e: any) => setTelefono(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="proveedorm-direccion" className={labelCls}>Dirección</label>
              <Input id="proveedorm-direccion" type="text" value={direccion} onChange={(e: any) => setDireccion(e.target.value)} />
            </div>
          </div>
        </form>
      </ResponsiveModal>

      <Card>
        <div className="px-4 py-2 border-b border-border">
          <label className="inline-flex items-center gap-2 min-h-10 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" className="w-4 h-4" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>

        {visibles.length === 0 && !formAbierto && (
          <EmptyState icon={<Truck />} title="Sin proveedores" description="Todavía no has registrado ningún proveedor." />
        )}
        <div className="divide-y divide-border">
        {visibles.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted/40 transition-colors">
            <div className="min-w-0">
              <span className="font-semibold text-fg text-body block">{p.nombre}</span>
              <span className="text-xs text-fg-muted break-words">{p.identificacion}{p.telefono ? ` · ${p.telefono}` : ''}{p.correo ? ` · ${p.correo}` : ''}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge tone={p.activo ? 'success' : 'neutral'} className="mr-1">
                {p.activo ? 'Activo' : 'Inactivo'}
              </Badge>
              {!soloLectura && (
                <>
                  <IconButton label={`Editar ${p.nombre}`} title="Editar" icon={<Edit className="w-4 h-4" aria-hidden="true" />} onClick={() => abrirEditar(p)} className="w-10 h-10" />
                  <IconButton label={`${p.activo ? 'Desactivar' : 'Activar'} ${p.nombre}`} title={p.activo ? 'Desactivar' : 'Activar'} icon={<Power className="w-4 h-4" aria-hidden="true" />} onClick={() => handleToggleActivo(p)} className="w-10 h-10" />
                </>
              )}
            </div>
          </div>
        ))}
        </div>
      </Card>
    </section>
  );
}
