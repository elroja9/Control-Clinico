import React, { useState, useEffect } from 'react';
import { Patient, Consultation } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, RefreshCw, Dumbbell } from 'lucide-react';
import PainMapSelector from './PainMapSelector';

interface ConsultationFormProps {
  patient: Patient;
  onSave: (consultation: Consultation) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
}

export default function ConsultationForm({ patient, onSave, onCancel, themeColor, perfilCompania }: ConsultationFormProps) {
  const [tipo, setTipo] = useState<'Nutrición' | 'Fisioterapia'>(() => {
    if (perfilCompania === 'Fisioterapia') return 'Fisioterapia';
    return 'Nutrición';
  });

  useEffect(() => {
    if (perfilCompania === 'Fisioterapia') {
      setTipo('Fisioterapia');
    } else if (perfilCompania === 'Nutrición') {
      setTipo('Nutrición');
    }
  }, [perfilCompania]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [motivo, setMotivo] = useState('');
  const [horasSueno, setHorasSueno] = useState(7);
  const [compromiso, setCompromiso] = useState(8);
  const [anotaciones, setAnotaciones] = useState('');

  // IA Loading states
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Nutrition Specific
  const [peso, setPeso] = useState(75);
  const [talla, setTalla] = useState(170);
  const [grasaCorp, setGrasaCorp] = useState(22);
  const [grasaVisc, setGrasaVisc] = useState(8);
  const [musculo, setMusculo] = useState(55);
  const [osea, setOsea] = useState(3.0);
  const [cintura, setCintura] = useState(85);
  const [abdominal, setAbdominal] = useState(90);

  // Diet Specific
  const [calorias, setCalorias] = useState(1800);
  const [desayuno, setDesayuno] = useState('');
  const [meriendaMan, setMeriendaMan] = useState('');
  const [almuerzo, setAlmuerzo] = useState('');
  const [meriendaTar, setMeriendaTar] = useState('');
  const [cena, setCena] = useState('');
  const [indicacionesDieta, setIndicacionesDieta] = useState('');

  // Fisioterapia Specific
  const [mecanismoLesion, setMecanismoLesion] = useState('');
  const [diagnosticoMedico, setDiagnosticoMedico] = useState('');
  const [evaDolor, setEvaDolor] = useState(5);
  const [zonaDolor, setZonaDolor] = useState('lumbar');
  const [tipoDolor, setTipoDolor] = useState('Punzante');
  const [factoresAgravantes, setFactoresAgravantes] = useState('');
  const [factoresAtenuantes, setFactoresAtenuantes] = useState('');
  const [posturaObservaciones, setPosturaObservaciones] = useState('');
  const [palpacionHallazgos, setPalpacionHallazgos] = useState('');
  const [romMedido, setRomMedido] = useState('');
  const [fuerzaDaniels, setFuerzaDaniels] = useState('');
  const [pruebasEspeciales, setPruebasEspeciales] = useState('');
  const [agentesFisicos, setAgentesFisicos] = useState('');
  const [terapiaManual, setTerapiaManual] = useState('');
  const [ejercicioTerapeutico, setEjercicioTerapeutico] = useState('');
  const [sesionesSugeridas, setSesionesSugeridas] = useState(10);

  // SOAP SOAP SOAP
  const [soapSubjetivo, setSoapSubjetivo] = useState('');
  const [soapObjetivo, setSoapObjetivo] = useState('');
  const [soapAnalisis, setSoapAnalisis] = useState('');
  const [soapPlan, setSoapPlan] = useState('');

  // Auto-calculate IMC
  const calculatedImc = parseFloat((peso / ((talla / 100) * (talla / 100))).toFixed(1));

  // AI Generation triggers
  const handleAiPrescribeNutrition = async () => {
    setIsAiGenerating(true);
    try {
      const prompt = `Como nutricionista clínica en Costa Rica, diseña una recomendación de dieta diaria express de ${calorias} kcal para el paciente ${patient.nombreCompleto} de ${patient.edad} años, con diagnóstico de gastritis: ${patient.gastritis ? 'Sí' : 'No'}, diabetes: ${patient.diabetes ? 'Sí' : 'No'}, hipertensión: ${patient.hipertension ? 'Sí' : 'No'}. Alergias: ${patient.alergiasAlimentarias}.
Conserva un formato JSON estricto con las claves: desayuno, meriendaManana, almuerzo, meriendaTarde, cena, indicaciones adicionales. Usa platillos de la gastronomía costarricense saludables (gallo pinto ligero, papaya, cas, queso tierno, aguacate, pescado). Retorna SOLO el JSON sin markdown ni explicaciones adicionales.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, schemaContext: '' })
      });

      const data = await res.json();
      if (data.text) {
        // Parse JSON safely
        const cleanJsonStr = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        setDesayuno(parsed.desayuno || '');
        setMeriendaMan(parsed.meriendaManana || '');
        setAlmuerzo(parsed.almuerzo || '');
        setMeriendaTar(parsed.meriendaTarde || '');
        setCena(parsed.cena || '');
        setIndicacionesDieta(parsed.indicaciones || '');
        setAnotaciones("Prescripción nutricional sugerida automáticamente por el Copilot de IA.");
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo conectar con el motor de IA. Por favor, ingresa los datos de la dieta manualmente.");
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAiPrescribeFisio = async () => {
    setIsAiGenerating(true);
    try {
      const prompt = `Como fisioterapeuta kinesiologo experto en Costa Rica, prescribe un tratamiento de terapia física y redacta la nota SOAP para un dolor localizado en "${zonaDolor}" de intensidad EVA ${evaDolor}/10, tipo de dolor "${tipoDolor}". El paciente es ${patient.nombreCompleto}.
Retorna un objeto JSON estricto con las siguientes claves: postura, palpacion, rom, daniels, pruebas, agentesFisicos, terapiaManual, ejercicios, subjetivo, objetivo, analisis, plan. Retorna SOLO el JSON sin explicaciones adicionales.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, schemaContext: '' })
      });

      const data = await res.json();
      if (data.text) {
        const cleanJsonStr = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        setPosturaObservaciones(parsed.postura || '');
        setPalpacionHallazgos(parsed.palpacion || '');
        setRomMedido(parsed.rom || '');
        setFuerzaDaniels(parsed.daniels || '');
        setPruebasEspeciales(parsed.pruebas || '');
        setAgentesFisicos(parsed.agentesFisicos || '');
        setTerapiaManual(parsed.terapiaManual || '');
        setEjercicioTerapeutico(parsed.ejercicios || '');
        setSoapSubjetivo(parsed.subjetivo || '');
        setSoapObjetivo(parsed.objetivo || '');
        setSoapAnalisis(parsed.analisis || '');
        setSoapPlan(parsed.plan || '');
        setAnotaciones("Plan fisioterapéutico y notas SOAP optimizados por el Copilot de IA.");
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo conectar con la IA. Por favor, rellena los campos clínicos del examen físico manualmente.");
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      alert("Por favor indique el motivo de la consulta.");
      return;
    }

    const newConsultation: Consultation = {
      id: Date.now(),
      idPaciente: patient.id,
      idCompania: patient.idCompania,
      fecha,
      tipo,
      motivo,
      horasSueno,
      compromiso,
      anotacionesGenerales: anotaciones,
      ...(tipo === 'Nutrición' ? {
        antropometria: {
          peso,
          talla,
          imc: calculatedImc,
          grasaCorporal: grasaCorp,
          grasaVisceral: grasaVisc,
          masaMuscular: musculo,
          masaOsea: osea,
          cintura,
          abdominal
        },
        dieta: {
          totalCalorias: calorias,
          desayuno,
          meriendaManana: meriendaMan,
          almuerzo,
          meriendaTarde: meriendaTar,
          cena,
          indicaciones: indicacionesDieta
        }
      } : {
        fisioterapia: {
          mecanismoLesion,
          diagnosticoMedico,
          evaDolor,
          zonaDolor,
          tipoDolor,
          factoresAgravantes,
          factoresAtenuantes,
          posturaObservaciones,
          palpacionHallazgos,
          romMedido,
          fuerzaDaniels,
          pruebasEspeciales,
          agentesFisicos,
          terapiaManual,
          ejercicioTerapeutico,
          sesionesSugeridas,
          soapSubjetivo,
          soapObjetivo,
          soapAnalisis,
          soapPlan
        }
      })
    };

    onSave(newConsultation);
  };

  return (
    <form onSubmit={handleFormSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden text-xs sm:text-sm">
      {/* Tab Selector */}
      <div className="p-4 text-white flex flex-col sm:flex-row justify-between items-center gap-3" style={{ backgroundColor: themeColor }}>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 animate-bounce" />
          <div>
            <h3 className="font-bold">Nueva Consulta Clínica</h3>
            <p className="text-[10.5px] opacity-90">Paciente: {patient.nombreCompleto} (Identificación: {patient.identificacion})</p>
          </div>
        </div>
        
        {/* Specialty Selector */}
        {perfilCompania === 'Ambas' ? (
          <div className="flex bg-black/20 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTipo('Nutrición')}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                tipo === 'Nutrición' ? 'bg-white text-slate-900 shadow-sm' : 'text-white hover:bg-white/10'
              }`}
            >
              🍎 Nutrición
            </button>
            <button
              type="button"
              onClick={() => setTipo('Fisioterapia')}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                tipo === 'Fisioterapia' ? 'bg-white text-slate-900 shadow-sm' : 'text-white hover:bg-white/10'
              }`}
            >
              💪 Fisioterapia
            </button>
          </div>
        ) : (
          <div className="bg-black/30 px-3.5 py-1.5 rounded-xl text-xs font-bold border border-white/15 shadow-sm">
            Especialidad: {tipo === 'Fisioterapia' ? '💪 Fisioterapia' : '🍎 Nutrición'}
          </div>
        )}
      </div>

      <div className="p-5 space-y-6 max-h-[550px] overflow-y-auto">
        
        {/* Core fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Fecha de Consulta</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Horas promedio de sueño</label>
            <input
              type="number"
              step="0.5"
              value={horasSueno}
              onChange={(e) => setHorasSueno(parseFloat(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Motivación del Paciente (1 al 10)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={compromiso}
              onChange={(e) => setCompromiso(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-bold"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-600 font-bold mb-1">Motivo de la Cita *</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej: Control de peso bimensual / Dolor agudo lumbar post entrenamiento"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            required
          />
        </div>

        {/* ================= NUTRITION SPECIFIC PANEL ================= */}
        {tipo === 'Nutrición' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-t border-slate-100 pt-4">
              <Activity className="w-4 h-4 text-rose-500" />
              Evaluación Antropométrica e IMC
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
              <div>
                <label className="block text-slate-600 text-xs mb-1">Peso (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={peso}
                  onChange={(e) => setPeso(parseFloat(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Estatura / Talla (cm)</label>
                <input
                  type="number"
                  value={talla}
                  onChange={(e) => setTalla(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">IMC Calculado</label>
                <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-extrabold flex justify-between items-center">
                  <span>{calculatedImc}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 rounded-sm">
                    {calculatedImc >= 30 ? 'Obesidad' : calculatedImc >= 25 ? 'Sobrepeso' : 'Normal'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Grasa Corporal (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={grasaCorp}
                  onChange={(e) => setGrasaCorp(parseFloat(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Grasa Visceral (Nivel)</label>
                <input
                  type="number"
                  value={grasaVisc}
                  onChange={(e) => setGrasaVisc(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Masa Muscular (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={musculo}
                  onChange={(e) => setMusculo(parseFloat(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Cintura (cm)</label>
                <input
                  type="number"
                  value={cintura}
                  onChange={(e) => setCintura(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs mb-1">Abdominal (cm)</label>
                <input
                  type="number"
                  value={abdominal}
                  onChange={(e) => setAbdominal(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
            </div>

            {/* Diet design */}
            <div className="border-t border-slate-100 pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-emerald-600" />
                  Diseño de Menú de Dieta & Recetas
                </h4>
                <button
                  type="button"
                  onClick={handleAiPrescribeNutrition}
                  disabled={isAiGenerating}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-1.5 px-3 rounded-lg shadow-md transition-all flex items-center gap-1.5"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Prescribiendo Dieta...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generar Menú con IA Costa Rica
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <label className="block text-slate-600 font-bold mb-1">Presupuesto Calórico Diario (kcal)</label>
                  <input
                    type="number"
                    value={calorias}
                    onChange={(e) => setCalorias(parseInt(e.target.value))}
                    className="w-32 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-3 bg-teal-50/20 p-4 rounded-xl border border-teal-100">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Desayuno Saludable</label>
                  <textarea
                    rows={2}
                    value={desayuno}
                    onChange={(e) => setDesayuno(e.target.value)}
                    placeholder="ej: Gallo pinto ligero con un huevo y queso tierno..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Merienda Mañana</label>
                    <input
                      type="text"
                      value={meriendaMan}
                      onChange={(e) => setMeriendaMan(e.target.value)}
                      placeholder="ej: Manzana picada con almendras"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Merienda Tarde</label>
                    <input
                      type="text"
                      value={meriendaTar}
                      onChange={(e) => setMeriendaTar(e.target.value)}
                      placeholder="ej: Yogur descremado con chía"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Almuerzo Nutritivo</label>
                  <textarea
                    rows={2}
                    value={almuerzo}
                    onChange={(e) => setAlmuerzo(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Cena Ligera</label>
                  <textarea
                    rows={2}
                    value={cena}
                    onChange={(e) => setCena(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Indicaciones Clínicas Adicionales</label>
                  <textarea
                    rows={2}
                    value={indicacionesDieta}
                    onChange={(e) => setIndicacionesDieta(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= FISIOTERAPIA SPECIFIC PANEL ================= */}
        {tipo === 'Fisioterapia' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-teal-600" />
                Valoración Mecánica, Dolor & Kinesiología
              </h4>
              <button
                type="button"
                onClick={handleAiPrescribeFisio}
                disabled={isAiGenerating}
                className="bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs py-1.5 px-3 rounded-lg shadow-md transition-all flex items-center gap-1.5"
              >
                {isAiGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Prescribiendo Tratamiento...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generar Plan Completo con IA
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pain Map Selector block */}
              <div>
                <PainMapSelector
                  selectedZone={zonaDolor}
                  onSelectZone={(zoneId) => setZonaDolor(zoneId)}
                  painScore={evaDolor}
                />
              </div>

              {/* Injury context */}
              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Mecanismo de Lesión (Origen)</label>
                  <input
                    type="text"
                    value={mecanismoLesion}
                    onChange={(e) => setMecanismoLesion(e.target.value)}
                    placeholder="ej: Trauma rotacional de rodilla en futbol, caída"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Diagnóstico Médico / Referencia</label>
                  <input
                    type="text"
                    value={diagnosticoMedico}
                    onChange={(e) => setDiagnosticoMedico(e.target.value)}
                    placeholder="ej: Rotura parcial ligamento colateral medial"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Tipo de Dolor</label>
                    <select
                      value={tipoDolor}
                      onChange={(e) => setTipoDolor(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value="Punzante">Punzante</option>
                      <option value="Opresivo">Opresivo</option>
                      <option value="Quemante">Quemante</option>
                      <option value="Sordo y Difuso">Sordo y Difuso</option>
                      <option value="Irradiado">Irradiado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Intensidad EVA (0-10)</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={evaDolor}
                      onChange={(e) => setEvaDolor(parseInt(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Factores Agravantes</label>
                  <input
                    type="text"
                    value={factoresAgravantes}
                    onChange={(e) => setFactoresAgravantes(e.target.value)}
                    placeholder="ej: Estar de pie, subir gradas"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Factores Atenuantes</label>
                  <input
                    type="text"
                    value={factoresAtenuantes}
                    onChange={(e) => setFactoresAtenuantes(e.target.value)}
                    placeholder="ej: Compresa de hielo, acostado"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Physical examination (ROM, Daniels) */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Examen Físico Funcional</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Inspección de Postura</label>
                  <textarea
                    rows={2}
                    value={posturaObservaciones}
                    onChange={(e) => setPosturaObservaciones(e.target.value)}
                    placeholder="ej: Desviación pélvica lateral, retracción..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Hallazgos de Palpación</label>
                  <textarea
                    rows={2}
                    value={palpacionHallazgos}
                    onChange={(e) => setPalpacionHallazgos(e.target.value)}
                    placeholder="ej: Puntos gatillo activos en cuadrado lumbar..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Rangos Articulares (ROM)</label>
                  <input
                    type="text"
                    value={romMedido}
                    onChange={(e) => setRomMedido(e.target.value)}
                    placeholder="ej: Flexión de cadera activa 80°"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Fuerza Escala Daniels (0-5)</label>
                  <input
                    type="text"
                    value={fuerzaDaniels}
                    onChange={(e) => setFuerzaDaniels(e.target.value)}
                    placeholder="ej: 4/5 en cuádriceps derecho"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Pruebas Ortopédicas Especiales</label>
                  <input
                    type="text"
                    value={pruebasEspeciales}
                    onChange={(e) => setPruebasEspeciales(e.target.value)}
                    placeholder="ej: Test de Phalen (+), Signo de Lachman (-)"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Prescribed physiotherapy interventions */}
            <div className="bg-teal-50/20 p-4 rounded-xl border border-teal-100 space-y-3">
              <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">Prescripción e Intervenciones</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Agentes Físicos (TENS, Ultrasonido...)</label>
                  <input
                    type="text"
                    value={agentesFisicos}
                    onChange={(e) => setAgentesFisicos(e.target.value)}
                    placeholder="ej: TENS convencional 100Hz, crioterapia"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Terapia Manual Aplicada</label>
                  <input
                    type="text"
                    value={terapiaManual}
                    onChange={(e) => setTerapiaManual(e.target.value)}
                    placeholder="ej: Masaje de descarga miofascial"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Ejercicio Terapéutico Recetado</label>
                  <input
                    type="text"
                    value={ejercicioTerapeutico}
                    onChange={(e) => setEjercicioTerapeutico(e.target.value)}
                    placeholder="ej: Protocolo de McKenzie, estiramiento isquiotibiales"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="w-48">
                <label className="block text-slate-600 font-semibold mb-1">Sesiones sugeridas para el ciclo</label>
                <input
                  type="number"
                  value={sesionesSugeridas}
                  onChange={(e) => setSesionesSugeridas(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            {/* SOAP Clinical evolution note */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">Nota de Evolución Clínica Diaria (Estándar SOAP)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">S (Subjetivo): Reporte del paciente</label>
                  <textarea
                    rows={2}
                    value={soapSubjetivo}
                    onChange={(e) => setSoapSubjetivo(e.target.value)}
                    placeholder="Paciente reporta dolor punzante en hombro izquierdo antes de empezar..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">O (Objetivo): Mediciones de hoy</label>
                  <textarea
                    rows={2}
                    value={soapObjetivo}
                    onChange={(e) => setSoapObjetivo(e.target.value)}
                    placeholder="Se mide flexión activa de hombro a 100° sin dolor, espasmo leve paravertebral..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">A (Análisis): Conclusión de la sesión</label>
                  <textarea
                    rows={2}
                    value={soapAnalisis}
                    onChange={(e) => setSoapAnalisis(e.target.value)}
                    placeholder="Respuesta favorable al estiramiento balístico, mejora de dolor post termoterapia..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">P (Plan): Tareas y siguiente sesión</label>
                  <textarea
                    rows={2}
                    value={soapPlan}
                    onChange={(e) => setSoapPlan(e.target.value)}
                    placeholder="Continuar con estiramientos cada 4 horas en casa. Próxima cita lunes..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* General annotations */}
        <div className="border-t border-slate-100 pt-4">
          <label className="block text-slate-600 font-bold mb-1">Observaciones Generales y Recomendaciones al Paciente</label>
          <textarea
            rows={2}
            value={anotaciones}
            onChange={(e) => setAnotaciones(e.target.value)}
            placeholder="Consejos extras que saldrán en el reporte final..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Action triggers */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-xl"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="text-white font-semibold px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
          style={{ backgroundColor: themeColor }}
        >
          <Save className="w-4 h-4" />
          Guardar Consulta y Reporte
        </button>
      </div>
    </form>
  );
}
