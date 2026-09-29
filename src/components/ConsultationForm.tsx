import React, { useState, useEffect, useRef } from 'react';
import { Patient, Consultation, PorcentajeDieta, PlantillaDieta } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, Dumbbell, ChevronRight, Calculator, TrendingDown, TrendingUp, Minus, Apple, Check, AlertTriangle } from 'lucide-react';
import PainMapSelector from './PainMapSelector';
import { calcularTMB, calcularPromedioSemanal, aplicarPorcentaje, FACTORES_ACTIVIDAD, FormulaTMB, DireccionPrescripcion } from '../utils/calorieFormulas';
import { notify } from './ui/Feedback';

interface ConsultationFormProps {
  patient: Patient;
  editingConsultation: Consultation | null;
  onSave: (consultation: Consultation) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
  porcentajesDieta: PorcentajeDieta[];
  plantillasDieta: PlantillaDieta[];
}

export default function ConsultationForm({ patient, editingConsultation, onSave, onCancel, themeColor, perfilCompania, porcentajesDieta, plantillasDieta }: ConsultationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Ref (not state) because two clicks fired in the same tick both read the same
  // stale `isSubmitting` value before React re-renders — only a ref updates synchronously
  // in time to block the second one. Without this, a double-click created two separate
  // consultation rows (the backend has no way to tell them apart from two real saves).
  const isSubmittingRef = useRef(false);
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

  // Prescripción Calórica (Déficit/Superávit)
  const [formulaSeleccionada, setFormulaSeleccionada] = useState<FormulaTMB | null>(null);
  const [diasDescanso, setDiasDescanso] = useState(7);
  const [diasEntrenamiento, setDiasEntrenamiento] = useState(0);
  const [factorActividadDescanso, setFactorActividadDescanso] = useState<number>(FACTORES_ACTIVIDAD.SEDENTARIO);
  const [factorActividadEntreno, setFactorActividadEntreno] = useState<number>(FACTORES_ACTIVIDAD.LIGERA);
  const [direccionPrescripcion, setDireccionPrescripcion] = useState<DireccionPrescripcion>('DEFICIT');
  const [porcentajePrescripcion, setPorcentajePrescripcion] = useState<number>(0);
  const [tmbRestaurado, setTmbRestaurado] = useState<number | null>(null);
  const [promedioRestaurado, setPromedioRestaurado] = useState<number | null>(null);
  const [macrosCarbohidratosPct, setMacrosCarbohidratosPct] = useState('');
  const [macrosProteinasPct, setMacrosProteinasPct] = useState('');
  const [macrosGrasasPct, setMacrosGrasasPct] = useState('');

  // Mismo patrón que PlantillaDietaManager: individualmente opcional, pero si los 3 tienen
  // valor deben sumar 100 — validado aquí antes de enviar y de nuevo en POST /api/consultations.
  const sumaMacrosPct = (macrosCarbohidratosPct === '' ? 0 : parseInt(macrosCarbohidratosPct) || 0)
    + (macrosProteinasPct === '' ? 0 : parseInt(macrosProteinasPct) || 0)
    + (macrosGrasasPct === '' ? 0 : parseInt(macrosGrasasPct) || 0);
  const todosLosMacrosPctLlenos = macrosCarbohidratosPct !== '' && macrosProteinasPct !== '' && macrosGrasasPct !== '';

  const [prescripcionAplicada, setPrescripcionAplicada] = useState(false);

  const invalidarRestaurado = () => {
    setTmbRestaurado(null);
    setPromedioRestaurado(null);
    setPrescripcionAplicada(false);
  };

  const tmbPorFormula = patient.sexo ? {
    HARRIS_BENEDICT_OBESOS: calcularTMB('HARRIS_BENEDICT_OBESOS', patient.sexo, peso, talla, patient.edad),
    MIFFLIN_ST_JEOR: calcularTMB('MIFFLIN_ST_JEOR', patient.sexo, peso, talla, patient.edad),
    MULLER: calcularTMB('MULLER', patient.sexo, peso, talla, patient.edad),
  } : null;

  const tmbCalculadoEnVivo = formulaSeleccionada && tmbPorFormula ? tmbPorFormula[formulaSeleccionada] : null;
  const tmbSeleccionado = tmbRestaurado ?? tmbCalculadoEnVivo;

  const promedioCalculadoEnVivo = tmbCalculadoEnVivo != null
    ? calcularPromedioSemanal(tmbCalculadoEnVivo, factorActividadDescanso, diasDescanso, factorActividadEntreno, diasEntrenamiento)
    : null;
  const promedioMantenimiento = promedioRestaurado ?? promedioCalculadoEnVivo;

  const prescripcionFinal = promedioMantenimiento != null
    ? aplicarPorcentaje(promedioMantenimiento, direccionPrescripcion, porcentajePrescripcion)
    : null;

  const porcentajesDisponibles = porcentajesDieta.filter(p => p.idCompania === patient.idCompania).map(p => Number(p.porcentaje));
  const porcentajesParaMostrar = porcentajesDisponibles.length > 0 ? [...new Set(porcentajesDisponibles)] : [10, 15, 20];

  const plantillasCoincidentes = prescripcionFinal != null
    ? plantillasDieta.filter(p =>
        p.idCompania === patient.idCompania &&
        p.direccion === direccionPrescripcion &&
        prescripcionFinal >= p.caloriaMin &&
        prescripcionFinal <= p.caloriaMax
      )
    : [];

  const handleAplicarPrescripcion = () => {
    if (tmbSeleccionado == null || prescripcionFinal == null) return;
    setTmb(Math.round(tmbSeleccionado));
    setCalorias(Math.round(prescripcionFinal));
    setPrescripcionAplicada(true);
  };

  const handleAplicarPlantilla = (plantilla: PlantillaDieta) => {
    setDesayuno(plantilla.desayuno);
    setMeriendaMan(plantilla.meriendaManana);
    setAlmuerzo(plantilla.almuerzo);
    setMeriendaTar(plantilla.meriendaTarde);
    setCena(plantilla.cena);
    setIndicacionesDieta(plantilla.indicaciones);
    // Las plantillas ya guardan % de la distribución calórica, igual que estos campos — copia
    // directa, sin conversión.
    setMacrosCarbohidratosPct(plantilla.carbohidratosPct != null ? String(plantilla.carbohidratosPct) : '');
    setMacrosProteinasPct(plantilla.proteinasPct != null ? String(plantilla.proteinasPct) : '');
    setMacrosGrasasPct(plantilla.grasasPct != null ? String(plantilla.grasasPct) : '');
    handleAplicarPrescripcion();
  };

  // Autocompletar con la primera plantilla que coincida, pero solo si el menú sigue en
  // blanco — si ya hay contenido (escrito a mano o restaurado de una consulta guardada), se
  // deja la lista de "Plantillas sugeridas" para que el nutricionista elija reemplazarlo o no.
  const primeraPlantillaCoincidenteId = plantillasCoincidentes.length > 0 ? plantillasCoincidentes[0].id : null;
  useEffect(() => {
    if (primeraPlantillaCoincidenteId == null) return;
    const menuVacio = !desayuno && !meriendaMan && !almuerzo && !meriendaTar && !cena;
    if (!menuVacio) return;
    const plantilla = plantillasDieta.find(p => p.id === primeraPlantillaCoincidenteId);
    if (plantilla) handleAplicarPlantilla(plantilla);
  }, [primeraPlantillaCoincidenteId]);

  // Auto-calculate IMC (talla=0 while the field is still empty would otherwise divide by zero)
  const calculatedImc = talla > 0 ? parseFloat((peso / ((talla / 100) * (talla / 100))).toFixed(1)) : 0;

  useEffect(() => {
    if (!editingConsultation) return;
    const c = editingConsultation;
    const a = c.antropometria;
    const d = c.dieta;
    const ea = c.evaluacionAntropometrica;
    const eb = c.evaluacionBioquimica;
    const ed = c.evaluacionDietetica;
    const cs = c.composicionSegmentada;
    const ev = c.estiloVida;
    const f = c.fisioterapia;

    setTipo(c.tipo);
    setFecha(c.fecha);
    setMotivo(c.motivo);
    setHorasSueno(c.horasSueno);
    setCompromiso(c.compromiso);
    setAnotaciones(c.anotacionesGenerales || '');

    if (a) {
      setPeso(a.peso);
      setTalla(a.talla);
      setGrasaCorp(a.grasaCorporal);
      setGrasaVisc(a.grasaVisceral);
      setMusculo(a.masaMuscular);
      setOsea(a.masaOsea);
      setCintura(a.cintura);
      setAbdominal(a.abdominal);
    }
    if (ea) {
      setCMuneca(ea.c_muneca ?? 16);
      setPctGrasaBalanza(ea.porcentaje_grasa_balanza ?? 22);
      setPctAgua(ea.porcentaje_agua ?? 55);
      setKgMagros(ea.kg_magros ?? 58.5);
      setTmb(ea.tmb ?? 1650);
      setEdadMetabolica(ea.edad_metabolica ?? 30);
      setPliegueTriceps(ea.pliegue_triceps ?? 12);
      setPliegueSubescapular(ea.pliegue_subescapular ?? 15);
      setPliegueBiceps(ea.pliegue_biceps ?? 6);
      setPliegueCrestaIliaca(ea.pliegue_cresta_iliaca ?? 18);
      setPliegueSupraespinal(ea.pliegue_supraespinal ?? 14);
      setPliegueAbdominal(ea.pliegue_abdominal ?? 22);
      setPliegueMusloMedio(ea.pliegue_muslo_medio ?? 16);
      setPlieguePiernaMedial(ea.pliegue_pierna_medial ?? 10);
      setPerimetroBrazoRelajado(ea.perimetro_brazo_relajado ?? 30);
      setPerimetroBrazoContraido(ea.perimetro_brazo_contraido ?? 32);
    }
    if (eb) {
      setIndiceHoma(eb.indice_homa ?? 1.5);
      setHb1ac(eb.hb1ac_glicosilada ?? 5.4);
      setVitD(eb.vit_d ?? 32);
      setGlicemia(eb.glicemia ?? 90);
      setInsulinemia(eb.insulinemia ?? 6.5);
      setHematocrito(eb.hematocrito ?? 42);
      setHemoglobina(eb.hemoglobina ?? 14);
      setAlbumina(eb.albumina ?? 4.2);
      setAcidoUrico(eb.acido_urico ?? 5.0);
      setTrigliceridos(eb.trigliceridos ?? 120);
      setColesterolTotal(eb.colesterol_total ?? 180);
      setColesterolHdl(eb.colesterol_hdl ?? 55);
      setColesterolLdl(eb.colesterol_ldl ?? 101);
      setIntolerancias(eb.intolerancias_alimentarias || '');
      setAlergiasNutri(eb.alergias || '');
    }
    if (ed) {
      setTiemposComida(ed.tiempos_comida ?? '3-4');
      setLugarConsumo(ed.lugar_consumo ?? 'Casa');
      setQuienPrepara(ed.quien_prepara || '');
      setCalificacionApetito(ed.calificacion_apetito ?? 'Bueno');
      setTipoGrasas(ed.tipo_grasas || '');
      setCoccionAsado(ed.coccion_asado ?? false);
      setCoccionFritura(ed.coccion_fritura ?? false);
      setCoccionHervido(ed.coccion_hervido ?? false);
      setCoccionPlancha(ed.coccion_plancha ?? false);
      setCoccionVapor(ed.coccion_vapor ?? false);
      setCoccionFreidoraAire(ed.coccion_freidora_aire ?? false);
      setAgregaSal(ed.agrega_sal ?? false);
      setConsumeAzucar(ed.consume_azucar ?? false);
      setUtilizaEdulcorante(ed.utiliza_edulcorante ?? false);
      setDietasAnteriores(ed.dietas_anteriores || '');
      setConsumeAgua(ed.consume_agua ?? false);
      setCantidadAgua(ed.cantidad_agua || '');
      setAlimentosNoConsume(ed.alimentos_no_consume || '');
      setAlimentosPreferidos(ed.alimentos_preferidos || '');
    }
    if (d) {
      setCalorias(d.totalCalorias);
      setDesayuno(d.desayuno);
      setMeriendaMan(d.meriendaManana);
      setAlmuerzo(d.almuerzo);
      setMeriendaTar(d.meriendaTarde);
      setCena(d.cena);
      setIndicacionesDieta(d.indicaciones);
      if (d.prescripcionCalorica) {
        const pc = d.prescripcionCalorica;
        setFormulaSeleccionada(pc.formula);
        setDiasDescanso(pc.diasDescanso);
        setDiasEntrenamiento(pc.diasEntrenamiento);
        setFactorActividadDescanso(pc.factorActividadDescanso);
        setFactorActividadEntreno(pc.factorActividadEntreno);
        setDireccionPrescripcion(pc.direccion);
        setPorcentajePrescripcion(pc.porcentaje);
        setTmbRestaurado(pc.tmb);
        setPromedioRestaurado(pc.promedioMantenimiento);
      }
      if (d.macros) {
        setMacrosCarbohidratosPct(d.macros.carbohidratosPct != null ? String(d.macros.carbohidratosPct) : '');
        setMacrosProteinasPct(d.macros.proteinasPct != null ? String(d.macros.proteinasPct) : '');
        setMacrosGrasasPct(d.macros.grasasPct != null ? String(d.macros.grasasPct) : '');
      }
    }
    if (cs?.grasa) {
      setGrasaTotal(cs.grasa.total ?? 22);
      setGrasaManoIzq(cs.grasa.mano_izquierda ?? 15);
      setGrasaManoDer(cs.grasa.mano_derecha ?? 15);
      setGrasaPiernaIzq(cs.grasa.pierna_izquierda ?? 24);
      setGrasaPiernaDer(cs.grasa.pierna_derecha ?? 24);
      setGrasaTronco(cs.grasa.tronco ?? 21);
      setGrasaCalificacion(cs.grasa.calificacion_grasa || 'Normal');
    }
    if (cs?.musculo) {
      setMusculoTotal(cs.musculo.total ?? 55);
      setMusculoManoIzq(cs.musculo.mano_izquierda ?? 3.2);
      setMusculoManoDer(cs.musculo.mano_derecha ?? 3.4);
      setMusculoPiernaIzq(cs.musculo.pierna_izquierda ?? 9.1);
      setMusculoPiernaDer(cs.musculo.pierna_derecha ?? 9.3);
      setMusculoTronco(cs.musculo.tronco ?? 25);
    }
    if (ev) {
      setRealizaEjercicio(ev.realiza_ejercicio ?? false);
      setTiempoEntrenar(ev.tiempo_entrenar || '');
      setHaceCuantoEntrena(ev.hace_cuanto_entrena || '');
      setHoraEntreno(ev.hora_entreno || '');
      setTipoEjercicio(ev.tipo_ejercicio || '');
      setFrecuenciaEjercicioSemana(ev.frecuencia_ejercicio_semana || '');
      setDuracionEjercicio(ev.duracion_ejercicio || '');
      setSuplementos(ev.suplementos || '');
      setConsumeAlcohol(ev.consume_alcohol ?? false);
      setTipoAlcohol(ev.tipo_alcohol || '');
      setFrecuenciaAlcohol(ev.frecuencia_alcohol || '');
      setCantidadAlcohol(ev.cantidad_alcohol || '');
      setFuma(ev.fuma ?? false);
      setFrecuenciaFumado(ev.frecuencia_fumado || '');
      setCantidadFumado(ev.cantidad_fumado || '');
    }
    if (f) {
      setMecanismoLesion(f.mecanismoLesion);
      setDiagnosticoMedico(f.diagnosticoMedico);
      setEvaDolor(f.evaDolor);
      setZonaDolor(f.zonaDolor);
      setTipoDolor(f.tipoDolor);
      setFactoresAgravantes(f.factoresAgravantes);
      setFactoresAtenuantes(f.factoresAtenuantes);
      setPosturaObservaciones(f.posturaObservaciones);
      setPalpacionHallazgos(f.palpacionHallazgos);
      setRomMedido(f.romMedido);
      setFuerzaDaniels(f.fuerzaDaniels);
      setPruebasEspeciales(f.pruebasEspeciales);
      setAgentesFisicos(f.agentesFisicos);
      setTerapiaManual(f.terapiaManual);
      setEjercicioTerapeutico(f.ejercicioTerapeutico);
      setSesionesSugeridas(f.sesionesSugeridas);
      setSoapSubjetivo(f.soapSubjetivo);
      setSoapObjetivo(f.soapObjetivo);
      setSoapAnalisis(f.soapAnalisis);
      setSoapPlan(f.soapPlan);
    }
  }, [editingConsultation]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!motivo.trim()) {
      notify.warning("Indique el motivo de la consulta.");
      return;
    }
    if (todosLosMacrosPctLlenos && sumaMacrosPct !== 100) {
      notify.warning("La distribución de macronutrientes (carbohidratos + proteínas + grasas) debe sumar 100% cuando los tres campos tienen valor.");
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const newConsultation: Consultation = {
      id: editingConsultation?.id ?? Date.now(),
      estado: editingConsultation?.estado ?? 'ABIERTA',
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
          indicaciones: indicacionesDieta,
          ...(formulaSeleccionada && tmbSeleccionado != null && promedioMantenimiento != null ? {
            prescripcionCalorica: {
              formula: formulaSeleccionada,
              tmb: tmbSeleccionado,
              diasDescanso,
              diasEntrenamiento,
              factorActividadDescanso,
              factorActividadEntreno,
              promedioMantenimiento,
              direccion: direccionPrescripcion,
              porcentaje: porcentajePrescripcion
            }
          } : {}),
          ...(macrosCarbohidratosPct !== '' || macrosProteinasPct !== '' || macrosGrasasPct !== '' ? {
            macros: {
              carbohidratosPct: macrosCarbohidratosPct === '' ? null : parseInt(macrosCarbohidratosPct),
              proteinasPct: macrosProteinasPct === '' ? null : parseInt(macrosProteinasPct),
              grasasPct: macrosGrasasPct === '' ? null : parseInt(macrosGrasasPct)
            }
          } : {})
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
    <form onSubmit={handleFormSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-clip text-xs sm:text-sm">
      {/* Tab Selector */}
      <div className="surface-dark p-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" style={{ backgroundColor: themeColor }}>
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-5 h-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-bold">{editingConsultation ? 'Editar consulta clínica' : 'Nueva consulta clínica'}</h2>
            <p className="text-xs text-white/90 truncate">{patient.nombreCompleto} · Cédula {patient.identificacion}</p>
          </div>
        </div>
        
        {/* Specialty Selector */}
        {perfilCompania === 'Ambas' ? (
          <div className="flex bg-black/20 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTipo('Nutrición')}
              aria-pressed={tipo === 'Nutrición'}
              className={`min-h-9 px-4 rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 ${
                tipo === 'Nutrición' ? 'bg-white text-slate-900 shadow-sm' : 'text-white hover:bg-white/10'
              }`}
            >
              <Apple className="w-3.5 h-3.5" aria-hidden="true" />
              Nutrición
            </button>
            <button
              type="button"
              onClick={() => setTipo('Fisioterapia')}
              aria-pressed={tipo === 'Fisioterapia'}
              className={`min-h-9 px-4 rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 ${
                tipo === 'Fisioterapia' ? 'bg-white text-slate-900 shadow-sm' : 'text-white hover:bg-white/10'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" />
              Fisioterapia
            </button>
          </div>
        ) : (
          <div className="bg-black/30 px-3.5 py-1.5 rounded-xl text-xs font-bold border border-white/15 shadow-sm">
            <span className="flex items-center gap-1.5">
              Especialidad:
              {tipo === 'Fisioterapia' ? <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> : <Apple className="w-3.5 h-3.5" aria-hidden="true" />}
              {tipo}
            </span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-6">
        
        {/* Core fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="consultati-fecha-de-consulta" className="block text-slate-600 font-bold mb-1">Fecha de Consulta</label>
            <input id="consultati-fecha-de-consulta"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
          <div>
            <label htmlFor="consultati-horas-promedio-de-sueno" className="block text-slate-600 font-bold mb-1">Horas promedio de sueño</label>
            <input id="consultati-horas-promedio-de-sueno"
              type="number"
              step="0.5"
              value={horasSueno}
              onChange={(e) => setHorasSueno(parseFloat(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
          <div>
            <label htmlFor="consultati-motivacion-del-paciente-1" className="block text-slate-600 font-bold mb-1">Motivación del Paciente (1 al 10)</label>
            <input id="consultati-motivacion-del-paciente-1"
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
          <label htmlFor="consultati-motivo-de-la-cita" className="block text-slate-600 font-bold mb-1">Motivo de la Cita *</label>
          <input id="consultati-motivo-de-la-cita"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="consultati-peso-kg" className="block text-slate-600 text-xs mb-1">Peso (kg)</label>
                  <input id="consultati-peso-kg"
                    type="number"
                    step="0.1"
                    value={peso}
                    onChange={(e) => setPeso(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-estatura-talla-cm" className="block text-slate-600 text-xs mb-1">Estatura / Talla (cm)</label>
                  <input id="consultati-estatura-talla-cm"
                    type="number"
                    value={talla}
                    onChange={(e) => setTalla(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-imc-calculado-grasa-corporal" className="block text-slate-600 text-xs mb-1">IMC Calculado</label>
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-extrabold flex justify-between items-center">
                    <span>{calculatedImc}</span>
                    <span className="text-[11px] bg-slate-200 text-slate-800 px-1 rounded-sm">
                      {calculatedImc >= 30 ? 'Obesidad' : calculatedImc >= 25 ? 'Sobrepeso' : 'Normal'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 text-xs mb-1">Grasa Corporal (%)</label>
                  <input id="consultati-imc-calculado-grasa-corporal"
                    type="number"
                    step="0.1"
                    value={grasaCorp}
                    onChange={(e) => setGrasaCorp(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-grasa-visceral-nivel" className="block text-slate-600 text-xs mb-1">Grasa Visceral (Nivel)</label>
                  <input id="consultati-grasa-visceral-nivel"
                    type="number"
                    value={grasaVisc}
                    onChange={(e) => setGrasaVisc(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-masa-muscular-kg" className="block text-slate-600 text-xs mb-1">Masa Muscular (kg)</label>
                  <input id="consultati-masa-muscular-kg"
                    type="number"
                    step="0.1"
                    value={musculo}
                    onChange={(e) => setMusculo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-cintura-cm" className="block text-slate-600 text-xs mb-1">Cintura (cm)</label>
                  <input id="consultati-cintura-cm"
                    type="number"
                    value={cintura}
                    onChange={(e) => setCintura(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-abdominal-cm" className="block text-slate-600 text-xs mb-1">Abdominal (cm)</label>
                  <input id="consultati-abdominal-cm"
                    type="number"
                    value={abdominal}
                    onChange={(e) => setAbdominal(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-circunferencia-muneca-cm" className="block text-slate-600 text-xs mb-1">Circunferencia Muñeca (cm)</label>
                  <input id="consultati-circunferencia-muneca-cm"
                    type="number"
                    step="0.1"
                    value={cMuneca}
                    onChange={(e) => setCMuneca(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-grasa-balanza" className="block text-slate-600 text-xs mb-1">Grasa Balanza (%)</label>
                  <input id="consultati-grasa-balanza"
                    type="number"
                    step="0.1"
                    value={pctGrasaBalanza}
                    onChange={(e) => setPctGrasaBalanza(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-porcentaje-agua" className="block text-slate-600 text-xs mb-1">Porcentaje Agua (%)</label>
                  <input id="consultati-porcentaje-agua"
                    type="number"
                    step="0.1"
                    value={pctAgua}
                    onChange={(e) => setPctAgua(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-kilogramos-magros-kg" className="block text-slate-600 text-xs mb-1">Kilogramos Magros (kg)</label>
                  <input id="consultati-kilogramos-magros-kg"
                    type="number"
                    step="0.1"
                    value={kgMagros}
                    onChange={(e) => setKgMagros(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-masa-osea-kg" className="block text-slate-600 text-xs mb-1">Masa Ósea (kg)</label>
                  <input id="consultati-masa-osea-kg"
                    type="number"
                    step="0.1"
                    value={osea}
                    onChange={(e) => setOsea(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-tmb-kcal-dia" className="block text-slate-600 text-xs mb-1">TMB (Kcal/día)</label>
                  <input id="consultati-tmb-kcal-dia"
                    type="number"
                    value={tmb}
                    onChange={(e) => setTmb(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-edad-metabolica-anos" className="block text-slate-600 text-xs mb-1">Edad Metabólica (Años)</label>
                  <input id="consultati-edad-metabolica-anos"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="consultati-pliegue-triceps-mm" className="block text-slate-600 text-xs mb-1">Pliegue Tríceps (mm)</label>
                    <input id="consultati-pliegue-triceps-mm"
                      type="number"
                      step="0.1"
                      value={pliegueTriceps}
                      onChange={(e) => setPliegueTriceps(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-subescapular-mm" className="block text-slate-600 text-xs mb-1">Pliegue Subescapular (mm)</label>
                    <input id="consultati-pliegue-subescapular-mm"
                      type="number"
                      step="0.1"
                      value={pliegueSubescapular}
                      onChange={(e) => setPliegueSubescapular(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-biceps-mm" className="block text-slate-600 text-xs mb-1">Pliegue Bíceps (mm)</label>
                    <input id="consultati-pliegue-biceps-mm"
                      type="number"
                      step="0.1"
                      value={pliegueBiceps}
                      onChange={(e) => setPliegueBiceps(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-cresta-iliaca-mm" className="block text-slate-600 text-xs mb-1">Pliegue Cresta Ilíaca (mm)</label>
                    <input id="consultati-pliegue-cresta-iliaca-mm"
                      type="number"
                      step="0.1"
                      value={pliegueCrestaIliaca}
                      onChange={(e) => setPliegueCrestaIliaca(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-supraespinal-mm" className="block text-slate-600 text-xs mb-1">Pliegue Supraespinal (mm)</label>
                    <input id="consultati-pliegue-supraespinal-mm"
                      type="number"
                      step="0.1"
                      value={pliegueSupraespinal}
                      onChange={(e) => setPliegueSupraespinal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-abdominal-mm" className="block text-slate-600 text-xs mb-1">Pliegue Abdominal (mm)</label>
                    <input id="consultati-pliegue-abdominal-mm"
                      type="number"
                      step="0.1"
                      value={pliegueAbdominal}
                      onChange={(e) => setPliegueAbdominal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-muslo-medio-mm" className="block text-slate-600 text-xs mb-1">Pliegue Muslo Medio (mm)</label>
                    <input id="consultati-pliegue-muslo-medio-mm"
                      type="number"
                      step="0.1"
                      value={pliegueMusloMedio}
                      onChange={(e) => setPliegueMusloMedio(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-pierna-medial-mm" className="block text-slate-600 text-xs mb-1">Pliegue Pierna Medial (mm)</label>
                    <input id="consultati-pliegue-pierna-medial-mm"
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
                    <label htmlFor="consultati-perimetro-brazo-relajado-cm" className="block text-slate-600 text-xs mb-1">Perímetro Brazo Relajado (cm)</label>
                    <input id="consultati-perimetro-brazo-relajado-cm"
                      type="number"
                      step="0.1"
                      value={perimetroBrazoRelajado}
                      onChange={(e) => setPerimetroBrazoRelajado(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-perimetro-brazo-contraido-flexionado" className="block text-slate-600 text-xs mb-1">Perímetro Brazo Contraído / Flexionado (cm)</label>
                    <input id="consultati-perimetro-brazo-contraido-flexionado"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                {/* Segmento Grasa */}
                <div className="bg-rose-50/20 p-3 rounded-lg border border-rose-100/50">
                  <h5 className="font-bold text-rose-800 mb-2.5">Distribución de Grasa Segmentada</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label htmlFor="consultati-grasa-total" className="block text-slate-600 text-[11px] mb-1">Grasa Total (%)</label>
                      <input id="consultati-grasa-total"
                        type="number"
                        step="0.1"
                        value={grasaTotal}
                        onChange={(e) => setGrasaTotal(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-izquierda" className="block text-slate-600 text-[11px] mb-1">Mano Izquierda (%)</label>
                      <input id="consultati-mano-izquierda"
                        type="number"
                        step="0.1"
                        value={grasaManoIzq}
                        onChange={(e) => setGrasaManoIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-derecha" className="block text-slate-600 text-[11px] mb-1">Mano Derecha (%)</label>
                      <input id="consultati-mano-derecha"
                        type="number"
                        step="0.1"
                        value={grasaManoDer}
                        onChange={(e) => setGrasaManoDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-izquierda" className="block text-slate-600 text-[11px] mb-1">Pierna Izquierda (%)</label>
                      <input id="consultati-pierna-izquierda"
                        type="number"
                        step="0.1"
                        value={grasaPiernaIzq}
                        onChange={(e) => setGrasaPiernaIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-derecha" className="block text-slate-600 text-[11px] mb-1">Pierna Derecha (%)</label>
                      <input id="consultati-pierna-derecha"
                        type="number"
                        step="0.1"
                        value={grasaPiernaDer}
                        onChange={(e) => setGrasaPiernaDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-tronco" className="block text-slate-600 text-[11px] mb-1">Tronco (%)</label>
                      <input id="consultati-tronco"
                        type="number"
                        step="0.1"
                        value={grasaTronco}
                        onChange={(e) => setGrasaTronco(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                  <div className="mt-3 w-48">
                    <label htmlFor="consultati-calificacion-de-grasa" className="block text-slate-600 text-[11px] mb-1">Calificación de Grasa</label>
                    <input id="consultati-calificacion-de-grasa"
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
                      <label htmlFor="consultati-musculo-total-kg" className="block text-slate-600 text-[11px] mb-1">Músculo Total (kg)</label>
                      <input id="consultati-musculo-total-kg"
                        type="number"
                        step="0.1"
                        value={musculoTotal}
                        onChange={(e) => setMusculoTotal(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-izquierda-kg" className="block text-slate-600 text-[11px] mb-1">Mano Izquierda (kg)</label>
                      <input id="consultati-mano-izquierda-kg"
                        type="number"
                        step="0.1"
                        value={musculoManoIzq}
                        onChange={(e) => setMusculoManoIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-derecha-kg" className="block text-slate-600 text-[11px] mb-1">Mano Derecha (kg)</label>
                      <input id="consultati-mano-derecha-kg"
                        type="number"
                        step="0.1"
                        value={musculoManoDer}
                        onChange={(e) => setMusculoManoDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-izquierda-kg" className="block text-slate-600 text-[11px] mb-1">Pierna Izquierda (kg)</label>
                      <input id="consultati-pierna-izquierda-kg"
                        type="number"
                        step="0.1"
                        value={musculoPiernaIzq}
                        onChange={(e) => setMusculoPiernaIzq(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-derecha-kg" className="block text-slate-600 text-[11px] mb-1">Pierna Derecha (kg)</label>
                      <input id="consultati-pierna-derecha-kg"
                        type="number"
                        step="0.1"
                        value={musculoPiernaDer}
                        onChange={(e) => setMusculoPiernaDer(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-tronco-kg" className="block text-slate-600 text-[11px] mb-1">Tronco (kg)</label>
                      <input id="consultati-tronco-kg"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label htmlFor="consultati-glicemia-mg-dl" className="block text-slate-600 text-xs mb-1">Glicemia (mg/dL)</label>
                    <input id="consultati-glicemia-mg-dl"
                      type="number"
                      value={glicemia}
                      onChange={(e) => setGlicemia(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-insulinemia-ui-ml" className="block text-slate-600 text-xs mb-1">Insulinemia (µUI/mL)</label>
                    <input id="consultati-insulinemia-ui-ml"
                      type="number"
                      step="0.1"
                      value={insulinemia}
                      onChange={(e) => setInsulinemia(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-indice-homa-ir" className="block text-slate-600 text-xs mb-1">Índice HOMA-IR</label>
                    <input id="consultati-indice-homa-ir"
                      type="number"
                      step="0.1"
                      value={indiceHoma}
                      onChange={(e) => setIndiceHoma(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hba1c-glicosilada" className="block text-slate-600 text-xs mb-1">HbA1c Glicosilada (%)</label>
                    <input id="consultati-hba1c-glicosilada"
                      type="number"
                      step="0.1"
                      value={hb1ac}
                      onChange={(e) => setHb1ac(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-vitamina-d-ng-ml" className="block text-slate-600 text-xs mb-1">Vitamina D (ng/mL)</label>
                    <input id="consultati-vitamina-d-ng-ml"
                      type="number"
                      value={vitD}
                      onChange={(e) => setVitD(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hemoglobina-g-dl" className="block text-slate-600 text-xs mb-1">Hemoglobina (g/dL)</label>
                    <input id="consultati-hemoglobina-g-dl"
                      type="number"
                      step="0.1"
                      value={hemoglobina}
                      onChange={(e) => setHemoglobina(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hematocrito" className="block text-slate-600 text-xs mb-1">Hematocrito (%)</label>
                    <input id="consultati-hematocrito"
                      type="number"
                      value={hematocrito}
                      onChange={(e) => setHematocrito(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-albumina-g-dl" className="block text-slate-600 text-xs mb-1">Albúmina (g/dL)</label>
                    <input id="consultati-albumina-g-dl"
                      type="number"
                      step="0.1"
                      value={albumina}
                      onChange={(e) => setAlbumina(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-acido-urico-mg-dl" className="block text-slate-600 text-xs mb-1">Ácido Úrico (mg/dL)</label>
                    <input id="consultati-acido-urico-mg-dl"
                      type="number"
                      step="0.1"
                      value={acidoUrico}
                      onChange={(e) => setAcidoUrico(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-trigliceridos-mg-dl" className="block text-slate-600 text-xs mb-1">Triglicéridos (mg/dL)</label>
                    <input id="consultati-trigliceridos-mg-dl"
                      type="number"
                      value={trigliceridos}
                      onChange={(e) => setTrigliceridos(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-total-mg-dl" className="block text-slate-600 text-xs mb-1">Colesterol Total (mg/dL)</label>
                    <input id="consultati-colesterol-total-mg-dl"
                      type="number"
                      value={colesterolTotal}
                      onChange={(e) => setColesterolTotal(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-hdl-mg-dl" className="block text-slate-600 text-xs mb-1">Colesterol HDL (mg/dL)</label>
                    <input id="consultati-colesterol-hdl-mg-dl"
                      type="number"
                      value={colesterolHdl}
                      onChange={(e) => setColesterolHdl(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-ldl-mg-dl" className="block text-slate-600 text-xs mb-1">Colesterol LDL (mg/dL)</label>
                    <input id="consultati-colesterol-ldl-mg-dl"
                      type="number"
                      value={colesterolLdl}
                      onChange={(e) => setColesterolLdl(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                  <div>
                    <label htmlFor="consultati-intolerancias-alimentarias" className="block text-slate-600 text-xs mb-1 font-semibold">Intolerancias Alimentarias</label>
                    <input id="consultati-intolerancias-alimentarias"
                      type="text"
                      value={intolerancias}
                      onChange={(e) => setIntolerancias(e.target.value)}
                      placeholder="ej: Intolerancia severa a la lactosa, fructosa"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-alergias-clinicas" className="block text-slate-600 text-xs mb-1 font-semibold">Alergias Clínicas</label>
                    <input id="consultati-alergias-clinicas"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="consultati-tiempos-de-comida-al" className="block text-slate-600 font-semibold mb-1">Tiempos de comida al día</label>
                    <select id="consultati-tiempos-de-comida-al"
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
                    <label htmlFor="consultati-lugar-de-consumo-habitual" className="block text-slate-600 font-semibold mb-1">Lugar de Consumo Habitual</label>
                    <select id="consultati-lugar-de-consumo-habitual"
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
                    <label htmlFor="consultati-quien-prepara-los-alimentos" className="block text-slate-600 font-semibold mb-1">¿Quién prepara los alimentos?</label>
                    <input id="consultati-quien-prepara-los-alimentos"
                      type="text"
                      value={quienPrepara}
                      onChange={(e) => setQuienPrepara(e.target.value)}
                      placeholder="ej: El mismo paciente / Pareja / Madre"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-calificacion-del-apetito" className="block text-slate-600 font-semibold mb-1">Calificación del Apetito</label>
                    <select id="consultati-calificacion-del-apetito"
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
                    <label htmlFor="consultati-experiencia-con-dietas-anteriores" className="block text-slate-600 font-semibold mb-1">Experiencia con Dietas Anteriores</label>
                    <input id="consultati-experiencia-con-dietas-anteriores"
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
                    <label htmlFor="consultati-alimentos-preferidos-apetencia" className="block text-slate-600 font-semibold mb-1">Alimentos Preferidos (Apetencia)</label>
                    <textarea id="consultati-alimentos-preferidos-apetencia"
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
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
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
                        <label htmlFor="consultati-tipo-de-ejercicio" className="block text-slate-600 text-[11px] mb-1">Tipo de Ejercicio</label>
                        <input id="consultati-tipo-de-ejercicio"
                          type="text"
                          value={tipoEjercicio}
                          onChange={(e) => setTipoEjercicio(e.target.value)}
                          placeholder="ej: Funcional, Crossfit, Correr"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-frecuencia-semanal" className="block text-slate-600 text-[11px] mb-1">Frecuencia Semanal</label>
                        <input id="consultati-frecuencia-semanal"
                          type="text"
                          value={frecuenciaEjercicioSemana}
                          onChange={(e) => setFrecuenciaEjercicioSemana(e.target.value)}
                          placeholder="ej: 3 veces por semana"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-duracion-sesion" className="block text-slate-600 text-[11px] mb-1">Duración (Sesión)</label>
                        <input id="consultati-duracion-sesion"
                          type="text"
                          value={duracionEjercicio}
                          onChange={(e) => setDuracionEjercicio(e.target.value)}
                          placeholder="ej: 1 hora"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-hora-del-entreno" className="block text-slate-600 text-[11px] mb-1">Hora del Entreno</label>
                        <input id="consultati-hora-del-entreno"
                          type="text"
                          value={horaEntreno}
                          onChange={(e) => setHoraEntreno(e.target.value)}
                          placeholder="ej: 6:00 AM / Noches"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-tiempo-de-entrenar-meses" className="block text-slate-600 text-[11px] mb-1">Tiempo de Entrenar (Meses/Años)</label>
                        <input id="consultati-tiempo-de-entrenar-meses"
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
                  <label htmlFor="consultati-suplementos-deportivos-o-nutricionales" className="block text-slate-600 font-semibold mb-1">Suplementos deportivos o nutricionales consumidos</label>
                  <input id="consultati-suplementos-deportivos-o-nutricionales"
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <div>
                          <label htmlFor="consultati-tipo" className="block text-[11px] text-slate-500">Tipo</label>
                          <input id="consultati-tipo"
                            type="text"
                            value={tipoAlcohol}
                            onChange={(e) => setTipoAlcohol(e.target.value)}
                            placeholder="Cerveza / Vino"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-frecuencia" className="block text-[11px] text-slate-500">Frecuencia</label>
                          <input id="consultati-frecuencia"
                            type="text"
                            value={frecuenciaAlcohol}
                            onChange={(e) => setFrecuenciaAlcohol(e.target.value)}
                            placeholder="Fines de semana"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-cantidad" className="block text-[11px] text-slate-500">Cantidad</label>
                          <input id="consultati-cantidad"
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
                          <label htmlFor="consultati-frecuencia-2" className="block text-[11px] text-slate-500">Frecuencia</label>
                          <input id="consultati-frecuencia-2"
                            type="text"
                            value={frecuenciaFumado}
                            onChange={(e) => setFrecuenciaFumado(e.target.value)}
                            placeholder="Diario / Social"
                            className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-cantidad-2" className="block text-[11px] text-slate-500">Cantidad</label>
                          <input id="consultati-cantidad-2"
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

            {/* Accordion 7: Dieta de Recetas */}
            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/45">
              <summary className="flex justify-between items-center font-bold p-3 text-slate-700 bg-white cursor-pointer select-none border-b border-slate-100 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>Diseño del Menú Semanal & Generador de Recetas</span>
                </div>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-slate-500" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2 text-slate-700 font-bold">
                    <Calculator className="w-4 h-4 text-teal-600" />
                    Prescripción Calórica (Déficit/Superávit)
                  </div>

                  {!patient.sexo ? (
                    <p className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                      Complete el sexo del paciente en su ficha para poder calcular la prescripción calórica.
                    </p>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="consultati-1-elija-la-formula" className="block text-slate-600 font-semibold mb-1.5">1. Elija la fórmula de TMB</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(['HARRIS_BENEDICT_OBESOS', 'MIFFLIN_ST_JEOR', 'MULLER'] as FormulaTMB[]).map(f => {
                            const tmbCalculado = tmbPorFormula ? tmbPorFormula[f] : 0;
                            const seleccionada = formulaSeleccionada === f;
                            const etiquetas: Record<FormulaTMB, string> = {
                              HARRIS_BENEDICT_OBESOS: 'Harris Benedict (Obesos)',
                              MIFFLIN_ST_JEOR: 'Mifflin St Jeor',
                              MULLER: 'Müller'
                            };
                            return (
                              <button
                                type="button"
                                key={f}
                                onClick={() => { setFormulaSeleccionada(f); invalidarRestaurado(); }}
                                className={`p-2.5 rounded-lg border text-left ${seleccionada ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                              >
                                <div className="font-semibold text-slate-700">{etiquetas[f]}</div>
                                <div className="text-lg font-black text-slate-800">{Math.round(tmbCalculado)} <span className="text-[11px] font-normal text-slate-500">kcal/día</span></div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {formulaSeleccionada && (
                        <>
                          <label className="block text-slate-600 font-semibold mb-1.5">2. Actividad semanal</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-slate-600 font-semibold mb-1">Días de descanso / semana</label>
                              <input id="consultati-1-elija-la-formula"
                                type="number"
                                min={0}
                                max={7}
                                value={diasDescanso}
                                onChange={(e) => { setDiasDescanso(parseInt(e.target.value) || 0); invalidarRestaurado(); }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              />
                              <select
                                value={factorActividadDescanso}
                                onChange={(e) => { setFactorActividadDescanso(parseFloat(e.target.value)); invalidarRestaurado(); }}
                                className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="consultati-dias-de-entrenamiento-semana" className="block text-slate-600 font-semibold mb-1">Días de entrenamiento / semana</label>
                              <input id="consultati-dias-de-entrenamiento-semana"
                                type="number"
                                min={0}
                                max={7}
                                value={diasEntrenamiento}
                                onChange={(e) => { setDiasEntrenamiento(parseInt(e.target.value) || 0); invalidarRestaurado(); }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              />
                              <select
                                value={factorActividadEntreno}
                                onChange={(e) => { setFactorActividadEntreno(parseFloat(e.target.value)); invalidarRestaurado(); }}
                                className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500">Nota: pacientes de menos de 60kg — se recomienda usar actividad ligera (Solís, L. 2020).</p>

                          {promedioMantenimiento != null && (
                            <p className="text-slate-700 font-semibold">
                              Promedio para mantenimiento: <span className="font-black">{Math.round(promedioMantenimiento)} kcal/día</span>
                            </p>
                          )}

                          <div>
                            <label htmlFor="consultati-3-direccion-y-porcentaje" className="block text-slate-600 font-semibold mb-1.5">3. Dirección y porcentaje</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {(['DEFICIT', 'MANTENIMIENTO', 'SUPERAVIT'] as DireccionPrescripcion[]).map(d => (
                                <button
                                  type="button"
                                  key={d}
                                  onClick={() => { setDireccionPrescripcion(d); if (d === 'MANTENIMIENTO') setPorcentajePrescripcion(0); }}
                                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${direccionPrescripcion === d ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                  {d === 'DEFICIT' && <TrendingDown className="w-3.5 h-3.5" />}
                                  {d === 'SUPERAVIT' && <TrendingUp className="w-3.5 h-3.5" />}
                                  {d === 'MANTENIMIENTO' && <Minus className="w-3.5 h-3.5" />}
                                  {d === 'DEFICIT' ? 'Déficit' : d === 'SUPERAVIT' ? 'Superávit' : 'Mantenimiento'}
                                </button>
                              ))}
                            </div>
                            {direccionPrescripcion !== 'MANTENIMIENTO' && (
                              <div className="flex flex-wrap gap-2">
                                {porcentajesParaMostrar.map(pct => (
                                  <button
                                    type="button"
                                    key={pct}
                                    onClick={() => setPorcentajePrescripcion(pct)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${porcentajePrescripcion === pct ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600'}`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {prescripcionFinal != null && (
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
                              <div>
                                <div className="text-[11px] text-teal-700 uppercase font-bold">Resultado calculado</div>
                                <div className="text-xl font-black text-teal-800">{Math.round(prescripcionFinal)} kcal/día</div>
                              </div>
                              <div className="text-right">
                                <button
                                  type="button"
                                  onClick={handleAplicarPrescripcion}
                                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                                >
                                  Usar este valor
                                </button>
                                {prescripcionAplicada && (
                                  <p className="text-[11px] text-teal-800 font-semibold mt-1 flex items-center gap-1" role="status"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Aplicado a TMB y presupuesto calórico</p>
                                )}
                              </div>
                            </div>
                          )}

                          {plantillasCoincidentes.length > 0 && (
                            <div className="space-y-2">
                              {(patient.alergiasAlimentarias || alimentosNoConsume || alimentosPreferidos) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800">
                                  <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Revisar antes de aplicar una plantilla:</p>
                                  {patient.alergiasAlimentarias && <p>Alergias: {patient.alergiasAlimentarias}</p>}
                                  {alimentosNoConsume && <p>No consume: {alimentosNoConsume}</p>}
                                  {alimentosPreferidos && <p>Prefiere: {alimentosPreferidos}</p>}
                                </div>
                              )}
                              <label className="block text-slate-600 font-semibold">Plantillas sugeridas para este rango</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {plantillasCoincidentes.map(pl => (
                                  <button
                                    type="button"
                                    key={pl.id}
                                    onClick={() => handleAplicarPlantilla(pl)}
                                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left"
                                  >
                                    <div className="font-semibold text-slate-700">{pl.nombre}</div>
                                    <div className="text-[11px] text-slate-500">{pl.caloriaMin}-{pl.caloriaMax} kcal · C:{pl.carbohidratosPct ?? '—'}% P:{pl.proteinasPct ?? '—'}% G:{pl.grasasPct ?? '—'}%</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 w-56">
                    <label className="block text-slate-600 font-bold mb-1">Presupuesto Calórico Diario (kcal)</label>
                    <input id="consultati-3-direccion-y-porcentaje"
                      type="number"
                      value={calorias}
                      onChange={(e) => setCalorias(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold"
                    />
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <label htmlFor="consultati-distribucion-de-macronutrientes-carbohidratos" className="block text-slate-600 font-bold mb-1">Distribución de Macronutrientes (%)</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-0.5">Carbohidratos</label>
                        <input id="consultati-distribucion-de-macronutrientes-carbohidratos"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosCarbohidratosPct}
                          onChange={(e) => setMacrosCarbohidratosPct(e.target.value)}
                          placeholder="ej: 40"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-proteinas" className="block text-slate-500 text-[11px] mb-0.5">Proteínas</label>
                        <input id="consultati-proteinas"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosProteinasPct}
                          onChange={(e) => setMacrosProteinasPct(e.target.value)}
                          placeholder="ej: 35"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-grasas" className="block text-slate-500 text-[11px] mb-0.5">Grasas</label>
                        <input id="consultati-grasas"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosGrasasPct}
                          onChange={(e) => setMacrosGrasasPct(e.target.value)}
                          placeholder="ej: 25"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                    {(macrosCarbohidratosPct !== '' || macrosProteinasPct !== '' || macrosGrasasPct !== '') && (
                      <p className={`text-[11px] mt-1.5 font-semibold ${todosLosMacrosPctLlenos && sumaMacrosPct !== 100 ? 'text-rose-600' : 'text-slate-500'}`}>
                        Suma actual: {sumaMacrosPct}% {todosLosMacrosPctLlenos ? (sumaMacrosPct === 100 ? <Check className="inline w-3.5 h-3.5 text-emerald-600 align-text-bottom" aria-label="correcto" /> : '(debe sumar 100%)') : '(opcional dejar campos en blanco)'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 bg-teal-50/20 p-4 rounded-xl border border-teal-100 text-xs">
                  <div>
                    <label htmlFor="consultati-desayuno-saludable" className="block text-slate-600 font-semibold mb-1">Desayuno Saludable</label>
                    <textarea id="consultati-desayuno-saludable"
                      rows={2}
                      value={desayuno}
                      onChange={(e) => setDesayuno(e.target.value)}
                      placeholder="ej: Gallo pinto ligero con un huevo y queso tierno..."
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="consultati-merienda-manana" className="block text-slate-600 font-semibold mb-1">Merienda Mañana</label>
                      <input id="consultati-merienda-manana"
                        type="text"
                        value={meriendaMan}
                        onChange={(e) => setMeriendaMan(e.target.value)}
                        placeholder="ej: Manzana picada con almendras"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-merienda-tarde" className="block text-slate-600 font-semibold mb-1">Merienda Tarde</label>
                      <input id="consultati-merienda-tarde"
                        type="text"
                        value={meriendaTar}
                        onChange={(e) => setMeriendaTar(e.target.value)}
                        placeholder="ej: Yogur descremado con chía"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="consultati-almuerzo-nutritivo" className="block text-slate-600 font-semibold mb-1">Almuerzo Nutritivo</label>
                    <textarea id="consultati-almuerzo-nutritivo"
                      rows={2}
                      value={almuerzo}
                      onChange={(e) => setAlmuerzo(e.target.value)}
                      placeholder="ej: Casado ligero con pechuga de pollo a la plancha, frijoles negros y ensalada"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-cena-ligera" className="block text-slate-600 font-semibold mb-1">Cena Ligera</label>
                    <textarea id="consultati-cena-ligera"
                      rows={2}
                      value={cena}
                      onChange={(e) => setCena(e.target.value)}
                      placeholder="ej: Fajitas de pescado con pimientos y tortillas de maíz"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-indicaciones-clinicas-adicionales" className="block text-slate-600 font-semibold mb-1">Indicaciones Clínicas Adicionales</label>
                    <textarea id="consultati-indicaciones-clinicas-adicionales"
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
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-teal-600" />
                Valoración Mecánica, Dolor & Kinesiología
              </h4>
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
                  <label htmlFor="consultati-mecanismo-de-lesion-origen" className="block text-slate-600 font-bold mb-1">Mecanismo de Lesión (Origen)</label>
                  <input id="consultati-mecanismo-de-lesion-origen"
                    type="text"
                    value={mecanismoLesion}
                    onChange={(e) => setMecanismoLesion(e.target.value)}
                    placeholder="ej: Trauma rotacional de rodilla en futbol, caída"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-diagnostico-medico-referencia" className="block text-slate-600 font-bold mb-1">Diagnóstico Médico / Referencia</label>
                  <input id="consultati-diagnostico-medico-referencia"
                    type="text"
                    value={diagnosticoMedico}
                    onChange={(e) => setDiagnosticoMedico(e.target.value)}
                    placeholder="ej: Rotura parcial ligamento colateral medial"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="consultati-tipo-de-dolor" className="block text-slate-600 font-bold mb-1">Tipo de Dolor</label>
                    <select id="consultati-tipo-de-dolor"
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
                    <label htmlFor="consultati-intensidad-eva-0-10" className="block text-slate-600 font-bold mb-1">Intensidad EVA (0-10)</label>
                    <input id="consultati-intensidad-eva-0-10"
                      type="number"
                      min="0"
                      max="10"
                      value={evaDolor}
                      onChange={(e) => setEvaDolor(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="consultati-factores-agravantes" className="block text-slate-600 font-bold mb-1">Factores Agravantes</label>
                  <input id="consultati-factores-agravantes"
                    type="text"
                    value={factoresAgravantes}
                    onChange={(e) => setFactoresAgravantes(e.target.value)}
                    placeholder="ej: Estar de pie, subir gradas"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="consultati-factores-atenuantes" className="block text-slate-600 font-bold mb-1">Factores Atenuantes</label>
                  <input id="consultati-factores-atenuantes"
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
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Examen Físico Funcional</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="consultati-inspeccion-de-postura" className="block text-slate-600 font-semibold mb-1">Inspección de Postura</label>
                  <textarea id="consultati-inspeccion-de-postura"
                    rows={2}
                    value={posturaObservaciones}
                    onChange={(e) => setPosturaObservaciones(e.target.value)}
                    placeholder="ej: Desviación pélvica lateral, retracción..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-hallazgos-de-palpacion" className="block text-slate-600 font-semibold mb-1">Hallazgos de Palpación</label>
                  <textarea id="consultati-hallazgos-de-palpacion"
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
                  <label htmlFor="consultati-rangos-articulares-rom" className="block text-slate-600 font-semibold mb-1">Rangos Articulares (ROM)</label>
                  <input id="consultati-rangos-articulares-rom"
                    type="text"
                    value={romMedido}
                    onChange={(e) => setRomMedido(e.target.value)}
                    placeholder="ej: Flexión de cadera activa 80°"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-fuerza-escala-daniels-0" className="block text-slate-600 font-semibold mb-1">Fuerza Escala Daniels (0-5)</label>
                  <input id="consultati-fuerza-escala-daniels-0"
                    type="text"
                    value={fuerzaDaniels}
                    onChange={(e) => setFuerzaDaniels(e.target.value)}
                    placeholder="ej: 4/5 en cuádriceps derecho"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-pruebas-ortopedicas-especiales" className="block text-slate-600 font-semibold mb-1">Pruebas Ortopédicas Especiales</label>
                  <input id="consultati-pruebas-ortopedicas-especiales"
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
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block">Prescripción e Intervenciones</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="consultati-agentes-fisicos-tens-ultrasonido" className="block text-slate-600 font-semibold mb-1">Agentes Físicos (TENS, Ultrasonido...)</label>
                  <input id="consultati-agentes-fisicos-tens-ultrasonido"
                    type="text"
                    value={agentesFisicos}
                    onChange={(e) => setAgentesFisicos(e.target.value)}
                    placeholder="ej: TENS convencional 100Hz, crioterapia"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-terapia-manual-aplicada" className="block text-slate-600 font-semibold mb-1">Terapia Manual Aplicada</label>
                  <input id="consultati-terapia-manual-aplicada"
                    type="text"
                    value={terapiaManual}
                    onChange={(e) => setTerapiaManual(e.target.value)}
                    placeholder="ej: Masaje de descarga miofascial"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-ejercicio-terapeutico-recetado" className="block text-slate-600 font-semibold mb-1">Ejercicio Terapéutico Recetado</label>
                  <input id="consultati-ejercicio-terapeutico-recetado"
                    type="text"
                    value={ejercicioTerapeutico}
                    onChange={(e) => setEjercicioTerapeutico(e.target.value)}
                    placeholder="ej: Protocolo de McKenzie, estiramiento isquiotibiales"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="w-48">
                <label htmlFor="consultati-sesiones-sugeridas-para-el" className="block text-slate-600 font-semibold mb-1">Sesiones sugeridas para el ciclo</label>
                <input id="consultati-sesiones-sugeridas-para-el"
                  type="number"
                  value={sesionesSugeridas}
                  onChange={(e) => setSesionesSugeridas(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            {/* SOAP Clinical evolution note */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
              <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">Nota de Evolución Clínica Diaria (Estándar SOAP)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="consultati-s-subjetivo-reporte-del" className="block text-slate-300 font-medium mb-1">S (Subjetivo): Reporte del paciente</label>
                  <textarea id="consultati-s-subjetivo-reporte-del"
                    rows={2}
                    value={soapSubjetivo}
                    onChange={(e) => setSoapSubjetivo(e.target.value)}
                    placeholder="Paciente reporta dolor punzante en hombro izquierdo antes de empezar..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-o-objetivo-mediciones-de" className="block text-slate-300 font-medium mb-1">O (Objetivo): Mediciones de hoy</label>
                  <textarea id="consultati-o-objetivo-mediciones-de"
                    rows={2}
                    value={soapObjetivo}
                    onChange={(e) => setSoapObjetivo(e.target.value)}
                    placeholder="Se mide flexión activa de hombro a 100° sin dolor, espasmo leve paravertebral..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-a-analisis-conclusion-de" className="block text-slate-300 font-medium mb-1">A (Análisis): Conclusión de la sesión</label>
                  <textarea id="consultati-a-analisis-conclusion-de"
                    rows={2}
                    value={soapAnalisis}
                    onChange={(e) => setSoapAnalisis(e.target.value)}
                    placeholder="Respuesta favorable al estiramiento balístico, mejora de dolor post termoterapia..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label htmlFor="consultati-p-plan-tareas-y" className="block text-slate-300 font-medium mb-1">P (Plan): Tareas y siguiente sesión</label>
                  <textarea id="consultati-p-plan-tareas-y"
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
          <label htmlFor="consultati-observaciones-generales-y-recomendaciones" className="block text-slate-600 font-bold mb-1">Observaciones Generales y Recomendaciones al Paciente</label>
          <textarea id="consultati-observaciones-generales-y-recomendaciones"
            rows={2}
            value={anotaciones}
            onChange={(e) => setAnotaciones(e.target.value)}
            placeholder="Consejos extras que saldrán en el reporte final..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Action triggers */}
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
          disabled={isSubmitting}
          className="min-h-11 text-white font-semibold px-5 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-60 hover:brightness-110 transition-[filter,opacity]"
          style={{ backgroundColor: themeColor }}
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {isSubmitting ? 'Guardando…' : editingConsultation ? 'Guardar cambios y ver reporte' : 'Guardar consulta y ver reporte'}
        </button>
      </div>
    </form>
  );
}
