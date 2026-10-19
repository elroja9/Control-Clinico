import React, { useState, useEffect } from 'react';
import { Patient } from '../data/mockData';
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { PlusCircle, Heart, Dumbbell, MapPin, User, Save, X } from 'lucide-react';
import { notify } from './ui/Feedback';
import { terminoPersona } from '../utils/terminoPersona';

interface PatientFormProps {
  companyId: number;
  patients: Patient[];
  editingPatient: Patient | null;
  onSavePatient: (patient: Patient) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania?: string;
}

export default function PatientForm({
  companyId,
  patients,
  editingPatient,
  onSavePatient,
  onCancel,
  themeColor,
  perfilCompania
}: PatientFormProps) {
  // Perfil Legal: el mismo registro sirve de ficha del cliente, sin los datos clínicos.
  const esLegal = perfilCompania === 'Legal';
  const persona = terminoPersona(perfilCompania);
  // Setup fields with default or editing values
  const [nombre, setNombre] = useState('');
  const [fechaNac, setFechaNac] = useState('1995-01-01');
  const [edad, setEdad] = useState(30);
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('');
  const [ocupacion, setOcupacion] = useState('');
  const [correo, setCorreo] = useState('');
  const [situacion, setSituacion] = useState<'SOLO' | 'ACOMPAÑADO' | 'FAMILIAR'>('ACOMPAÑADO');
  const [tipoId, setTipoId] = useState<'01' | '02' | '03' | '04' | 'EXT'>('01');
  const [identificacion, setIdentificacion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [provinciaId, setProvinciaId] = useState(1);
  const [cantonId, setCantonId] = useState(101);
  const [distritoId, setDistritoId] = useState(10101);
  const [otrasSenas, setOtrasSenas] = useState('');

  // Medical Histories
  const [diabetes, setDiabetes] = useState(false);
  const [hipertension, setHipertension] = useState(false);
  const [gastritis, setGastritis] = useState(false);
  const [estrenimiento, setEstrenimiento] = useState(false);
  const [alergias, setAlergias] = useState('');
  const [fracturas, setFracturas] = useState('');
  const [esguinces, setEsguinces] = useState('');
  const [cirugias, setCirugias] = useState('');
  const [actividad, setActividad] = useState('');

  // Hydrate form on edit
  useEffect(() => {
    if (editingPatient) {
      setNombre(editingPatient.nombreCompleto);
      setFechaNac(editingPatient.fechaNacimiento);
      setEdad(editingPatient.edad);
      setSexo(editingPatient.sexo || '');
      setOcupacion(editingPatient.ocupacion);
      setCorreo(editingPatient.correoElectronico);
      setSituacion(editingPatient.situacionVivienda);
      setTipoId(editingPatient.tipoIdentificacion);
      setIdentificacion(editingPatient.identificacion);
      setTelefono(editingPatient.telefono);
      setProvinciaId(editingPatient.provinciaId);
      setCantonId(editingPatient.cantonId);
      setDistritoId(editingPatient.distritoId);
      setOtrasSenas(editingPatient.otrasSenas);
      setDiabetes(editingPatient.diabetes);
      setHipertension(editingPatient.hipertension);
      setGastritis(editingPatient.gastritis);
      setEstrenimiento(editingPatient.estrenimiento);
      setAlergias(editingPatient.alergiasAlimentarias);
      setFracturas(editingPatient.fracturas);
      setEsguinces(editingPatient.esguinces);
      setCirugias(editingPatient.cirugiasOrtopedicas);
      setActividad(editingPatient.actividadFisica);
    }
  }, [editingPatient]);

  // Compute age from birthdate
  const handleBirthdateChange = (dateStr: string) => {
    setFechaNac(dateStr);
    try {
      const birth = new Date(dateStr);
      const today = new Date();
      let ageCalculated = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        ageCalculated--;
      }
      setEdad(isNaN(ageCalculated) ? 30 : ageCalculated);
    } catch (e) {
      // Ignore
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !identificacion.trim()) {
      notify.warning(`Complete el nombre y la identificación del ${persona.minuscula}.`);
      return;
    }

    const patientData: Patient = {
      id: editingPatient ? editingPatient.id : Math.max(0, ...patients.map(p => p.id)) + 1,
      idCompania: companyId,
      nombreCompleto: nombre,
      fechaNacimiento: fechaNac,
      edad: edad,
      sexo: sexo || undefined,
      ocupacion: ocupacion,
      correoElectronico: correo,
      situacionVivienda: situacion,
      tipoIdentificacion: tipoId,
      identificacion: identificacion,
      telefono: telefono,
      provinciaId: provinciaId,
      cantonId: cantonId,
      distritoId: distritoId,
      otrasSenas: otrasSenas,
      diabetes,
      hipertension,
      gastritis,
      estrenimiento,
      alergiasAlimentarias: alergias,
      fracturas,
      esguinces,
      cirugiasOrtopedicas: cirugias,
      actividadFisica: actividad
    };

    onSavePatient(patientData);
  };

  // Cascading Provincia -> Cantón -> Distrito lists for Costa Rica
  // (cantonId = provinciaId*100 + N, distritoId = cantonId*100 + N, per DB convention)
  const provinciaActual = COSTA_RICA_PROVINCIAS.find(p => parseInt(p.codigo, 10) === provinciaId);
  const cantonesDisponibles = provinciaActual ? provinciaActual.cantones : [];
  const cantonActual = cantonesDisponibles.find(c => provinciaId * 100 + parseInt(c.codigo, 10) === cantonId);
  const distritosDisponibles = cantonActual ? cantonActual.distritos : [];

  const handleProvinciaChange = (value: string) => {
    const newProvinciaId = parseInt(value, 10);
    setProvinciaId(newProvinciaId);
    const nuevaProvincia = COSTA_RICA_PROVINCIAS.find(p => parseInt(p.codigo, 10) === newProvinciaId);
    const primerCanton = nuevaProvincia?.cantones[0];
    if (primerCanton) {
      const nuevoCantonId = newProvinciaId * 100 + parseInt(primerCanton.codigo, 10);
      setCantonId(nuevoCantonId);
      const primerDistrito = primerCanton.distritos[0];
      setDistritoId(primerDistrito ? nuevoCantonId * 100 + parseInt(primerDistrito.codigo, 10) : nuevoCantonId * 100);
    }
  };

  const handleCantonChange = (value: string) => {
    const newCantonId = parseInt(value, 10);
    setCantonId(newCantonId);
    const canton = cantonesDisponibles.find(c => provinciaId * 100 + parseInt(c.codigo, 10) === newCantonId);
    const primerDistrito = canton?.distritos[0];
    setDistritoId(primerDistrito ? newCantonId * 100 + parseInt(primerDistrito.codigo, 10) : newCantonId * 100);
  };

  const handleDistritoChange = (value: string) => {
    setDistritoId(parseInt(value, 10));
  };

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-clip text-xs sm:text-sm">
      {/* Header */}
      <div className="p-4 text-white font-bold flex justify-between items-center" style={{ backgroundColor: themeColor }}>
        <div className="flex items-center gap-2">
          <User className="w-5 h-5" aria-hidden="true" />
          <h2>
            {esLegal
              ? (editingPatient ? 'Modificar datos del cliente' : 'Nuevo cliente')
              : (editingPatient ? 'Modificar expediente del paciente' : 'Nuevo expediente de paciente')}
          </h2>
        </div>
        <button type="button" onClick={onCancel} className="hover:bg-black/15 w-9 h-9 -m-1.5 flex items-center justify-center rounded-full transition-colors" aria-label="Cerrar sin guardar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-6">
        <p className="text-xs text-slate-600">Los campos marcados con * son obligatorios.</p>
        {/* Section 1: Personal info */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-500" />
            1. Datos Personales y Demográficos
          </h4>
          <div className={`grid grid-cols-1 gap-4 ${esLegal ? '' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
            <div>
              <label htmlFor="patientfor-nombre-completo" className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
              <input id="patientfor-nombre-completo"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: María Delgado"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            {!esLegal && (<>
            <div>
              <label htmlFor="patientfor-fecha-de-nacimiento" className="block text-slate-600 font-medium mb-1">Fecha de Nacimiento</label>
              <input id="patientfor-fecha-de-nacimiento"
                type="date"
                value={fechaNac}
                onChange={(e) => handleBirthdateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="patientfor-edad-calculada" className="block text-slate-600 font-medium mb-1">Edad calculada</label>
              <input id="patientfor-edad-calculada"
                type="number"
                value={edad}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 font-bold"
              />
            </div>
            <div>
              <label htmlFor="patientfor-sexo" className="block text-slate-600 font-medium mb-1">Sexo</label>
              <select id="patientfor-sexo"
                value={sexo}
                onChange={(e) => setSexo(e.target.value as 'M' | 'F' | '')}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="">Sin especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
            </>)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <div>
              <label htmlFor="patientfor-tipo-de-cedula-hacienda" className="block text-slate-600 font-medium mb-1">Tipo de Cédula (Hacienda)</label>
              <select id="patientfor-tipo-de-cedula-hacienda"
                value={tipoId}
                onChange={(e) => setTipoId(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="01">Cédula Física (01)</option>
                <option value="02">Cédula Jurídica (02)</option>
                <option value="03">DIMEX Extranjero (03)</option>
                <option value="04">NITE Especial (04)</option>
                <option value="EXT">Pasaporte / Extranjero (EXT)</option>
              </select>
            </div>
            <div>
              <label htmlFor="patientfor-numero-de-identificacion" className="block text-slate-600 font-medium mb-1">Número de Identificación *</label>
              <input id="patientfor-numero-de-identificacion"
                type="text"
                value={identificacion}
                onChange={(e) => setIdentificacion(e.target.value)}
                placeholder="ej: 1-1234-5678"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            <div>
              <label htmlFor="patientfor-telefono-movil-costa-rica" className="block text-slate-600 font-medium mb-1">Teléfono Móvil (Costa Rica)</label>
              <input id="patientfor-telefono-movil-costa-rica"
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="ej: 8888-9999"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <div>
              <label htmlFor="patientfor-ocupacion-profesion" className="block text-slate-600 font-medium mb-1">Ocupación / Profesión</label>
              <input id="patientfor-ocupacion-profesion"
                type="text"
                value={ocupacion}
                onChange={(e) => setOcupacion(e.target.value)}
                placeholder="ej: Ingeniera, Docente..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="patientfor-correo-electronico" className="block text-slate-600 font-medium mb-1">Correo Electrónico</label>
              <input id="patientfor-correo-electronico"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder={`ej: ${persona.minuscula}@correo.com`}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            {!esLegal && (
            <div>
              <label htmlFor="patientfor-nucleo-familiar" className="block text-slate-600 font-medium mb-1">Núcleo Familiar</label>
              <select id="patientfor-nucleo-familiar"
                value={situacion}
                onChange={(e) => setSituacion(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="SOLO">Vive Solo(a)</option>
                <option value="ACOMPAÑADO">Acompañado / Pareja</option>
                <option value="FAMILIAR">Con Familia Directa</option>
              </select>
            </div>
            )}
          </div>
        </div>

        {/* Section 2: Address */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
            <MapPin className="w-4 h-4 text-slate-500" />
            2. Dirección de Residencia (Costa Rica)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="patientfor-provincia" className="block text-slate-600 font-medium mb-1">Provincia</label>
              <select id="patientfor-provincia"
                value={provinciaId}
                onChange={(e) => handleProvinciaChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                {COSTA_RICA_PROVINCIAS.map(p => (
                  <option key={p.codigo} value={parseInt(p.codigo, 10)}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="patientfor-canton" className="block text-slate-600 font-medium mb-1">Cantón</label>
              <select id="patientfor-canton"
                value={cantonId}
                onChange={(e) => handleCantonChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                {cantonesDisponibles.map(c => (
                  <option key={c.codigo} value={provinciaId * 100 + parseInt(c.codigo, 10)}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="patientfor-distrito" className="block text-slate-600 font-medium mb-1">Distrito</label>
              <select id="patientfor-distrito"
                value={distritoId}
                onChange={(e) => handleDistritoChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                {distritosDisponibles.map(d => (
                  <option key={d.codigo} value={cantonId * 100 + parseInt(d.codigo, 10)}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="patientfor-otras-senas-direccion-exacta" className="block text-slate-600 font-medium mb-1">Otras Señas / Dirección Exacta</label>
            <input id="patientfor-otras-senas-direccion-exacta"
              type="text"
              value={otrasSenas}
              onChange={(e) => setOtrasSenas(e.target.value)}
              placeholder="ej: Del Banco Nacional 150 metros norte, casa amarilla con rejas."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
        </div>

        {!esLegal && (<>
        {/* Section 3: Clinical Background (Nutrition) */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
            <Heart className="w-4 h-4 text-rose-500" />
            3. Historial de Nutrición y Patologías
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-rose-50/40 p-3 rounded-xl border border-rose-100 mb-3">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={diabetes}
                onChange={(e) => setDiabetes(e.target.checked)}
                className="w-4 h-4 rounded-sm text-rose-600 accent-rose-600"
              />
              Diabetes
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={hipertension}
                onChange={(e) => setHipertension(e.target.checked)}
                className="w-4 h-4 rounded-sm text-rose-600 accent-rose-600"
              />
              Hipertensión
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={gastritis}
                onChange={(e) => setGastritis(e.target.checked)}
                className="w-4 h-4 rounded-sm text-rose-600 accent-rose-600"
              />
              Gastritis / Reflujo
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={estrenimiento}
                onChange={(e) => setEstrenimiento(e.target.checked)}
                className="w-4 h-4 rounded-sm text-rose-600 accent-rose-600"
              />
              Estreñimiento
            </label>
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">Alergias o Intolerancias Alimentarias</label>
            <input
              type="text"
              value={alergias}
              onChange={(e) => setAlergias(e.target.value)}
              placeholder="ej: Intolerancia al gluten, lactosa, etc."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Section 4: Clinical Background (Physiotherapy) */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
            <Dumbbell className="w-4 h-4 text-emerald-600" />
            4. Antecedentes Físicos y Lesionales (Kinesiología)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="patientfor-historial-de-fracturas" className="block text-slate-600 font-medium mb-1">Historial de Fracturas</label>
              <input id="patientfor-historial-de-fracturas"
                type="text"
                value={fracturas}
                onChange={(e) => setFracturas(e.target.value)}
                placeholder="ej: Fractura de tobillo derecho en 2021"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="patientfor-historial-de-esguinces-luxaciones" className="block text-slate-600 font-medium mb-1">Historial de Esguinces / Luxaciones</label>
              <input id="patientfor-historial-de-esguinces-luxaciones"
                type="text"
                value={esguinces}
                onChange={(e) => setEsguinces(e.target.value)}
                placeholder="ej: Esguince cervical por choque menor en 2024"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="patientfor-cirugias-ortopedicas-previas" className="block text-slate-600 font-medium mb-1">Cirugías Ortopédicas previas</label>
              <input id="patientfor-cirugias-ortopedicas-previas"
                type="text"
                value={cirugias}
                onChange={(e) => setCirugias(e.target.value)}
                placeholder="ej: Reemplazo parcial de rodilla (2023)"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="patientfor-deportes-o-actividad-fisica" className="block text-slate-600 font-medium mb-1">Deportes o Actividad Física actual</label>
              <input id="patientfor-deportes-o-actividad-fisica"
                type="text"
                value={actividad}
                onChange={(e) => setActividad(e.target.value)}
                placeholder="ej: Natación 2 veces por semana, caminatas"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>
        </>)}
      </div>

      {/* Actions Footer */}
      <div className="sticky bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 rounded-xl transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="min-h-11 text-white font-semibold px-5 rounded-xl shadow-md flex items-center gap-1.5 hover:brightness-110 transition-[filter]"
          style={{ backgroundColor: themeColor }}
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {esLegal ? 'Guardar cliente' : 'Guardar expediente'}
        </button>
      </div>
    </form>
  );
}
