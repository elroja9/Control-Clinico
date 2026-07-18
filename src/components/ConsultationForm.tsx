import React, { useState, useEffect } from 'react';
import { Patient, Consultation } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, RefreshCw, Dumbbell, ChevronRight } from 'lucide-react';
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

  // Advanced Anthropometric
  const [cMuneca, setCMuneca] = useState(16);
  const [pctGrasaBalanza, setPctGrasaBalanza] = useState(22);
  const [pctAgua, setPctAgua] = useState(55);
  const [kgMagros, setKgMagros] = useState(58.5);
  const [tmb, setTmb] = useState(1650);
  const [edadMetabolica, setEdadMetabolica] = useState(30);
  const [pliegueTriceps, setPliegueTriceps] = useState(12);
  const [pliegueSubescapular, setPliegueSubescapular] = useState(15);
  const [pliegueBiceps, setPliegueBiceps] = useState(6);
  const [pliegueCrestaIliaca, setPliegueCrestaIliaca] = useState(18);
  const [pliegueSupraespinal, setPliegueSupraespinal] = useState(14);
  const [pliegueAbdominal, setPliegueAbdominal] = useState(22);
  const [pliegueMusloMedio, setPliegueMusloMedio] = useState(16);
  const [plieguePiernaMedial, setPlieguePiernaMedial] = useState(10);
  const [perimetroBrazoRelajado, setPerimetroBrazoRelajado] = useState(30);
  const [perimetroBrazoContraido, setPerimetroBrazoContraido] = useState(32);

  // Biochemical
  const [indiceHoma, setIndiceHoma] = useState(1.5);
  const [hb1ac, setHb1ac] = useState(5.4);
  const [vitD, setVitD] = useState(32);
  const [glicemia, setGlicemia] = useState(90);
  const [insulinemia, setInsulinemia] = useState(6.5);
  const [hematocrito, setHematocrito] = useState(42);
  const [hemoglobina, setHemoglobina] = useState(14);
  const [albumina, setAlbumina] = useState(4.2);
  const [acidoUrico, setAcidoUrico] = useState(5.0);
  const [trigliceridos, setTrigliceridos] = useState(120);
  const [colesterolTotal, setColesterolTotal] = useState(180);
  const [colesterolHdl, setColesterolHdl] = useState(55);
  const [colesterolLdl, setColesterolLdl] = useState(101);
  const [intolerancias, setIntolerancias] = useState('');
  const [alergiasNutri, setAlergiasNutri] = useState('');

  // Dietetic
  const [tiemposComida, setTiemposComida] = useState<'1-2' | '3-4' | '5-6'>('3-4');
  const [lugarConsumo, setLugarConsumo] = useState<'Casa' | 'Fuera' | 'Ambos'>('Casa');
  const [quienPrepara, setQuienPrepara] = useState('');
  const [calificacionApetito, setCalificacionApetito] = useState<'Bueno' | 'Regular' | 'Malo'>('Bueno');
  const [tipoGrasas, setTipoGrasas] = useState('');
  const [coccionAsado, setCoccionAsado] = useState(false);
  const [coccionFritura, setCoccionFritura] = useState(false);
  const [coccionHervido, setCoccionHervido] = useState(false);
  const [coccionPlancha, setCoccionPlancha] = useState(false);
  const [coccionVapor, setCoccionVapor] = useState(false);
  const [coccionFreidoraAire, setCoccionFreidoraAire] = useState(false);
  const [agregaSal, setAgregaSal] = useState(false);
  const [consumeAzucar, setConsumeAzucar] = useState(false);
  const [utilizaEdulcorante, setUtilizaEdulcorante] = useState(false);
  const [dietasAnteriores, setDietasAnteriores] = useState('');
  const [consumeAgua, setConsumeAgua] = useState(false);
  const [cantidadAgua, setCantidadAgua] = useState('');
  const [alimentosNoConsume, setAlimentosNoConsume] = useState('');
  const [alimentosPreferidos, setAlimentosPreferidos] = useState('');

  // Segmented Body Composition
  const [grasaTotal, setGrasaTotal] = useState(22);
  const [grasaManoIzq, setGrasaManoIzq] = useState(15);
  const [grasaManoDer, setGrasaManoDer] = useState(15);
  const [grasaPiernaIzq, setGrasaPiernaIzq] = useState(24);
  const [grasaPiernaDer, setGrasaPiernaDer] = useState(24);
  const [grasaTronco, setGrasaTronco] = useState(21);
  const [grasaCalificacion, setGrasaCalificacion] = useState('Normal');

  const [musculoTotal, setMusculoTotal] = useState(55);
  const [musculoManoIzq, setMusculoManoIzq] = useState(3.2);
  const [musculoManoDer, setMusculoManoDer] = useState(3.4);
  const [musculoPiernaIzq, setMusculoPiernaIzq] = useState(9.1);
  const [musculoPiernaDer, setMusculoPiernaDer] = useState(9.3);
  const [musculoTronco, setMusculoTronco] = useState(25);

  // Lifestyle
  const [realizaEjercicio, setRealizaEjercicio] = useState(false);
  const [tiempoEntrenar, setTiempoEntrenar] = useState('');
  const [haceCuantoEntrena, setHaceCuantoEntrena] = useState('');
  const [horaEntreno, setHoraEntreno] = useState('');
  const [tipoEjercicio, setTipoEjercicio] = useState('');
  const [frecuenciaEjercicioSemana, setFrecuenciaEjercicioSemana] = useState('');
  const [duracionEjercicio, setDuracionEjercicio] = useState('');
  const [suplementos, setSuplementos] = useState('');
  const [consumeAlcohol, setConsumeAlcohol] = useState(false);
  const [tipoAlcohol, setTipoAlcohol] = useState('');
  const [frecuenciaAlcohol, setFrecuenciaAlcohol] = useState('');
  const [cantidadAlcohol, setCantidadAlcohol] = useState('');
  const [fuma, setFuma] = useState(false);
  const [frecuenciaFumado, setFrecuenciaFumado] = useState('');
  const [cantidadFumado, setCantidadFumado] = useState('');

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
        },
        evaluacionAntropometrica: {
          peso,
          talla,
          imc: calculatedImc,
          c_muneca: cMuneca,
          porcentaje_grasa_balanza: pctGrasaBalanza,
          grasa_visceral: grasaVisc,
          porcentaje_agua: pctAgua,
          masa_muscular: musculo,
          kg_magros: kgMagros,
          masa_osea: osea,
          tmb,
          edad_metabolica: edadMetabolica,
          cintura,
          circunferencia_abdominal: abdominal,
          pliegue_triceps: pliegueTriceps,
          pliegue_subescapular: pliegueSubescapular,
          pliegue_biceps: pliegueBiceps,
          pliegue_cresta_iliaca: pliegueCrestaIliaca,
          pliegue_supraespinal: pliegueSupraespinal,
          pliegue_abdominal: pliegueAbdominal,
          pliegue_muslo_medio: pliegueMusloMedio,
          pliegue_pierna_medial: plieguePiernaMedial,
          perimetro_brazo_relajado: perimetroBrazoRelajado,
          perimetro_brazo_contraido: perimetroBrazoContraido
        },
        evaluacionBioquimica: {
          indice_homa: indiceHoma,
          hb1ac_glicosilada: hb1ac,
          vit_d: vitD,
          glicemia,
          insulinemia,
          hematocrito,
          hemoglobina,
          albumina,
          acido_urico: acidoUrico,
          trigliceridos,
          colesterol_total: colesterolTotal,
          colesterol_hdl: colesterolHdl,
          colesterol_ldl: colesterolLdl,
          intolerancias_alimentarias: intolerancias,
          alergias: alergiasNutri
        },
        evaluacionDietetica: {
          tiempos_comida: tiemposComida,
          lugar_consumo: lugarConsumo,
          quien_prepara: quienPrepara,
          calificacion_apetito: calificacionApetito,
          tipo_grasas: tipoGrasas,
          coccion_asado: coccionAsado,
          coccion_fritura: coccionFritura,
          coccion_hervido: coccionHervido,
          coccion_plancha: coccionPlancha,
          coccion_vapor: coccionVapor,
          coccion_freidora_aire: coccionFreidoraAire,
          agrega_sal: agregaSal,
          consume_azucar: consumeAzucar,
          utiliza_edulcorante: utilizaEdulcorante,
          dietas_anteriores: dietasAnteriores,
          consume_agua: consumeAgua,
          cantidad_agua: cantidadAgua,
          alimentos_no_consume: alimentosNoConsume,
          alimentos_preferidos: alimentosPreferidos
        },
        composicionSegmentada: {
          grasa: {
            total: grasaTotal,
            mano_izquierda: grasaManoIzq,
            mano_derecha: grasaManoDer,
            pierna_derecha: grasaPiernaDer,
            pierna_izquierda: grasaPiernaIzq,
            tronco: grasaTronco,
            calificacion_grasa: grasaCalificacion
          },
          musculo: {
            total: musculoTotal,
            mano_izquierda: musculoManoIzq,
            mano_derecha: musculoManoDer,
            pierna_derecha: musculoPiernaDer,
            pierna_izquierda: musculoPiernaIzq,
            tronco: musculoTronco
          }
        },
        estiloVida: {
          realiza_ejercicio: realizaEjercicio,
          tiempo_entrenar: tiempoEntrenar,
          hace_cuanto_entrena: haceCuantoEntrena,
          hora_entreno: horaEntreno,
          tipo_ejercicio: tipoEjercicio,
          frecuencia_ejercicio_semana: frecuenciaEjercicioSemana,
          duracion_ejercicio: duracionEjercicio,
          suplementos,
          consume_alcohol: consumeAlcohol,
          tipo_alcohol: tipoAlcohol,
          frecuencia_alcohol: frecuenciaAlcohol,
          cantidad_alcohol: cantidadAlcohol,
          fuma,
          frecuencia_fumado: frecuenciaFumado,
          cantidad_fumado: cantidadFumado
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
            {/* Accordion 1: Antropometria General y Basal */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45" open>
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" />
                  <span>Antropometría General y Valores Basales</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={peso}
                    onChange={(e) => setPeso(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Estatura / Talla (cm)</label>
                  <input
                    type="number"
                    value={talla}
                    onChange={(e) => setTalla(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">IMC Calculado</label>
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-extrabold flex justify-between items-center">
                    <span>{calculatedImc}</span>
                    <span className="text-[9px] bg-slate-200 text-slate-800 px-1 rounded-sm">
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
                    onChange={(e) => setGrasaCorp(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Grasa Visceral (Nivel)</label>
                  <input
                    type="number"
                    value={grasaVisc}
                    onChange={(e) => setGrasaVisc(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Masa Muscular (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={musculo}
                    onChange={(e) => setMusculo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Cintura (cm)</label>
                  <input
                    type="number"
                    value={cintura}
                    onChange={(e) => setCintura(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Abdominal (cm)</label>
                  <input
                    type="number"
                    value={abdominal}
                    onChange={(e) => setAbdominal(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Circunferencia Muñeca (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cMuneca}
                    onChange={(e) => setCMuneca(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Grasa Balanza (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pctGrasaBalanza}
                    onChange={(e) => setPctGrasaBalanza(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Porcentaje Agua (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pctAgua}
                    onChange={(e) => setPctAgua(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Kilogramos Magros (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={kgMagros}
                    onChange={(e) => setKgMagros(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Masa Ósea (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={osea}
                    onChange={(e) => setOsea(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">TMB (Kcal/día)</label>
                  <input
                    type="number"
                    value={tmb}
                    onChange={(e) => setTmb(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Edad Metabólica (Años)</label>
                  <input
                    type="number"
                    value={edadMetabolica}
                    onChange={(e) => setEdadMetabolica(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
              </div>
            </details>

            {/* Accordion 2: Pliegues y Perimetros */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Pliegues Cutáneos y Perímetros (Calibrador)</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Tríceps (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueTriceps}
                      onChange={(e) => setPliegueTriceps(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Subescapular (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueSubescapular}
                      onChange={(e) => setPliegueSubescapular(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Bíceps (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueBiceps}
                      onChange={(e) => setPliegueBiceps(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Cresta Ilíaca (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueCrestaIliaca}
                      onChange={(e) => setPliegueCrestaIliaca(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Supraespinal (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueSupraespinal}
                      onChange={(e) => setPliegueSupraespinal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Abdominal (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueAbdominal}
                      onChange={(e) => setPliegueAbdominal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Muslo Medio (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pliegueMusloMedio}
                      onChange={(e) => setPliegueMusloMedio(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Pliegue Pierna Medial (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={plieguePiernaMedial}
                      onChange={(e) => setPlieguePiernaMedial(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Perímetro Brazo Relajado (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={perimetroBrazoRelajado}
                      onChange={(e) => setPerimetroBrazoRelajado(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Perímetro Brazo Contraído / Flexionado (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={perimetroBrazoContraido}
                      onChange={(e) => setPerimetroBrazoContraido(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 3: Composicion Corporal Segmentada */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span>Composición Corporal Segmentada (Brazos, Piernas, Tronco)</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                {/* Segmento Grasa */}
                <div className="bg-rose-50/20 p-3 rounded-lg border border-rose-100/50">
                  <h5 className="font-bold text-rose-800 mb-2.5">Distribución de Grasa Segmentada</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Grasa Total (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaTotal}
                        onChange={(e) => setGrasaTotal(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Mano Izquierda (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaManoIzq}
                        onChange={(e) => setGrasaManoIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Mano Derecha (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaManoDer}
                        onChange={(e) => setGrasaManoDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Pierna Izquierda (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaPiernaIzq}
                        onChange={(e) => setGrasaPiernaIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Pierna Derecha (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaPiernaDer}
                        onChange={(e) => setGrasaPiernaDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Tronco (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={grasaTronco}
                        onChange={(e) => setGrasaTronco(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                  <div className="mt-3 w-48">
                    <label className="block text-slate-600 text-[11px] mb-1">Calificación de Grasa</label>
                    <input
                      type="text"
                      value={grasaCalificacion}
                      onChange={(e) => setGrasaCalificacion(e.target.value)}
                      placeholder="Normal / Elevada / Baja"
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                    />
                  </div>
                </div>

                {/* Segmento Musculo */}
                <div className="bg-blue-50/20 p-3 rounded-lg border border-blue-100/50">
                  <h5 className="font-bold text-blue-800 mb-2.5">Distribución de Músculo Segmentado</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Músculo Total (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoTotal}
                        onChange={(e) => setMusculoTotal(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Mano Izquierda (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoManoIzq}
                        onChange={(e) => setMusculoManoIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Mano Derecha (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoManoDer}
                        onChange={(e) => setMusculoManoDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Pierna Izquierda (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoPiernaIzq}
                        onChange={(e) => setMusculoPiernaIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Pierna Derecha (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoPiernaDer}
                        onChange={(e) => setMusculoPiernaDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1">Tronco (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={musculoTronco}
                        onChange={(e) => setMusculoTronco(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 4: Evaluacion Bioquimica */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-blue-500" />
                  <span>Evaluación Bioquímica (Exámenes de Laboratorio)</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Glicemia (mg/dL)</label>
                    <input
                      type="number"
                      value={glicemia}
                      onChange={(e) => setGlicemia(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Insulinemia (µUI/mL)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={insulinemia}
                      onChange={(e) => setInsulinemia(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Índice HOMA-IR</label>
                    <input
                      type="number"
                      step="0.1"
                      value={indiceHoma}
                      onChange={(e) => setIndiceHoma(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">HbA1c Glicosilada (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={hb1ac}
                      onChange={(e) => setHb1ac(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Vitamina D (ng/mL)</label>
                    <input
                      type="number"
                      value={vitD}
                      onChange={(e) => setVitD(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Hemoglobina (g/dL)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={hemoglobina}
                      onChange={(e) => setHemoglobina(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Hematocrito (%)</label>
                    <input
                      type="number"
                      value={hematocrito}
                      onChange={(e) => setHematocrito(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Albúmina (g/dL)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={albumina}
                      onChange={(e) => setAlbumina(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Ácido Úrico (mg/dL)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={acidoUrico}
                      onChange={(e) => setAcidoUrico(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Triglicéridos (mg/dL)</label>
                    <input
                      type="number"
                      value={trigliceridos}
                      onChange={(e) => setTrigliceridos(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Colesterol Total (mg/dL)</label>
                    <input
                      type="number"
                      value={colesterolTotal}
                      onChange={(e) => setColesterolTotal(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Colesterol HDL (mg/dL)</label>
                    <input
                      type="number"
                      value={colesterolHdl}
                      onChange={(e) => setColesterolHdl(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Colesterol LDL (mg/dL)</label>
                    <input
                      type="number"
                      value={colesterolLdl}
                      onChange={(e) => setColesterolLdl(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                  <div>
                    <label className="block text-slate-600 text-xs mb-1 font-semibold">Intolerancias Alimentarias</label>
                    <input
                      type="text"
                      value={intolerancias}
                      onChange={(e) => setIntolerancias(e.target.value)}
                      placeholder="ej: Intolerancia severa a la lactosa, fructosa"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1 font-semibold">Alergias Clínicas</label>
                    <input
                      type="text"
                      value={alergiasNutri}
                      onChange={(e) => setAlergiasNutri(e.target.value)}
                      placeholder="ej: Alergia al gluten, mariscos"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 5: Evaluacion Dietetica */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-emerald-500" />
                  <span>Evaluación Dietética & Hábitos de Consumo Diario</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tiempos de comida al día</label>
                    <select
                      value={tiemposComida}
                      onChange={(e) => setTiemposComida(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="1-2">1 a 2 tiempos</option>
                      <option value="3-4">3 a 4 tiempos (Recomendado)</option>
                      <option value="5-6">5 a 6 tiempos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Lugar de Consumo Habitual</label>
                    <select
                      value={lugarConsumo}
                      onChange={(e) => setLugarConsumo(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="Casa">En Casa</option>
                      <option value="Fuera">Fuera de Casa (Restaurantes/Oficina)</option>
                      <option value="Ambos">Ambos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">¿Quién prepara los alimentos?</label>
                    <input
                      type="text"
                      value={quienPrepara}
                      onChange={(e) => setQuienPrepara(e.target.value)}
                      placeholder="ej: El mismo paciente / Pareja / Madre"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Calificación del Apetito</label>
                    <select
                      value={calificacionApetito}
                      onChange={(e) => setCalificacionApetito(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold"
                    >
                      <option value="Bueno">Bueno (Estable/Normal)</option>
                      <option value="Regular">Regular</option>
                      <option value="Malo">Malo / Ansiedad elevada / Inapetente</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-100/60 p-3 rounded-lg border border-slate-200/50 space-y-3">
                  <span className="font-bold text-slate-700 block">Métodos de Cocción Frecuentes y Condimentos</span>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionAsado}
                        onChange={(e) => setCoccionAsado(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Asado</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionFritura}
                        onChange={(e) => setCoccionFritura(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Fritura</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionHervido}
                        onChange={(e) => setCoccionHervido(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Hervido</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionPlancha}
                        onChange={(e) => setCoccionPlancha(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>A la Plancha</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionVapor}
                        onChange={(e) => setCoccionVapor(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Al Vapor</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionFreidoraAire}
                        onChange={(e) => setCoccionFreidoraAire(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Air Fryer</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200/50 pt-2.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agregaSal}
                        onChange={(e) => setAgregaSal(e.target.checked)}
                        className="rounded text-emerald-600 w-3.5 h-3.5"
                      />
                      <span>¿Agrega sal adicional en la mesa?</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consumeAzucar}
                        onChange={(e) => setConsumeAzucar(e.target.checked)}
                        className="rounded text-emerald-600 w-3.5 h-3.5"
                      />
                      <span>¿Consume azúcar refinada?</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={utilizaEdulcorante}
                        onChange={(e) => setUtilizaEdulcorante(e.target.checked)}
                        className="rounded text-emerald-600 w-3.5 h-3.5"
                      />
                      <span>¿Utiliza edulcorantes (stevia/splenda)?</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tipo de grasas preferidas para cocinar</label>
                    <input
                      type="text"
                      value={tipoGrasas}
                      onChange={(e) => setTipoGrasas(e.target.value)}
                      placeholder="ej: Aceite de oliva, manteca de cerdo, aceite de girasol"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Experiencia con Dietas Anteriores</label>
                    <input
                      type="text"
                      value={dietasAnteriores}
                      onChange={(e) => setDietasAnteriores(e.target.value)}
                      placeholder="ej: Hizo keto con rebote / Dieta hipocalórica hace un año"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/50">
                  <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={consumeAgua}
                        onChange={(e) => setConsumeAgua(e.target.checked)}
                        className="rounded text-emerald-600 w-3.5 h-3.5"
                      />
                      <span>¿Lleva control de consumo de agua?</span>
                    </label>
                    {consumeAgua && (
                      <input
                        type="text"
                        value={cantidadAgua}
                        onChange={(e) => setCantidadAgua(e.target.value)}
                        placeholder="ej: 2.5 litros por día"
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs w-48 font-bold"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Alimentos que NO consume (Rechazo/Aversión)</label>
                    <textarea
                      rows={2}
                      value={alimentosNoConsume}
                      onChange={(e) => setAlimentosNoConsume(e.target.value)}
                      placeholder="ej: No le gusta la cebolla picada, hígado, remolacha"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Alimentos Preferidos (Apetencia)</label>
                    <textarea
                      rows={2}
                      value={alimentosPreferidos}
                      onChange={(e) => setAlimentosPreferidos(e.target.value)}
                      placeholder="ej: Le encanta el aguacate, pollo, batidos verdes"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 6: Estilo de Vida y Ejercicio */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Estilo de Vida, Ejercicio & Hábitos Nocivos</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                {/* Bloque Actividad Fisica */}
                <div className="bg-slate-100/40 p-3 rounded-lg border border-slate-200/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={realizaEjercicio}
                      onChange={(e) => setRealizaEjercicio(e.target.checked)}
                      className="rounded text-amber-600 w-4 h-4 cursor-pointer"
                      id="realizaEjercicio"
                    />
                    <label htmlFor="realizaEjercicio" className="font-bold text-slate-700 cursor-pointer">
                      ¿Realiza ejercicio físico estructurado?
                    </label>
                  </div>

                  {realizaEjercicio && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div>
                        <label className="block text-slate-600 text-[11px] mb-1">Tipo de Ejercicio</label>
                        <input
                          type="text"
                          value={tipoEjercicio}
                          onChange={(e) => setTipoEjercicio(e.target.value)}
                          placeholder="ej: Funcional, Crossfit, Correr"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] mb-1">Frecuencia Semanal</label>
                        <input
                          type="text"
                          value={frecuenciaEjercicioSemana}
                          onChange={(e) => setFrecuenciaEjercicioSemana(e.target.value)}
                          placeholder="ej: 3 veces por semana"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] mb-1">Duración (Sesión)</label>
                        <input
                          type="text"
                          value={duracionEjercicio}
                          onChange={(e) => setDuracionEjercicio(e.target.value)}
                          placeholder="ej: 1 hora"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] mb-1">Hora del Entreno</label>
                        <input
                          type="text"
                          value={horaEntreno}
                          onChange={(e) => setHoraEntreno(e.target.value)}
                          placeholder="ej: 6:00 AM / Noches"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] mb-1">Tiempo de Entrenar (Meses/Años)</label>
                        <input
                          type="text"
                          value={tiempoEntrenar}
                          onChange={(e) => setTiempoEntrenar(e.target.value)}
                          placeholder="ej: Hace 6 meses"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Suplementos */}
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Suplementos deportivos o nutricionales consumidos</label>
                  <input
                    type="text"
                    value={suplementos}
                    onChange={(e) => setSuplementos(e.target.value)}
                    placeholder="ej: Proteína whey, Creatina monohidratada, Magnesio citrate"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>

                {/* Alcohol y Fumar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* Alcohol */}
                  <div className="bg-amber-50/15 p-3 rounded-lg border border-amber-200/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consumeAlcohol}
                        onChange={(e) => setConsumeAlcohol(e.target.checked)}
                        className="rounded text-amber-700 w-3.5 h-3.5"
                        id="consumeAlcohol"
                      />
                      <label htmlFor="consumeAlcohol" className="font-bold text-slate-700">Consumo de Alcohol</label>
                    </div>
                    {consumeAlcohol && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-slate-500">Tipo</label>
                          <input
                            type="text"
                            value={tipoAlcohol}
                            onChange={(e) => setTipoAlcohol(e.target.value)}
                            placeholder="Cerveza / Vino"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Frecuencia</label>
                          <input
                            type="text"
                            value={frecuenciaAlcohol}
                            onChange={(e) => setFrecuenciaAlcohol(e.target.value)}
                            placeholder="Fines de semana"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Cantidad</label>
                          <input
                            type="text"
                            value={cantidadAlcohol}
                            onChange={(e) => setCantidadAlcohol(e.target.value)}
                            placeholder="2 vasos"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Smoking */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={fuma}
                        onChange={(e) => setFuma(e.target.checked)}
                        className="rounded text-slate-700 w-3.5 h-3.5"
                        id="fuma"
                      />
                      <label htmlFor="fuma" className="font-bold text-slate-700">Tabaquismo / Fumado</label>
                    </div>
                    {fuma && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-slate-500">Frecuencia</label>
                          <input
                            type="text"
                            value={frecuenciaFumado}
                            onChange={(e) => setFrecuenciaFumado(e.target.value)}
                            placeholder="Diario / Social"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Cantidad</label>
                          <input
                            type="text"
                            value={cantidadFumado}
                            onChange={(e) => setCantidadFumado(e.target.value)}
                            placeholder="3 cigarrillos al día"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 7: Dieta de Recetas e IA */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>Diseño del Menú Semanal & Generador de Recetas con IA</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-emerald-50/30 p-3 rounded-lg border border-emerald-100/50">
                  <div className="text-xs">
                    <span className="font-bold text-slate-700 block">¿Deseas ayuda clínica con Inteligencia Artificial?</span>
                    <span className="text-slate-500 text-[10.5px]">Genera recetas personalizadas adaptadas a Costa Rica (ingredientes locales, gallo pinto ligero, chayote, queso tierno).</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiPrescribeNutrition}
                    disabled={isAiGenerating}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-1.5 px-3 rounded-lg shadow-md transition-all flex items-center gap-1.5 shrink-0 self-end sm:self-auto"
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
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 w-56">
                    <label className="block text-slate-600 font-bold mb-1">Presupuesto Calórico Diario (kcal)</label>
                    <input
                      type="number"
                      value={calorias}
                      onChange={(e) => setCalorias(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-3 bg-teal-50/20 p-4 rounded-xl border border-teal-100 text-xs">
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
                      placeholder="ej: Casado ligero con pechuga de pollo a la plancha, frijoles negros y ensalada"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Cena Ligera</label>
                    <textarea
                      rows={2}
                      value={cena}
                      onChange={(e) => setCena(e.target.value)}
                      placeholder="ej: Fajitas de pescado con pimientos y tortillas de maíz"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Indicaciones Clínicas Adicionales</label>
                    <textarea
                      rows={2}
                      value={indicacionesDieta}
                      onChange={(e) => setIndicacionesDieta(e.target.value)}
                      placeholder="ej: Tomar abundante agua, evitar salsas pesadas, masticar bien..."
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            </details>
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
