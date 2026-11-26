import React, { useState, useEffect } from 'react';
import { Patient } from '../data/mockData';
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { Heart, Dumbbell, MapPin, User, Save, X } from 'lucide-react';
import { notify } from './ui/Feedback';
import { terminoPersona } from '../utils/terminoPersona';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Field } from './ui/Field';
import { cx } from './ui/cx';

interface PatientFormProps {
  companyId: number;
  patients: Patient[];
  editingPatient: Patient | null;
  onSavePatient: (patient: Patient) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania?: string;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-fg mb-4">
      <span className="w-8 h-8 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4" aria-hidden="true">
        {icon}
      </span>
      {children}
    </h3>
  );
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 min-h-11 px-3 rounded-control border border-border bg-surface text-sm font-medium text-fg hover:border-border-strong transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4.5 h-4.5 shrink-0 accent-brand-solid"
      />
      {label}
    </label>
  );
}

export default function PatientForm({
  companyId,
  patients,
  editingPatient,
  onSavePatient,
  onCancel,
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

  const sectionDivider = 'border-t border-border pt-6';

  return (
    <form onSubmit={handleSave} className="bg-surface rounded-panel border border-border shadow-sm overflow-clip">
      {/* Encabezado */}
      <div className="px-4 sm:px-6 py-4 flex justify-between items-center gap-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">
            <User className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-heading font-semibold tracking-tight text-fg">
              {esLegal
                ? (editingPatient ? 'Modificar datos del cliente' : 'Nuevo cliente')
                : (editingPatient ? 'Modificar expediente del paciente' : 'Nuevo expediente de paciente')}
            </h2>
            <p className="text-xs text-fg-muted">Los campos marcados con * son obligatorios.</p>
          </div>
        </div>
        <IconButton label="Cerrar sin guardar" icon={<X className="w-5 h-5" aria-hidden="true" />} onClick={onCancel} />
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Sección 1: datos personales */}
        <section aria-labelledby="pf-personal">
          <SectionTitle icon={<User />}><span id="pf-personal">1. Datos personales y demográficos</span></SectionTitle>
          <div className={cx('grid grid-cols-1 gap-4', !esLegal && 'sm:grid-cols-2 lg:grid-cols-4')}>
            <Field label="Nombre completo" required>
              <Input
                type="text"
                value={nombre}
                onChange={(e: any) => setNombre(e.target.value)}
                placeholder="ej: María Delgado"
                required
              />
            </Field>
            {!esLegal && (<>
              <Field label="Fecha de nacimiento">
                <Input
                  type="date"
                  className="px-2.5!"
                  value={fechaNac}
                  onChange={(e: any) => handleBirthdateChange(e.target.value)}
                />
              </Field>
              <Field label="Edad calculada">
                <Input type="number" value={edad} disabled readOnly className="font-semibold" />
              </Field>
              <Field label="Sexo">
                <Select
                  value={sexo}
                  onChange={(e: any) => setSexo(e.target.value as 'M' | 'F' | '')}
                >
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </Select>
              </Field>
            </>)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <Field label="Tipo de cédula (Hacienda)">
              <Select
                value={tipoId}
                onChange={(e: any) => setTipoId(e.target.value as any)}
              >
                <option value="01">Cédula Física (01)</option>
                <option value="02">Cédula Jurídica (02)</option>
                <option value="03">DIMEX Extranjero (03)</option>
                <option value="04">NITE Especial (04)</option>
                <option value="EXT">Pasaporte / Extranjero (EXT)</option>
              </Select>
            </Field>
            <Field label="Número de identificación" required>
              <Input
                type="text"
                value={identificacion}
                onChange={(e: any) => setIdentificacion(e.target.value)}
                placeholder="ej: 1-1234-5678"
                required
              />
            </Field>
            <Field label="Teléfono móvil (Costa Rica)">
              <Input
                type="text"
                inputMode="tel"
                value={telefono}
                onChange={(e: any) => setTelefono(e.target.value)}
                placeholder="ej: 8888-9999"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <Field label="Ocupación / Profesión">
              <Input
                type="text"
                value={ocupacion}
                onChange={(e: any) => setOcupacion(e.target.value)}
                placeholder="ej: Ingeniera, Docente..."
              />
            </Field>
            <Field label="Correo electrónico">
              <Input
                type="email"
                value={correo}
                onChange={(e: any) => setCorreo(e.target.value)}
                placeholder={`ej: ${persona.minuscula}@correo.com`}
              />
            </Field>
            {!esLegal && (
              <Field label="Núcleo familiar">
                <Select
                  value={situacion}
                  onChange={(e: any) => setSituacion(e.target.value as any)}
                >
                  <option value="SOLO">Vive Solo(a)</option>
                  <option value="ACOMPAÑADO">Acompañado / Pareja</option>
                  <option value="FAMILIAR">Con Familia Directa</option>
                </Select>
              </Field>
            )}
          </div>
        </section>

        {/* Sección 2: dirección */}
        <section aria-labelledby="pf-direccion" className={sectionDivider}>
          <SectionTitle icon={<MapPin />}><span id="pf-direccion">2. Dirección de residencia (Costa Rica)</span></SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Provincia">
              <Select
                value={provinciaId}
                onChange={(e: any) => handleProvinciaChange(e.target.value)}
              >
                {COSTA_RICA_PROVINCIAS.map(p => (
                  <option key={p.codigo} value={parseInt(p.codigo, 10)}>{p.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cantón">
              <Select
                value={cantonId}
                onChange={(e: any) => handleCantonChange(e.target.value)}
              >
                {cantonesDisponibles.map(c => (
                  <option key={c.codigo} value={provinciaId * 100 + parseInt(c.codigo, 10)}>{c.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Distrito">
              <Select
                value={distritoId}
                onChange={(e: any) => handleDistritoChange(e.target.value)}
              >
                {distritosDisponibles.map(d => (
                  <option key={d.codigo} value={cantonId * 100 + parseInt(d.codigo, 10)}>{d.nombre}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Otras señas / dirección exacta">
              <Input
                type="text"
                value={otrasSenas}
                onChange={(e: any) => setOtrasSenas(e.target.value)}
                placeholder="ej: Del Banco Nacional 150 metros norte, casa amarilla con rejas."
              />
            </Field>
          </div>
        </section>

        {!esLegal && (<>
          {/* Sección 3: antecedentes (nutrición) */}
          <section aria-labelledby="pf-nutricion" className={sectionDivider}>
            <SectionTitle icon={<Heart />}><span id="pf-nutricion">3. Historial de nutrición y patologías</span></SectionTitle>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <CheckOption label="Diabetes" checked={diabetes} onChange={setDiabetes} />
              <CheckOption label="Hipertensión" checked={hipertension} onChange={setHipertension} />
              <CheckOption label="Gastritis / Reflujo" checked={gastritis} onChange={setGastritis} />
              <CheckOption label="Estreñimiento" checked={estrenimiento} onChange={setEstrenimiento} />
            </div>
            <Field label="Alergias o intolerancias alimentarias">
              <Input
                type="text"
                value={alergias}
                onChange={(e: any) => setAlergias(e.target.value)}
                placeholder="ej: Intolerancia al gluten, lactosa, etc."
              />
            </Field>
          </section>

          {/* Sección 4: antecedentes (fisioterapia) */}
          <section aria-labelledby="pf-fisio" className={sectionDivider}>
            <SectionTitle icon={<Dumbbell />}><span id="pf-fisio">4. Antecedentes físicos y lesionales (Kinesiología)</span></SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Historial de fracturas">
                <Input
                  type="text"
                  value={fracturas}
                  onChange={(e: any) => setFracturas(e.target.value)}
                  placeholder="ej: Fractura de tobillo derecho en 2021"
                />
              </Field>
              <Field label="Historial de esguinces / luxaciones">
                <Input
                  type="text"
                  value={esguinces}
                  onChange={(e: any) => setEsguinces(e.target.value)}
                  placeholder="ej: Esguince cervical por choque menor en 2024"
                />
              </Field>
              <Field label="Cirugías ortopédicas previas">
                <Input
                  type="text"
                  value={cirugias}
                  onChange={(e: any) => setCirugias(e.target.value)}
                  placeholder="ej: Reemplazo parcial de rodilla (2023)"
                />
              </Field>
              <Field label="Deportes o actividad física actual">
                <Input
                  type="text"
                  value={actividad}
                  onChange={(e: any) => setActividad(e.target.value)}
                  placeholder="ej: Natación 2 veces por semana, caminatas"
                />
              </Field>
            </div>
          </section>
        </>)}
      </div>

      {/* Barra de acciones */}
      {/* Móvil: acción primaria a ancho completo arriba y Cancelar debajo, sobre la barra de inicio de iOS */}
      <div className="sticky bottom-0 z-10 px-4 sm:px-6 pt-3 sm:pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur-sm border-t border-border flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" icon={<Save className="w-4 h-4" aria-hidden="true" />}>
          {esLegal ? 'Guardar cliente' : 'Guardar expediente'}
        </Button>
      </div>
    </form>
  );
}
