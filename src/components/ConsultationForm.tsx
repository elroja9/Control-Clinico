import React, { useState, useEffect, useRef } from 'react';
import { Patient, Consultation, PorcentajeDieta, PlantillaDieta } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, Dumbbell, ChevronRight, Calculator, TrendingDown, TrendingUp, Minus, Apple, Check, AlertTriangle } from 'lucide-react';
import PainMapSelector from './PainMapSelector';
import { calcularTMB, calcularPromedioSemanal, aplicarPorcentaje, FACTORES_ACTIVIDAD, FormulaTMB, DireccionPrescripcion } from '../utils/calorieFormulas';
import { notify } from './ui/Feedback';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { controlBase } from './ui/Input';
import { SegmentedControl } from './ui/SegmentedControl';

// Estilos compartidos de los controles del formulario (tokens del sistema de diseño)
const ctl = `${controlBase} px-3 py-2 resize-y`;
const ctlBold = `${ctl} font-semibold`;const ctlLabel = 'block text-xs font-semibold text-fg mb-1.5';

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

  // Índice de secciones del formulario (UI): cada id coincide con el de su bloque en el JSX
  const secciones: { id: string; etiqueta: string }[] = [
    { id: 'sec-general', etiqueta: 'Datos generales' },
    ...(tipo === 'Nutrición'
      ? [
          { id: 'sec-antro', etiqueta: 'Antropometría' },
          { id: 'sec-pliegues', etiqueta: 'Pliegues' },
          { id: 'sec-composicion', etiqueta: 'Composición' },
          { id: 'sec-bioquimica', etiqueta: 'Bioquímica' },
          { id: 'sec-dietetica', etiqueta: 'Dietética' },
          { id: 'sec-estilo', etiqueta: 'Estilo de vida' },
          { id: 'sec-dieta', etiqueta: 'Dieta' }
        ]
      : [
          { id: 'sec-fisio-dolor', etiqueta: 'Dolor' },
          { id: 'sec-fisio-examen', etiqueta: 'Examen físico' },
          { id: 'sec-fisio-prescripcion', etiqueta: 'Intervenciones' },
          { id: 'sec-fisio-soap', etiqueta: 'Nota SOAP' }
        ]),
    { id: 'sec-observaciones', etiqueta: 'Observaciones' }
  ];
  const [seccionActiva, setSeccionActiva] = useState('sec-general');

  // Resalta en el índice la sección que está más cerca del borde superior
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas.filter(en => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles.length > 0) setSeccionActiva(visibles[0].target.id);
      },
      { rootMargin: '-110px 0px -60% 0px' }
    );
    secciones.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const irASeccion = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    setSeccionActiva(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <form onSubmit={handleFormSubmit} className="bg-surface rounded-panel border border-border shadow-sm overflow-clip text-body text-fg">
      {/* Acento con el color de la clínica */}
      <div className="h-1" style={{ backgroundColor: themeColor }} aria-hidden="true" />
      {/* Encabezado: paciente y especialidad */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-heading font-semibold tracking-tight text-fg">{editingConsultation ? 'Editar consulta clínica' : 'Nueva consulta clínica'}</h2>
            <p className="text-body text-fg-muted truncate">{patient.nombreCompleto} · Cédula {patient.identificacion}</p>
          </div>
        </div>

        {/* Specialty Selector */}
        {perfilCompania === 'Ambas' ? (
          <SegmentedControl
            ariaLabel="Especialidad de la consulta"
            value={tipo}
            onChange={(v) => setTipo(v)}
            options={[
              { value: 'Nutrición', label: 'Nutrición', icon: <Apple /> },
              { value: 'Fisioterapia', label: 'Fisioterapia', icon: <Dumbbell /> }
            ]}
            className="sm:w-auto sm:inline-flex sm:shrink-0"
          />
        ) : (
          <Badge tone="brand" className="px-3 py-1.5 text-xs self-start sm:self-auto">
            Especialidad:
            {tipo === 'Fisioterapia' ? <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> : <Apple className="w-3.5 h-3.5" aria-hidden="true" />}
            {tipo}
          </Badge>
        )}
      </div>

      {/* Índice de secciones: chips horizontales fijos justo bajo el header de la app
          (que mide 4rem + zona segura superior), con scroll lateral y snap */}
      <nav aria-label="Secciones de la consulta" className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 bg-surface/95 backdrop-blur-sm border-b border-border">
        <ol className="flex gap-1.5 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 px-4 sm:px-6 py-2 scrollbar-thin">
          {secciones.map((s, i) => {
            const activa = seccionActiva === s.id;
            return (
              <li key={s.id} className="shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => irASeccion(s.id)}
                  aria-current={activa ? 'step' : undefined}
                  className={`min-h-11 px-3 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                    activa ? 'bg-brand-soft text-brand-ink' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full text-caption flex items-center justify-center ${activa ? 'bg-brand-solid text-brand-fg' : 'bg-surface-muted text-fg-muted'}`} aria-hidden="true">{i + 1}</span>
                  {s.etiqueta}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="p-4 sm:p-6 space-y-6">

        {/* Core fields: una columna en móvil, dos desde sm */}
        <div id="sec-general" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="consultati-fecha-de-consulta" className={ctlLabel}>Fecha de Consulta</label>
            <input id="consultati-fecha-de-consulta"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`${ctl} px-2.5!`}
            />
          </div>
          <div>
            <label htmlFor="consultati-horas-promedio-de-sueno" className={ctlLabel}>Horas promedio de sueño</label>
            <input id="consultati-horas-promedio-de-sueno"
              type="number"
              step="0.5"
              value={horasSueno}
              onChange={(e) => setHorasSueno(parseFloat(e.target.value))}
              className={ctl}
            />
          </div>
          <div>
            <label htmlFor="consultati-motivacion-del-paciente-1" className={ctlLabel}>Motivación del Paciente (1 al 10)</label>
            <input id="consultati-motivacion-del-paciente-1"
              type="number"
              min="1"
              max="10"
              value={compromiso}
              onChange={(e) => setCompromiso(parseInt(e.target.value))}
              className={ctlBold}
            />
          </div>
        </div>

        <div>
          <label htmlFor="consultati-motivo-de-la-cita" className={ctlLabel}>Motivo de la Cita *</label>
          <input id="consultati-motivo-de-la-cita"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej: Control de peso bimensual / Dolor agudo lumbar post entrenamiento"
            className={ctl}
            required
          />
        </div>

        {/* ================= NUTRITION SPECIFIC PANEL ================= */}
        {tipo === 'Nutrición' && (
          <div className="space-y-4">
            {/* Accordion 1: Antropometria General y Basal */}
            <details id="sec-antro" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface" open>
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-ink" />
                  <span>Antropometría General y Valores Basales</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="consultati-peso-kg" className={ctlLabel}>Peso (kg)</label>
                  <input id="consultati-peso-kg"
                    type="number"
                    step="0.1"
                    value={peso}
                    onChange={(e) => setPeso(parseFloat(e.target.value) || 0)}
                    className={ctlBold}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-estatura-talla-cm" className={ctlLabel}>Estatura / Talla (cm)</label>
                  <input id="consultati-estatura-talla-cm"
                    type="number"
                    value={talla}
                    onChange={(e) => setTalla(parseInt(e.target.value) || 0)}
                    className={ctlBold}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-imc-calculado-grasa-corporal" className={ctlLabel}>IMC Calculado</label>
                  <div className="w-full min-h-11 bg-brand-soft border border-brand/20 rounded-control px-3 py-2 text-heading text-brand-ink font-semibold tabular-nums flex justify-between items-center gap-2" aria-live="polite">
                    <span>{calculatedImc}</span>
                    <Badge tone={calculatedImc >= 30 ? 'danger' : calculatedImc >= 25 ? 'warning' : 'success'}>
                      {calculatedImc >= 30 ? 'Obesidad' : calculatedImc >= 25 ? 'Sobrepeso' : 'Normal'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className={ctlLabel}>Grasa Corporal (%)</label>
                  <input id="consultati-imc-calculado-grasa-corporal"
                    type="number"
                    step="0.1"
                    value={grasaCorp}
                    onChange={(e) => setGrasaCorp(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-grasa-visceral-nivel" className={ctlLabel}>Grasa Visceral (Nivel)</label>
                  <input id="consultati-grasa-visceral-nivel"
                    type="number"
                    value={grasaVisc}
                    onChange={(e) => setGrasaVisc(parseInt(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-masa-muscular-kg" className={ctlLabel}>Masa Muscular (kg)</label>
                  <input id="consultati-masa-muscular-kg"
                    type="number"
                    step="0.1"
                    value={musculo}
                    onChange={(e) => setMusculo(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-cintura-cm" className={ctlLabel}>Cintura (cm)</label>
                  <input id="consultati-cintura-cm"
                    type="number"
                    value={cintura}
                    onChange={(e) => setCintura(parseInt(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-abdominal-cm" className={ctlLabel}>Abdominal (cm)</label>
                  <input id="consultati-abdominal-cm"
                    type="number"
                    value={abdominal}
                    onChange={(e) => setAbdominal(parseInt(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-circunferencia-muneca-cm" className={ctlLabel}>Circunferencia Muñeca (cm)</label>
                  <input id="consultati-circunferencia-muneca-cm"
                    type="number"
                    step="0.1"
                    value={cMuneca}
                    onChange={(e) => setCMuneca(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-grasa-balanza" className={ctlLabel}>Grasa Balanza (%)</label>
                  <input id="consultati-grasa-balanza"
                    type="number"
                    step="0.1"
                    value={pctGrasaBalanza}
                    onChange={(e) => setPctGrasaBalanza(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-porcentaje-agua" className={ctlLabel}>Porcentaje Agua (%)</label>
                  <input id="consultati-porcentaje-agua"
                    type="number"
                    step="0.1"
                    value={pctAgua}
                    onChange={(e) => setPctAgua(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-kilogramos-magros-kg" className={ctlLabel}>Kilogramos Magros (kg)</label>
                  <input id="consultati-kilogramos-magros-kg"
                    type="number"
                    step="0.1"
                    value={kgMagros}
                    onChange={(e) => setKgMagros(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-masa-osea-kg" className={ctlLabel}>Masa Ósea (kg)</label>
                  <input id="consultati-masa-osea-kg"
                    type="number"
                    step="0.1"
                    value={osea}
                    onChange={(e) => setOsea(parseFloat(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-tmb-kcal-dia" className={ctlLabel}>TMB (Kcal/día)</label>
                  <input id="consultati-tmb-kcal-dia"
                    type="number"
                    value={tmb}
                    onChange={(e) => setTmb(parseInt(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-edad-metabolica-anos" className={ctlLabel}>Edad Metabólica (Años)</label>
                  <input id="consultati-edad-metabolica-anos"
                    type="number"
                    value={edadMetabolica}
                    onChange={(e) => setEdadMetabolica(parseInt(e.target.value) || 0)}
                    className={ctl}
                  />
                </div>
              </div>
            </details>

            {/* Accordion 2: Pliegues y Perimetros */}
            <details id="sec-pliegues" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-ink" />
                  <span>Pliegues Cutáneos y Perímetros (Calibrador)</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="consultati-pliegue-triceps-mm" className={ctlLabel}>Pliegue Tríceps (mm)</label>
                    <input id="consultati-pliegue-triceps-mm"
                      type="number"
                      step="0.1"
                      value={pliegueTriceps}
                      onChange={(e) => setPliegueTriceps(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-subescapular-mm" className={ctlLabel}>Pliegue Subescapular (mm)</label>
                    <input id="consultati-pliegue-subescapular-mm"
                      type="number"
                      step="0.1"
                      value={pliegueSubescapular}
                      onChange={(e) => setPliegueSubescapular(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-biceps-mm" className={ctlLabel}>Pliegue Bíceps (mm)</label>
                    <input id="consultati-pliegue-biceps-mm"
                      type="number"
                      step="0.1"
                      value={pliegueBiceps}
                      onChange={(e) => setPliegueBiceps(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-cresta-iliaca-mm" className={ctlLabel}>Pliegue Cresta Ilíaca (mm)</label>
                    <input id="consultati-pliegue-cresta-iliaca-mm"
                      type="number"
                      step="0.1"
                      value={pliegueCrestaIliaca}
                      onChange={(e) => setPliegueCrestaIliaca(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-supraespinal-mm" className={ctlLabel}>Pliegue Supraespinal (mm)</label>
                    <input id="consultati-pliegue-supraespinal-mm"
                      type="number"
                      step="0.1"
                      value={pliegueSupraespinal}
                      onChange={(e) => setPliegueSupraespinal(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-abdominal-mm" className={ctlLabel}>Pliegue Abdominal (mm)</label>
                    <input id="consultati-pliegue-abdominal-mm"
                      type="number"
                      step="0.1"
                      value={pliegueAbdominal}
                      onChange={(e) => setPliegueAbdominal(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-muslo-medio-mm" className={ctlLabel}>Pliegue Muslo Medio (mm)</label>
                    <input id="consultati-pliegue-muslo-medio-mm"
                      type="number"
                      step="0.1"
                      value={pliegueMusloMedio}
                      onChange={(e) => setPliegueMusloMedio(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-pliegue-pierna-medial-mm" className={ctlLabel}>Pliegue Pierna Medial (mm)</label>
                    <input id="consultati-pliegue-pierna-medial-mm"
                      type="number"
                      step="0.1"
                      value={plieguePiernaMedial}
                      onChange={(e) => setPlieguePiernaMedial(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <label htmlFor="consultati-perimetro-brazo-relajado-cm" className={ctlLabel}>Perímetro Brazo Relajado (cm)</label>
                    <input id="consultati-perimetro-brazo-relajado-cm"
                      type="number"
                      step="0.1"
                      value={perimetroBrazoRelajado}
                      onChange={(e) => setPerimetroBrazoRelajado(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-perimetro-brazo-contraido-flexionado" className={ctlLabel}>Perímetro Brazo Contraído / Flexionado (cm)</label>
                    <input id="consultati-perimetro-brazo-contraido-flexionado"
                      type="number"
                      step="0.1"
                      value={perimetroBrazoContraido}
                      onChange={(e) => setPerimetroBrazoContraido(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 3: Composicion Corporal Segmentada */}
            <details id="sec-composicion" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-ink" />
                  <span>Composición Corporal Segmentada (Brazos, Piernas, Tronco)</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                {/* Segmento Grasa */}
                <div className="bg-surface-muted p-4 rounded-control border border-border">
                  <h5 className="font-semibold text-fg mb-3">Distribución de Grasa Segmentada</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label htmlFor="consultati-grasa-total" className={ctlLabel}>Grasa Total (%)</label>
                      <input id="consultati-grasa-total"
                        type="number"
                        step="0.1"
                        value={grasaTotal}
                        onChange={(e) => setGrasaTotal(parseFloat(e.target.value) || 0)}
                        className={ctlBold}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-izquierda" className={ctlLabel}>Mano Izquierda (%)</label>
                      <input id="consultati-mano-izquierda"
                        type="number"
                        step="0.1"
                        value={grasaManoIzq}
                        onChange={(e) => setGrasaManoIzq(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-derecha" className={ctlLabel}>Mano Derecha (%)</label>
                      <input id="consultati-mano-derecha"
                        type="number"
                        step="0.1"
                        value={grasaManoDer}
                        onChange={(e) => setGrasaManoDer(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-izquierda" className={ctlLabel}>Pierna Izquierda (%)</label>
                      <input id="consultati-pierna-izquierda"
                        type="number"
                        step="0.1"
                        value={grasaPiernaIzq}
                        onChange={(e) => setGrasaPiernaIzq(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-derecha" className={ctlLabel}>Pierna Derecha (%)</label>
                      <input id="consultati-pierna-derecha"
                        type="number"
                        step="0.1"
                        value={grasaPiernaDer}
                        onChange={(e) => setGrasaPiernaDer(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-tronco" className={ctlLabel}>Tronco (%)</label>
                      <input id="consultati-tronco"
                        type="number"
                        step="0.1"
                        value={grasaTronco}
                        onChange={(e) => setGrasaTronco(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                  </div>
                  <div className="mt-3 w-48">
                    <label htmlFor="consultati-calificacion-de-grasa" className={ctlLabel}>Calificación de Grasa</label>
                    <input id="consultati-calificacion-de-grasa"
                      type="text"
                      value={grasaCalificacion}
                      onChange={(e) => setGrasaCalificacion(e.target.value)}
                      placeholder="Normal / Elevada / Baja"
                      className={ctl}
                    />
                  </div>
                </div>

                {/* Segmento Musculo */}
                <div className="bg-surface-muted p-4 rounded-control border border-border">
                  <h5 className="font-semibold text-fg mb-3">Distribución de Músculo Segmentado</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label htmlFor="consultati-musculo-total-kg" className={ctlLabel}>Músculo Total (kg)</label>
                      <input id="consultati-musculo-total-kg"
                        type="number"
                        step="0.1"
                        value={musculoTotal}
                        onChange={(e) => setMusculoTotal(parseFloat(e.target.value) || 0)}
                        className={ctlBold}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-izquierda-kg" className={ctlLabel}>Mano Izquierda (kg)</label>
                      <input id="consultati-mano-izquierda-kg"
                        type="number"
                        step="0.1"
                        value={musculoManoIzq}
                        onChange={(e) => setMusculoManoIzq(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-mano-derecha-kg" className={ctlLabel}>Mano Derecha (kg)</label>
                      <input id="consultati-mano-derecha-kg"
                        type="number"
                        step="0.1"
                        value={musculoManoDer}
                        onChange={(e) => setMusculoManoDer(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-izquierda-kg" className={ctlLabel}>Pierna Izquierda (kg)</label>
                      <input id="consultati-pierna-izquierda-kg"
                        type="number"
                        step="0.1"
                        value={musculoPiernaIzq}
                        onChange={(e) => setMusculoPiernaIzq(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-pierna-derecha-kg" className={ctlLabel}>Pierna Derecha (kg)</label>
                      <input id="consultati-pierna-derecha-kg"
                        type="number"
                        step="0.1"
                        value={musculoPiernaDer}
                        onChange={(e) => setMusculoPiernaDer(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-tronco-kg" className={ctlLabel}>Tronco (kg)</label>
                      <input id="consultati-tronco-kg"
                        type="number"
                        step="0.1"
                        value={musculoTronco}
                        onChange={(e) => setMusculoTronco(parseFloat(e.target.value) || 0)}
                        className={ctl}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 4: Evaluacion Bioquimica */}
            <details id="sec-bioquimica" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-brand-ink" />
                  <span>Evaluación Bioquímica (Exámenes de Laboratorio)</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label htmlFor="consultati-glicemia-mg-dl" className={ctlLabel}>Glicemia (mg/dL)</label>
                    <input id="consultati-glicemia-mg-dl"
                      type="number"
                      value={glicemia}
                      onChange={(e) => setGlicemia(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-insulinemia-ui-ml" className={ctlLabel}>Insulinemia (µUI/mL)</label>
                    <input id="consultati-insulinemia-ui-ml"
                      type="number"
                      step="0.1"
                      value={insulinemia}
                      onChange={(e) => setInsulinemia(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-indice-homa-ir" className={ctlLabel}>Índice HOMA-IR</label>
                    <input id="consultati-indice-homa-ir"
                      type="number"
                      step="0.1"
                      value={indiceHoma}
                      onChange={(e) => setIndiceHoma(parseFloat(e.target.value) || 0)}
                      className={ctlBold}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hba1c-glicosilada" className={ctlLabel}>HbA1c Glicosilada (%)</label>
                    <input id="consultati-hba1c-glicosilada"
                      type="number"
                      step="0.1"
                      value={hb1ac}
                      onChange={(e) => setHb1ac(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-vitamina-d-ng-ml" className={ctlLabel}>Vitamina D (ng/mL)</label>
                    <input id="consultati-vitamina-d-ng-ml"
                      type="number"
                      value={vitD}
                      onChange={(e) => setVitD(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hemoglobina-g-dl" className={ctlLabel}>Hemoglobina (g/dL)</label>
                    <input id="consultati-hemoglobina-g-dl"
                      type="number"
                      step="0.1"
                      value={hemoglobina}
                      onChange={(e) => setHemoglobina(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-hematocrito" className={ctlLabel}>Hematocrito (%)</label>
                    <input id="consultati-hematocrito"
                      type="number"
                      value={hematocrito}
                      onChange={(e) => setHematocrito(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-albumina-g-dl" className={ctlLabel}>Albúmina (g/dL)</label>
                    <input id="consultati-albumina-g-dl"
                      type="number"
                      step="0.1"
                      value={albumina}
                      onChange={(e) => setAlbumina(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-acido-urico-mg-dl" className={ctlLabel}>Ácido Úrico (mg/dL)</label>
                    <input id="consultati-acido-urico-mg-dl"
                      type="number"
                      step="0.1"
                      value={acidoUrico}
                      onChange={(e) => setAcidoUrico(parseFloat(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-trigliceridos-mg-dl" className={ctlLabel}>Triglicéridos (mg/dL)</label>
                    <input id="consultati-trigliceridos-mg-dl"
                      type="number"
                      value={trigliceridos}
                      onChange={(e) => setTrigliceridos(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-total-mg-dl" className={ctlLabel}>Colesterol Total (mg/dL)</label>
                    <input id="consultati-colesterol-total-mg-dl"
                      type="number"
                      value={colesterolTotal}
                      onChange={(e) => setColesterolTotal(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-hdl-mg-dl" className={ctlLabel}>Colesterol HDL (mg/dL)</label>
                    <input id="consultati-colesterol-hdl-mg-dl"
                      type="number"
                      value={colesterolHdl}
                      onChange={(e) => setColesterolHdl(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-colesterol-ldl-mg-dl" className={ctlLabel}>Colesterol LDL (mg/dL)</label>
                    <input id="consultati-colesterol-ldl-mg-dl"
                      type="number"
                      value={colesterolLdl}
                      onChange={(e) => setColesterolLdl(parseInt(e.target.value) || 0)}
                      className={ctl}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <label htmlFor="consultati-intolerancias-alimentarias" className={ctlLabel}>Intolerancias Alimentarias</label>
                    <input id="consultati-intolerancias-alimentarias"
                      type="text"
                      value={intolerancias}
                      onChange={(e) => setIntolerancias(e.target.value)}
                      placeholder="ej: Intolerancia severa a la lactosa, fructosa"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-alergias-clinicas" className={ctlLabel}>Alergias Clínicas</label>
                    <input id="consultati-alergias-clinicas"
                      type="text"
                      value={alergiasNutri}
                      onChange={(e) => setAlergiasNutri(e.target.value)}
                      placeholder="ej: Alergia al gluten, mariscos"
                      className={ctl}
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 5: Evaluacion Dietetica */}
            <details id="sec-dietetica" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-brand-ink" />
                  <span>Evaluación Dietética & Hábitos de Consumo Diario</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="consultati-tiempos-de-comida-al" className={ctlLabel}>Tiempos de comida al día</label>
                    <select id="consultati-tiempos-de-comida-al"
                      value={tiemposComida}
                      onChange={(e) => setTiemposComida(e.target.value as any)}
                      className={ctl}
                    >
                      <option value="1-2">1 a 2 tiempos</option>
                      <option value="3-4">3 a 4 tiempos (Recomendado)</option>
                      <option value="5-6">5 a 6 tiempos</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="consultati-lugar-de-consumo-habitual" className={ctlLabel}>Lugar de Consumo Habitual</label>
                    <select id="consultati-lugar-de-consumo-habitual"
                      value={lugarConsumo}
                      onChange={(e) => setLugarConsumo(e.target.value as any)}
                      className={ctl}
                    >
                      <option value="Casa">En Casa</option>
                      <option value="Fuera">Fuera de Casa (Restaurantes/Oficina)</option>
                      <option value="Ambos">Ambos</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="consultati-quien-prepara-los-alimentos" className={ctlLabel}>¿Quién prepara los alimentos?</label>
                    <input id="consultati-quien-prepara-los-alimentos"
                      type="text"
                      value={quienPrepara}
                      onChange={(e) => setQuienPrepara(e.target.value)}
                      placeholder="ej: El mismo paciente / Pareja / Madre"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-calificacion-del-apetito" className={ctlLabel}>Calificación del Apetito</label>
                    <select id="consultati-calificacion-del-apetito"
                      value={calificacionApetito}
                      onChange={(e) => setCalificacionApetito(e.target.value as any)}
                      className={ctlBold}
                    >
                      <option value="Bueno">Bueno (Estable/Normal)</option>
                      <option value="Regular">Regular</option>
                      <option value="Malo">Malo / Ansiedad elevada / Inapetente</option>
                    </select>
                  </div>
                </div>

                <div className="bg-surface-muted p-4 rounded-control border border-border space-y-3">
                  <span className="font-semibold text-fg block">Métodos de Cocción Frecuentes y Condimentos</span>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionAsado}
                        onChange={(e) => setCoccionAsado(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>Asado</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionFritura}
                        onChange={(e) => setCoccionFritura(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>Fritura</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionHervido}
                        onChange={(e) => setCoccionHervido(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>Hervido</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionPlancha}
                        onChange={(e) => setCoccionPlancha(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>A la Plancha</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionVapor}
                        onChange={(e) => setCoccionVapor(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>Al Vapor</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={coccionFreidoraAire}
                        onChange={(e) => setCoccionFreidoraAire(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>Air Fryer</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agregaSal}
                        onChange={(e) => setAgregaSal(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>¿Agrega sal adicional en la mesa?</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consumeAzucar}
                        onChange={(e) => setConsumeAzucar(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>¿Consume azúcar refinada?</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={utilizaEdulcorante}
                        onChange={(e) => setUtilizaEdulcorante(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>¿Utiliza edulcorantes (stevia/splenda)?</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={ctlLabel}>Tipo de grasas preferidas para cocinar</label>
                    <input
                      type="text"
                      value={tipoGrasas}
                      onChange={(e) => setTipoGrasas(e.target.value)}
                      placeholder="ej: Aceite de oliva, manteca de cerdo, aceite de girasol"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-experiencia-con-dietas-anteriores" className={ctlLabel}>Experiencia con Dietas Anteriores</label>
                    <input id="consultati-experiencia-con-dietas-anteriores"
                      type="text"
                      value={dietasAnteriores}
                      onChange={(e) => setDietasAnteriores(e.target.value)}
                      placeholder="ej: Hizo keto con rebote / Dieta hipocalórica hace un año"
                      className={ctl}
                    />
                  </div>
                </div>

                <div className="bg-surface-muted p-4 rounded-control border border-border">
                  <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-2 min-h-10 cursor-pointer font-semibold text-fg">
                      <input
                        type="checkbox"
                        checked={consumeAgua}
                        onChange={(e) => setConsumeAgua(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                      />
                      <span>¿Lleva control de consumo de agua?</span>
                    </label>
                    {consumeAgua && (
                      <input
                        type="text"
                        value={cantidadAgua}
                        onChange={(e) => setCantidadAgua(e.target.value)}
                        placeholder="ej: 2.5 litros por día"
                        className={`${ctlBold} sm:w-48`}
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={ctlLabel}>Alimentos que NO consume (Rechazo/Aversión)</label>
                    <textarea
                      rows={2}
                      value={alimentosNoConsume}
                      onChange={(e) => setAlimentosNoConsume(e.target.value)}
                      placeholder="ej: No le gusta la cebolla picada, hígado, remolacha"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-alimentos-preferidos-apetencia" className={ctlLabel}>Alimentos Preferidos (Apetencia)</label>
                    <textarea id="consultati-alimentos-preferidos-apetencia"
                      rows={2}
                      value={alimentosPreferidos}
                      onChange={(e) => setAlimentosPreferidos(e.target.value)}
                      placeholder="ej: Le encanta el aguacate, pollo, batidos verdes"
                      className={ctl}
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 6: Estilo de Vida y Ejercicio */}
            <details id="sec-estilo" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-ink" />
                  <span>Estilo de Vida, Ejercicio & Hábitos Nocivos</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4 text-xs">
                {/* Bloque Actividad Fisica */}
                <div className="bg-surface-muted p-4 rounded-control border border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={realizaEjercicio}
                      onChange={(e) => setRealizaEjercicio(e.target.checked)}
                      className="rounded accent-brand w-5 h-5 shrink-0 cursor-pointer"
                      id="realizaEjercicio"
                    />
                    <label htmlFor="realizaEjercicio" className="font-semibold text-fg cursor-pointer">
                      ¿Realiza ejercicio físico estructurado?
                    </label>
                  </div>

                  {realizaEjercicio && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div>
                        <label htmlFor="consultati-tipo-de-ejercicio" className={ctlLabel}>Tipo de Ejercicio</label>
                        <input id="consultati-tipo-de-ejercicio"
                          type="text"
                          value={tipoEjercicio}
                          onChange={(e) => setTipoEjercicio(e.target.value)}
                          placeholder="ej: Funcional, Crossfit, Correr"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-frecuencia-semanal" className={ctlLabel}>Frecuencia Semanal</label>
                        <input id="consultati-frecuencia-semanal"
                          type="text"
                          value={frecuenciaEjercicioSemana}
                          onChange={(e) => setFrecuenciaEjercicioSemana(e.target.value)}
                          placeholder="ej: 3 veces por semana"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-duracion-sesion" className={ctlLabel}>Duración (Sesión)</label>
                        <input id="consultati-duracion-sesion"
                          type="text"
                          value={duracionEjercicio}
                          onChange={(e) => setDuracionEjercicio(e.target.value)}
                          placeholder="ej: 1 hora"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-hora-del-entreno" className={ctlLabel}>Hora del Entreno</label>
                        <input id="consultati-hora-del-entreno"
                          type="text"
                          value={horaEntreno}
                          onChange={(e) => setHoraEntreno(e.target.value)}
                          placeholder="ej: 6:00 AM / Noches"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-tiempo-de-entrenar-meses" className={ctlLabel}>Tiempo de Entrenar (Meses/Años)</label>
                        <input id="consultati-tiempo-de-entrenar-meses"
                          type="text"
                          value={tiempoEntrenar}
                          onChange={(e) => setTiempoEntrenar(e.target.value)}
                          placeholder="ej: Hace 6 meses"
                          className={ctl}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Suplementos */}
                <div>
                  <label htmlFor="consultati-suplementos-deportivos-o-nutricionales" className={ctlLabel}>Suplementos deportivos o nutricionales consumidos</label>
                  <input id="consultati-suplementos-deportivos-o-nutricionales"
                    type="text"
                    value={suplementos}
                    onChange={(e) => setSuplementos(e.target.value)}
                    placeholder="ej: Proteína whey, Creatina monohidratada, Magnesio citrate"
                    className={ctl}
                  />
                </div>

                {/* Alcohol y Fumar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* Alcohol */}
                  <div className="bg-surface-muted p-4 rounded-control border border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consumeAlcohol}
                        onChange={(e) => setConsumeAlcohol(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                        id="consumeAlcohol"
                      />
                      <label htmlFor="consumeAlcohol" className="font-semibold text-fg">Consumo de Alcohol</label>
                    </div>
                    {consumeAlcohol && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <div>
                          <label htmlFor="consultati-tipo" className="block text-xs text-fg-muted mb-1">Tipo</label>
                          <input id="consultati-tipo"
                            type="text"
                            value={tipoAlcohol}
                            onChange={(e) => setTipoAlcohol(e.target.value)}
                            placeholder="Cerveza / Vino"
                            className={ctl}
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-frecuencia" className="block text-xs text-fg-muted mb-1">Frecuencia</label>
                          <input id="consultati-frecuencia"
                            type="text"
                            value={frecuenciaAlcohol}
                            onChange={(e) => setFrecuenciaAlcohol(e.target.value)}
                            placeholder="Fines de semana"
                            className={ctl}
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-cantidad" className="block text-xs text-fg-muted mb-1">Cantidad</label>
                          <input id="consultati-cantidad"
                            type="text"
                            value={cantidadAlcohol}
                            onChange={(e) => setCantidadAlcohol(e.target.value)}
                            placeholder="2 vasos"
                            className={ctl}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Smoking */}
                  <div className="bg-surface-muted p-4 rounded-control border border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={fuma}
                        onChange={(e) => setFuma(e.target.checked)}
                        className="rounded accent-brand w-5 h-5 shrink-0"
                        id="fuma"
                      />
                      <label htmlFor="fuma" className="font-semibold text-fg">Tabaquismo / Fumado</label>
                    </div>
                    {fuma && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label htmlFor="consultati-frecuencia-2" className="block text-xs text-fg-muted mb-1">Frecuencia</label>
                          <input id="consultati-frecuencia-2"
                            type="text"
                            value={frecuenciaFumado}
                            onChange={(e) => setFrecuenciaFumado(e.target.value)}
                            placeholder="Diario / Social"
                            className={ctl}
                          />
                        </div>
                        <div>
                          <label htmlFor="consultati-cantidad-2" className="block text-xs text-fg-muted mb-1">Cantidad</label>
                          <input id="consultati-cantidad-2"
                            type="text"
                            value={cantidadFumado}
                            onChange={(e) => setCantidadFumado(e.target.value)}
                            placeholder="3 cigarrillos al día"
                            className={ctl}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </details>

            {/* Accordion 7: Dieta de Recetas */}
            <details id="sec-dieta" className="group scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border border-border rounded-card overflow-hidden bg-surface">
              <summary className="flex justify-between items-center gap-3 font-semibold px-4 py-3 min-h-12 text-fg bg-surface cursor-pointer select-none group-open:border-b group-open:border-border hover:bg-surface-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-brand-ink" />
                  <span>Diseño del Menú Semanal & Generador de Recetas</span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-fg-subtle" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="bg-surface p-4 sm:p-5 rounded-card border border-border shadow-xs space-y-4">
                  <div className="flex items-center gap-2 text-fg font-semibold">
                    <Calculator className="w-4 h-4 text-brand-ink" />
                    Prescripción Calórica (Déficit/Superávit)
                  </div>

                  {!patient.sexo ? (
                    <p className="text-danger bg-danger-soft border border-danger/20 rounded-control p-3">
                      Complete el sexo del paciente en su ficha para poder calcular la prescripción calórica.
                    </p>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="consultati-1-elija-la-formula" className={ctlLabel}>1. Elija la fórmula de TMB</label>
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
                                aria-pressed={seleccionada}
                                className={`min-h-16 p-3 rounded-control border-2 text-left transition-colors ${seleccionada ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'}`}
                              >
                                <div className="font-semibold text-fg">{etiquetas[f]}</div>
                                <div className="text-heading font-semibold text-brand-ink tabular-nums">{Math.round(tmbCalculado)} <span className="text-xs font-normal text-fg-muted">kcal/día</span></div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {formulaSeleccionada && (
                        <>
                          <label className={ctlLabel}>2. Actividad semanal</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={ctlLabel}>Días de descanso / semana</label>
                              <input id="consultati-1-elija-la-formula"
                                type="number"
                                min={0}
                                max={7}
                                value={diasDescanso}
                                onChange={(e) => { setDiasDescanso(parseInt(e.target.value) || 0); invalidarRestaurado(); }}
                                className={ctl}
                              />
                              <select
                                value={factorActividadDescanso}
                                onChange={(e) => { setFactorActividadDescanso(parseFloat(e.target.value)); invalidarRestaurado(); }}
                                className={`${ctl} mt-1.5`}
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="consultati-dias-de-entrenamiento-semana" className={ctlLabel}>Días de entrenamiento / semana</label>
                              <input id="consultati-dias-de-entrenamiento-semana"
                                type="number"
                                min={0}
                                max={7}
                                value={diasEntrenamiento}
                                onChange={(e) => { setDiasEntrenamiento(parseInt(e.target.value) || 0); invalidarRestaurado(); }}
                                className={ctl}
                              />
                              <select
                                value={factorActividadEntreno}
                                onChange={(e) => { setFactorActividadEntreno(parseFloat(e.target.value)); invalidarRestaurado(); }}
                                className={`${ctl} mt-1.5`}
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-xs text-fg-muted">Nota: pacientes de menos de 60kg — se recomienda usar actividad ligera (Solís, L. 2020).</p>

                          {promedioMantenimiento != null && (
                            <p className="inline-flex flex-wrap items-center gap-2 bg-surface-muted border border-border rounded-full px-3 py-1.5 text-fg-muted font-semibold">
                              Promedio para mantenimiento: <span className="font-semibold text-fg tabular-nums">{Math.round(promedioMantenimiento)} kcal/día</span>
                            </p>
                          )}

                          <div>
                            <label htmlFor="consultati-3-direccion-y-porcentaje" className={ctlLabel}>3. Dirección y porcentaje</label>
                            <SegmentedControl
                              ariaLabel="Dirección de la prescripción"
                              value={direccionPrescripcion}
                              onChange={(d) => { setDireccionPrescripcion(d); if (d === 'MANTENIMIENTO') setPorcentajePrescripcion(0); }}
                              options={(['DEFICIT', 'MANTENIMIENTO', 'SUPERAVIT'] as DireccionPrescripcion[]).map(d => ({
                                value: d,
                                label: d === 'DEFICIT' ? 'Déficit' : d === 'SUPERAVIT' ? 'Superávit' : 'Mantenimiento',
                                icon: d === 'DEFICIT' ? <TrendingDown /> : d === 'SUPERAVIT' ? <TrendingUp /> : <Minus />
                              }))}
                              className="mb-2 sm:w-auto sm:inline-flex"
                            />
                            {direccionPrescripcion !== 'MANTENIMIENTO' && (
                              // Móvil: chips en una fila con scroll horizontal y snap
                              <div role="group" aria-label="Porcentaje de la prescripción" className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory -mx-4 px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
                                {porcentajesParaMostrar.map(pct => (
                                  <button
                                    type="button"
                                    key={pct}
                                    onClick={() => setPorcentajePrescripcion(pct)}
                                    aria-pressed={porcentajePrescripcion === pct}
                                    className={`snap-start shrink-0 min-h-11 px-4 rounded-full text-xs font-semibold border-2 tabular-nums transition-colors ${porcentajePrescripcion === pct ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border bg-surface text-fg-muted hover:border-border-strong'}`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {prescripcionFinal != null && (
                            <div className="bg-brand-soft border border-brand/20 rounded-card p-4 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-xs text-brand-ink font-semibold">Resultado calculado</div>
                                <div className="text-title font-semibold text-brand-ink tabular-nums" aria-live="polite">{Math.round(prescripcionFinal)} <span className="text-body font-medium">kcal/día</span></div>
                              </div>
                              <div className="sm:text-right">
                                <Button size="sm" onClick={handleAplicarPrescripcion}>
                                  Usar este valor
                                </Button>
                                {prescripcionAplicada && (
                                  <p className="text-xs text-success font-semibold mt-1.5 flex items-center gap-1" role="status"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Aplicado a TMB y presupuesto calórico</p>
                                )}
                              </div>
                            </div>
                          )}

                          {plantillasCoincidentes.length > 0 && (
                            <div className="space-y-2">
                              {(patient.alergiasAlimentarias || alimentosNoConsume || alimentosPreferidos) && (
                                <div className="bg-warning-soft border border-warning/25 rounded-control p-3 text-warning">
                                  <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Revisar antes de aplicar una plantilla:</p>
                                  {patient.alergiasAlimentarias && <p>Alergias: {patient.alergiasAlimentarias}</p>}
                                  {alimentosNoConsume && <p>No consume: {alimentosNoConsume}</p>}
                                  {alimentosPreferidos && <p>Prefiere: {alimentosPreferidos}</p>}
                                </div>
                              )}
                              <label className={ctlLabel}>Plantillas sugeridas para este rango</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {plantillasCoincidentes.map(pl => (
                                  <button
                                    type="button"
                                    key={pl.id}
                                    onClick={() => handleAplicarPlantilla(pl)}
                                    className="min-h-14 p-3 rounded-control border border-border bg-surface hover:border-brand/50 hover:bg-brand-soft text-left transition-colors"
                                  >
                                    <div className="font-semibold text-fg">{pl.nombre}</div>
                                    <div className="text-xs text-fg-muted">{pl.caloriaMin}-{pl.caloriaMax} kcal · C:{pl.carbohidratosPct ?? '—'}% P:{pl.proteinasPct ?? '—'}% G:{pl.grasasPct ?? '—'}%</div>
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
                  <div className="bg-surface-muted p-4 rounded-card border border-border">
                    <label className={ctlLabel}>Presupuesto Calórico Diario (kcal)</label>
                    <input id="consultati-3-direccion-y-porcentaje"
                      type="number"
                      value={calorias}
                      onChange={(e) => setCalorias(parseInt(e.target.value) || 0)}
                      className={ctlBold}
                    />
                  </div>
                  <div className="bg-surface-muted p-4 rounded-card border border-border">
                    <label htmlFor="consultati-distribucion-de-macronutrientes-carbohidratos" className={ctlLabel}>Distribución de Macronutrientes (%)</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-fg-muted mb-1">Carbohidratos</label>
                        <input id="consultati-distribucion-de-macronutrientes-carbohidratos"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosCarbohidratosPct}
                          onChange={(e) => setMacrosCarbohidratosPct(e.target.value)}
                          placeholder="ej: 40"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-proteinas" className="block text-xs text-fg-muted mb-1">Proteínas</label>
                        <input id="consultati-proteinas"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosProteinasPct}
                          onChange={(e) => setMacrosProteinasPct(e.target.value)}
                          placeholder="ej: 35"
                          className={ctl}
                        />
                      </div>
                      <div>
                        <label htmlFor="consultati-grasas" className="block text-xs text-fg-muted mb-1">Grasas</label>
                        <input id="consultati-grasas"
                          type="number"
                          min={0}
                          max={100}
                          value={macrosGrasasPct}
                          onChange={(e) => setMacrosGrasasPct(e.target.value)}
                          placeholder="ej: 25"
                          className={ctl}
                        />
                      </div>
                    </div>
                    {(macrosCarbohidratosPct !== '' || macrosProteinasPct !== '' || macrosGrasasPct !== '') && (
                      <p className={`text-xs mt-2 font-semibold ${todosLosMacrosPctLlenos && sumaMacrosPct !== 100 ? 'text-danger' : 'text-fg-muted'}`}>
                        Suma actual: {sumaMacrosPct}% {todosLosMacrosPctLlenos ? (sumaMacrosPct === 100 ? <Check className="inline w-3.5 h-3.5 text-success align-text-bottom" aria-label="correcto" /> : '(debe sumar 100%)') : '(opcional dejar campos en blanco)'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 bg-brand-soft/40 p-4 rounded-card border border-brand/15">
                  <div>
                    <label htmlFor="consultati-desayuno-saludable" className={ctlLabel}>Desayuno Saludable</label>
                    <textarea id="consultati-desayuno-saludable"
                      rows={2}
                      value={desayuno}
                      onChange={(e) => setDesayuno(e.target.value)}
                      placeholder="ej: Gallo pinto ligero con un huevo y queso tierno..."
                      className={ctl}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="consultati-merienda-manana" className={ctlLabel}>Merienda Mañana</label>
                      <input id="consultati-merienda-manana"
                        type="text"
                        value={meriendaMan}
                        onChange={(e) => setMeriendaMan(e.target.value)}
                        placeholder="ej: Manzana picada con almendras"
                        className={ctl}
                      />
                    </div>
                    <div>
                      <label htmlFor="consultati-merienda-tarde" className={ctlLabel}>Merienda Tarde</label>
                      <input id="consultati-merienda-tarde"
                        type="text"
                        value={meriendaTar}
                        onChange={(e) => setMeriendaTar(e.target.value)}
                        placeholder="ej: Yogur descremado con chía"
                        className={ctl}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="consultati-almuerzo-nutritivo" className={ctlLabel}>Almuerzo Nutritivo</label>
                    <textarea id="consultati-almuerzo-nutritivo"
                      rows={2}
                      value={almuerzo}
                      onChange={(e) => setAlmuerzo(e.target.value)}
                      placeholder="ej: Casado ligero con pechuga de pollo a la plancha, frijoles negros y ensalada"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-cena-ligera" className={ctlLabel}>Cena Ligera</label>
                    <textarea id="consultati-cena-ligera"
                      rows={2}
                      value={cena}
                      onChange={(e) => setCena(e.target.value)}
                      placeholder="ej: Fajitas de pescado con pimientos y tortillas de maíz"
                      className={ctl}
                    />
                  </div>
                  <div>
                    <label htmlFor="consultati-indicaciones-clinicas-adicionales" className={ctlLabel}>Indicaciones Clínicas Adicionales</label>
                    <textarea id="consultati-indicaciones-clinicas-adicionales"
                      rows={2}
                      value={indicacionesDieta}
                      onChange={(e) => setIndicacionesDieta(e.target.value)}
                      placeholder="ej: Tomar abundante agua, evitar salsas pesadas, masticar bien..."
                      className={ctl}
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
            <div id="sec-fisio-dolor" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] flex justify-between items-center border-t border-border pt-5">
              <h4 className="text-body font-semibold text-fg flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-brand-ink" />
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
              <div className="space-y-4 bg-surface-muted p-4 sm:p-5 rounded-card border border-border">
                <div>
                  <label htmlFor="consultati-mecanismo-de-lesion-origen" className={ctlLabel}>Mecanismo de Lesión (Origen)</label>
                  <input id="consultati-mecanismo-de-lesion-origen"
                    type="text"
                    value={mecanismoLesion}
                    onChange={(e) => setMecanismoLesion(e.target.value)}
                    placeholder="ej: Trauma rotacional de rodilla en futbol, caída"
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-diagnostico-medico-referencia" className={ctlLabel}>Diagnóstico Médico / Referencia</label>
                  <input id="consultati-diagnostico-medico-referencia"
                    type="text"
                    value={diagnosticoMedico}
                    onChange={(e) => setDiagnosticoMedico(e.target.value)}
                    placeholder="ej: Rotura parcial ligamento colateral medial"
                    className={ctl}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="consultati-tipo-de-dolor" className={ctlLabel}>Tipo de Dolor</label>
                    <select id="consultati-tipo-de-dolor"
                      value={tipoDolor}
                      onChange={(e) => setTipoDolor(e.target.value)}
                      className={ctl}
                    >
                      <option value="Punzante">Punzante</option>
                      <option value="Opresivo">Opresivo</option>
                      <option value="Quemante">Quemante</option>
                      <option value="Sordo y Difuso">Sordo y Difuso</option>
                      <option value="Irradiado">Irradiado</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="consultati-intensidad-eva-0-10" className={ctlLabel}>Intensidad EVA (0-10)</label>
                    <input id="consultati-intensidad-eva-0-10"
                      type="number"
                      min="0"
                      max="10"
                      value={evaDolor}
                      onChange={(e) => setEvaDolor(parseInt(e.target.value) || 0)}
                      className={ctlBold}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="consultati-factores-agravantes" className={ctlLabel}>Factores Agravantes</label>
                  <input id="consultati-factores-agravantes"
                    type="text"
                    value={factoresAgravantes}
                    onChange={(e) => setFactoresAgravantes(e.target.value)}
                    placeholder="ej: Estar de pie, subir gradas"
                    className={ctl}
                  />
                </div>

                <div>
                  <label htmlFor="consultati-factores-atenuantes" className={ctlLabel}>Factores Atenuantes</label>
                  <input id="consultati-factores-atenuantes"
                    type="text"
                    value={factoresAtenuantes}
                    onChange={(e) => setFactoresAtenuantes(e.target.value)}
                    placeholder="ej: Compresa de hielo, acostado"
                    className={ctl}
                  />
                </div>
              </div>
            </div>

            {/* Physical examination (ROM, Daniels) */}
            <div id="sec-fisio-examen" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] bg-surface-muted p-4 sm:p-5 rounded-card border border-border space-y-4">
              <span className="text-body font-semibold text-fg block">Examen Físico Funcional</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="consultati-inspeccion-de-postura" className={ctlLabel}>Inspección de Postura</label>
                  <textarea id="consultati-inspeccion-de-postura"
                    rows={2}
                    value={posturaObservaciones}
                    onChange={(e) => setPosturaObservaciones(e.target.value)}
                    placeholder="ej: Desviación pélvica lateral, retracción..."
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-hallazgos-de-palpacion" className={ctlLabel}>Hallazgos de Palpación</label>
                  <textarea id="consultati-hallazgos-de-palpacion"
                    rows={2}
                    value={palpacionHallazgos}
                    onChange={(e) => setPalpacionHallazgos(e.target.value)}
                    placeholder="ej: Puntos gatillo activos en cuadrado lumbar..."
                    className={ctl}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="consultati-rangos-articulares-rom" className={ctlLabel}>Rangos Articulares (ROM)</label>
                  <input id="consultati-rangos-articulares-rom"
                    type="text"
                    value={romMedido}
                    onChange={(e) => setRomMedido(e.target.value)}
                    placeholder="ej: Flexión de cadera activa 80°"
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-fuerza-escala-daniels-0" className={ctlLabel}>Fuerza Escala Daniels (0-5)</label>
                  <input id="consultati-fuerza-escala-daniels-0"
                    type="text"
                    value={fuerzaDaniels}
                    onChange={(e) => setFuerzaDaniels(e.target.value)}
                    placeholder="ej: 4/5 en cuádriceps derecho"
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-pruebas-ortopedicas-especiales" className={ctlLabel}>Pruebas Ortopédicas Especiales</label>
                  <input id="consultati-pruebas-ortopedicas-especiales"
                    type="text"
                    value={pruebasEspeciales}
                    onChange={(e) => setPruebasEspeciales(e.target.value)}
                    placeholder="ej: Test de Phalen (+), Signo de Lachman (-)"
                    className={ctl}
                  />
                </div>
              </div>
            </div>

            {/* Prescribed physiotherapy interventions */}
            <div id="sec-fisio-prescripcion" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] bg-brand-soft/40 p-4 sm:p-5 rounded-card border border-brand/15 space-y-4">
              <span className="text-body font-semibold text-brand-ink block">Prescripción e Intervenciones</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="consultati-agentes-fisicos-tens-ultrasonido" className={ctlLabel}>Agentes Físicos (TENS, Ultrasonido...)</label>
                  <input id="consultati-agentes-fisicos-tens-ultrasonido"
                    type="text"
                    value={agentesFisicos}
                    onChange={(e) => setAgentesFisicos(e.target.value)}
                    placeholder="ej: TENS convencional 100Hz, crioterapia"
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-terapia-manual-aplicada" className={ctlLabel}>Terapia Manual Aplicada</label>
                  <input id="consultati-terapia-manual-aplicada"
                    type="text"
                    value={terapiaManual}
                    onChange={(e) => setTerapiaManual(e.target.value)}
                    placeholder="ej: Masaje de descarga miofascial"
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-ejercicio-terapeutico-recetado" className={ctlLabel}>Ejercicio Terapéutico Recetado</label>
                  <input id="consultati-ejercicio-terapeutico-recetado"
                    type="text"
                    value={ejercicioTerapeutico}
                    onChange={(e) => setEjercicioTerapeutico(e.target.value)}
                    placeholder="ej: Protocolo de McKenzie, estiramiento isquiotibiales"
                    className={ctl}
                  />
                </div>
              </div>
              <div className="w-full sm:w-48">
                <label htmlFor="consultati-sesiones-sugeridas-para-el" className={ctlLabel}>Sesiones sugeridas para el ciclo</label>
                <input id="consultati-sesiones-sugeridas-para-el"
                  type="number"
                  value={sesionesSugeridas}
                  onChange={(e) => setSesionesSugeridas(parseInt(e.target.value))}
                  className={ctlBold}
                />
              </div>
            </div>

            {/* SOAP Clinical evolution note */}
            <div id="sec-fisio-soap" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] bg-surface-muted p-4 sm:p-5 rounded-card border border-border space-y-4">
              <span className="text-body font-semibold text-fg block">Nota de Evolución Clínica Diaria (Estándar SOAP)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="consultati-s-subjetivo-reporte-del" className={ctlLabel}>S (Subjetivo): Reporte del paciente</label>
                  <textarea id="consultati-s-subjetivo-reporte-del"
                    rows={2}
                    value={soapSubjetivo}
                    onChange={(e) => setSoapSubjetivo(e.target.value)}
                    placeholder="Paciente reporta dolor punzante en hombro izquierdo antes de empezar..."
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-o-objetivo-mediciones-de" className={ctlLabel}>O (Objetivo): Mediciones de hoy</label>
                  <textarea id="consultati-o-objetivo-mediciones-de"
                    rows={2}
                    value={soapObjetivo}
                    onChange={(e) => setSoapObjetivo(e.target.value)}
                    placeholder="Se mide flexión activa de hombro a 100° sin dolor, espasmo leve paravertebral..."
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-a-analisis-conclusion-de" className={ctlLabel}>A (Análisis): Conclusión de la sesión</label>
                  <textarea id="consultati-a-analisis-conclusion-de"
                    rows={2}
                    value={soapAnalisis}
                    onChange={(e) => setSoapAnalisis(e.target.value)}
                    placeholder="Respuesta favorable al estiramiento balístico, mejora de dolor post termoterapia..."
                    className={ctl}
                  />
                </div>
                <div>
                  <label htmlFor="consultati-p-plan-tareas-y" className={ctlLabel}>P (Plan): Tareas y siguiente sesión</label>
                  <textarea id="consultati-p-plan-tareas-y"
                    rows={2}
                    value={soapPlan}
                    onChange={(e) => setSoapPlan(e.target.value)}
                    placeholder="Continuar con estiramientos cada 4 horas en casa. Próxima cita lunes..."
                    className={ctl}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* General annotations */}
        <div id="sec-observaciones" className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] border-t border-border pt-5">
          <label htmlFor="consultati-observaciones-generales-y-recomendaciones" className={ctlLabel}>Observaciones Generales y Recomendaciones al Paciente</label>
          <textarea id="consultati-observaciones-generales-y-recomendaciones"
            rows={2}
            value={anotaciones}
            onChange={(e) => setAnotaciones(e.target.value)}
            placeholder="Consejos extras que saldrán en el reporte final..."
            className={ctl}
          />
        </div>
      </div>

      {/* Action triggers */}
      <div className="sticky bottom-0 z-20 px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur-sm border-t border-border shadow-[0_-4px_12px_rgba(15,23,42,0.06)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
        <Button variant="secondary" onClick={onCancel} icon={<X className="w-4 h-4" aria-hidden="true" />} className="max-sm:w-full">
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting} icon={isSubmitting ? undefined : <Save className="w-4 h-4" aria-hidden="true" />} className="max-sm:w-full">
          {isSubmitting ? 'Guardando…' : editingConsultation ? 'Guardar cambios y ver reporte' : 'Guardar consulta y ver reporte'}
        </Button>
      </div>
    </form>
  );
}
