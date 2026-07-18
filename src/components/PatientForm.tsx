import React, { useState, useEffect } from 'react';
import { Patient } from '../data/mockData';
import { PlusCircle, Heart, Dumbbell, MapPin, User, Save, X } from 'lucide-react';

interface PatientFormProps {
  companyId: number;
  patients: Patient[];
  editingPatient: Patient | null;
  onSavePatient: (patient: Patient) => void;
  onCancel: () => void;
  themeColor: string;
}

export default function PatientForm({
  companyId,
  patients,
  editingPatient,
  onSavePatient,
  onCancel,
  themeColor
}: PatientFormProps) {
  // Setup fields with default or editing values
  const [nombre, setNombre] = useState('');
  const [fechaNac, setFechaNac] = useState('1995-01-01');
  const [edad, setEdad] = useState(30);
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
      alert('Por favor complete el nombre y la identificación del paciente.');
      return;
    }

    const patientData: Patient = {
      id: editingPatient ? editingPatient.id : Math.max(0, ...patients.map(p => p.id)) + 1,
      idCompania: companyId,
      nombreCompleto: nombre,
      fechaNacimiento: fechaNac,
      edad: edad,
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

  // Province drop list for Costa Rica
  const CostaRicaProvinces = [
    { id: 1, name: 'San José' },
    { id: 2, name: 'Alajuela' },
    { id: 3, name: 'Cartago' },
    { id: 4, name: 'Heredia' },
    { id: 5, name: 'Guanacaste' },
    { id: 6, name: 'Puntarenas' },
    { id: 7, name: 'Limón' }
  ];

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs sm:text-sm">
      {/* Header */}
      <div className="p-4 text-white font-bold flex justify-between items-center" style={{ backgroundColor: themeColor }}>
        <div className="flex items-center gap-2">
          <User className="w-5 h-5" />
          <span>{editingPatient ? 'Modificar Expediente del Paciente' : 'Crear Nuevo Expediente de Paciente'}</span>
        </div>
        <button type="button" onClick={onCancel} className="hover:bg-black/10 p-1.5 rounded-full">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-6 max-h-[550px] overflow-y-auto">
        {/* Section 1: Personal info */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-500" />
            1. Datos Personales y Demográficos
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: María Delgado"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Fecha de Nacimiento</label>
              <input
                type="date"
                value={fechaNac}
                onChange={(e) => handleBirthdateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Edad calculada</label>
              <input
                type="number"
                value={edad}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Tipo de Cédula (Hacienda)</label>
              <select
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
              <label className="block text-slate-600 font-medium mb-1">Número de Identificación *</label>
              <input
                type="text"
                value={identificacion}
                onChange={(e) => setIdentificacion(e.target.value)}
                placeholder="ej: 1-1234-5678"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Teléfono Móvil (Costa Rica)</label>
              <input
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
              <label className="block text-slate-600 font-medium mb-1">Ocupación / Profesión</label>
              <input
                type="text"
                value={ocupacion}
                onChange={(e) => setOcupacion(e.target.value)}
                placeholder="ej: Ingeniera, Docente..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="ej: paciente@correo.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Núcleo Familiar</label>
              <select
                value={situacion}
                onChange={(e) => setSituacion(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="SOLO">Vive Solo(a)</option>
                <option value="ACOMPAÑADO">Acompañado / Pareja</option>
                <option value="FAMILIAR">Con Familia Directa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Address */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
            <MapPin className="w-4 h-4 text-slate-500" />
            2. Dirección de Residencia (Costa Rica)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Provincia</label>
              <select
                value={provinciaId}
                onChange={(e) => setProvinciaId(parseInt(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                {CostaRicaProvinces.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Código de Cantón</label>
              <input
                type="number"
                value={cantonId}
                onChange={(e) => setCantonId(parseInt(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Código de Distrito</label>
              <input
                type="number"
                value={distritoId}
                onChange={(e) => setDistritoId(parseInt(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-slate-600 font-medium mb-1">Otras Señas / Dirección Exacta</label>
            <input
              type="text"
              value={otrasSenas}
              onChange={(e) => setOtrasSenas(e.target.value)}
              placeholder="ej: Del Banco Nacional 150 metros norte, casa amarilla con rejas."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Section 3: Clinical Background (Nutrition) */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
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
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-t border-slate-100 pt-4">
            <Dumbbell className="w-4 h-4 text-emerald-600" />
            4. Antecedentes Físicos y Lesionales (Kinesiología)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Historial de Fracturas</label>
              <input
                type="text"
                value={fracturas}
                onChange={(e) => setFracturas(e.target.value)}
                placeholder="ej: Fractura de tobillo derecho en 2021"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Historial de Esguinces / Luxaciones</label>
              <input
                type="text"
                value={esguinces}
                onChange={(e) => setEsguinces(e.target.value)}
                placeholder="ej: Esguince cervical por choque menor en 2024"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Cirugías Ortopédicas previas</label>
              <input
                type="text"
                value={cirugias}
                onChange={(e) => setCirugias(e.target.value)}
                placeholder="ej: Reemplazo parcial de rodilla (2023)"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Deportes o Actividad Física actual</label>
              <input
                type="text"
                value={actividad}
                onChange={(e) => setActividad(e.target.value)}
                placeholder="ej: Natación 2 veces por semana, caminatas"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-xl transition-all"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="text-white font-semibold px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
          style={{ backgroundColor: themeColor }}
        >
          <Save className="w-4 h-4" />
          Guardar Expediente
        </button>
      </div>
    </form>
  );
}
