import { ArrowLeft, Printer } from 'lucide-react';

interface Bloque {
  sub: string;
  pasos: string[];
}

interface Seccion {
  id: string;
  titulo: string;
  intro: string;
  bloques: Bloque[];
  nota?: string;
}

// El contenido se arma según el perfil: un despacho legal no ve consultas ni reportería, y una clínica no ve casos.
const secciones = (esLegal: boolean): Seccion[] => {
  const pac = esLegal ? 'cliente' : 'paciente';
  const pacs = esLegal ? 'clientes' : 'pacientes';
  const empresa = esLegal ? 'Despacho' : 'Clínica';
  const lista: (Seccion | false)[] = [
    {
      id: 'inicio',
      titulo: 'Primeros pasos',
      intro: 'Cómo ingresar al sistema y moverse entre sus secciones.',
      bloques: [
        {
          sub: 'Iniciar sesión',
          pasos: [
            'Escriba su usuario o correo y su contraseña, y pulse "Iniciar sesión".',
            'Si olvidó la contraseña, pulse "¿Olvidó su contraseña?", indique su usuario o correo y recibirá una contraseña temporal de 8 dígitos.',
            'Para registrar una empresa nueva, use "Registrar empresa", complete los datos de la empresa y del usuario administrador. La cuenta queda pendiente hasta que el equipo de TuanisBooking la active.'
          ]
        },
        {
          sub: 'Navegación',
          pasos: [
            'El menú de la izquierda agrupa las secciones en Clínica / Despacho, Finanzas y Configuración. En el celular se abre con el botón de menú de la barra superior.',
            'Los números junto a cada sección indican registros, citas sin confirmar o cuentas pendientes.',
            'Cada sección tiene su propia dirección: puede guardarla en favoritos, refrescar la página sin perder la sección y usar el botón "Atrás" del navegador.',
            'Si sale de una sección con un formulario a medio llenar, el sistema le pedirá confirmación para no perder lo digitado.',
            'Para terminar, pulse "Salir" en la barra superior.'
          ]
        }
      ]
    },
    {
      id: 'configuracion',
      titulo: `Configuración inicial (Personalizar ${empresa})`,
      intro: 'Antes de atender y facturar, complete estos apartados en este orden. Solo el Administrador debe modificarlos.',
      bloques: [
        {
          sub: 'Identidad de marca y datos fiscales',
          pasos: [
            'Pulse "Editar Marca" para cambiar nombre comercial, razón social, cédula física o jurídica, dirección (provincia, cantón, distrito y otras señas), colores y logo.',
            'Indique el código de actividad económica de Hacienda y el correo emisor de facturas.'
          ]
        },
        {
          sub: 'Horario de atención',
          pasos: [
            'Marque los días y horas en que se atiende y pulse "Guardar Horario". La agenda y las reservas en línea solo ofrecen espacios dentro de este horario.'
          ]
        },
        {
          sub: 'Servicios y tarifas',
          pasos: [
            'Pulse "Nuevo Servicio o Artículo". Un servicio es una sesión o cita (con duración); un artículo es un producto con existencias.',
            'El código CABYS (13 dígitos) es obligatorio para poder facturar.',
            'Puede usar "Cargar Servicios por Defecto" para empezar con un catálogo sugerido según su perfil y luego ajustar precios.',
            'En los artículos, "Ajustar Stock" corrige las existencias.'
          ]
        },
        {
          sub: 'Firma digital de Hacienda (facturación electrónica)',
          pasos: [
            'Suba el certificado criptográfico (.p12), escriba el PIN del certificado y el usuario y contraseña de ATV.',
            'Elija el ambiente: "Pruebas Locales" (no envía nada a Hacienda), "Sandbox" (pruebas de Hacienda) o "Producción" (facturas reales).',
            'Pulse "Probar Configuración" y luego "Guardar Configuración Hacienda". El sistema avisa si el certificado está vencido.'
          ]
        },
        {
          sub: 'Correo de salida (SMTP)',
          pasos: [
            'Elija el proveedor (Google o Microsoft), escriba el correo remitente y la contraseña de aplicación, y pulse "Guardar Configuración SMTP".',
            'Active las notificaciones de agenda y el recordatorio automático si desea que se envíen confirmaciones y recordatorios de citas.'
          ]
        },
        {
          sub: 'Correo entrante (facturas de proveedores)',
          pasos: [
            'Configure el buzón al que sus proveedores envían las facturas electrónicas y pulse "Guardar correo entrante".',
            'El sistema revisa ese buzón cada 5 minutos, en solo lectura (no marca, mueve ni borra correos), y deja las facturas en la bandeja de Cuentas por Pagar.'
          ]
        },
        {
          sub: 'Usuarios y colaboradores',
          pasos: [
            'Pulse "Nuevo Colaborador", indique nombre, usuario, correo, contraseña y rol (Administrador o Profesional), y pulse "Guardar Colaborador".',
            'Un colaborador inactivo ya no puede ingresar. La cantidad de usuarios depende de su plan.'
          ]
        },
        ...(esLegal ? [] : [{
          sub: 'Nutrición: porcentajes y plantillas de dieta',
          pasos: [
            'Defina los porcentajes de déficit o superávit calórico que usa en sus prescripciones.',
            'Cree plantillas de dieta para reutilizarlas en el menú semanal de las consultas.'
          ]
        }])
      ]
    },
    {
      id: 'resumen',
      titulo: 'Resumen',
      intro: `Pantalla de inicio con los indicadores del día: citas de hoy, ${pacs}${esLegal ? ', casos abiertos y documentos pendientes o vencidos' : ' y consultas por especialidad'}.`,
      bloques: [
        { sub: 'Uso', pasos: ['Pulse cualquier indicador para ir directo a la sección correspondiente.'] }
      ]
    },
    {
      id: 'pacientes',
      titulo: esLegal ? 'Clientes' : 'Pacientes / Expedientes',
      intro: `Registro de los datos personales de cada ${pac}.`,
      bloques: [
        {
          sub: `Registrar un ${pac}`,
          pasos: [
            `Pulse "${esLegal ? 'Registrar cliente' : 'Registrar expediente'}".`,
            'Complete los campos obligatorios (marcados con *): nombre completo y número de identificación. El tipo de cédula (física, jurídica o extranjero) se usa al facturar.',
            ...(esLegal ? [] : ['Agregue antecedentes como fracturas, cirugías, alergias o padecimientos; aparecen como resumen en la ficha.']),
            `Pulse "${esLegal ? 'Guardar cliente' : 'Guardar expediente'}".`
          ]
        },
        {
          sub: 'Buscar y administrar',
          pasos: [
            'Use el buscador por nombre o cédula.',
            'El lápiz edita los datos personales y la papelera elimina el registro (pide confirmación).',
            ...(esLegal
              ? ['"Ver casos" muestra los casos de ese cliente.']
              : ['"Nueva consulta" abre el formulario de atención; "Editar última" abre la consulta más reciente.'])
          ]
        }
      ]
    },
    {
      id: 'agenda',
      titulo: 'Agenda y calendario',
      intro: 'Programación de citas por profesional, con avisos por correo.',
      bloques: [
        {
          sub: 'Ver la agenda',
          pasos: [
            'Cambie entre las vistas Mes, Semana y Día, y avance o retroceda con las flechas.',
            'Filtre por profesional o vea "Todos los especialistas".',
            'El "Resumen del Día" lista las citas de la fecha seleccionada.'
          ]
        },
        {
          sub: 'Crear o editar una cita',
          pasos: [
            `Pulse "Nueva cita" o un espacio "Disponible". Busque al ${pac} por nombre o cédula.`,
            'Elija servicio, profesional, fecha, hora y duración, y el estado de la cita.',
            `Las notas internas de agenda no se envían al ${pac}.`,
            'Puede marcar la cita como visita a domicilio; el sistema usa la dirección del profesional (Mi Perfil) para estimar el traslado.',
            'Pulse "Crear cita". Si el correo está configurado, se envía la notificación automáticamente.'
          ]
        },
        {
          sub: 'Acciones sobre una cita',
          pasos: [
            ...(esLegal ? [] : ['"Iniciar consulta" abre el formulario clínico con el paciente ya cargado.']),
            '"Facturar" emite la factura electrónica del servicio de la cita.',
            '"Cancelar cita" la anula (pide confirmación). Cancelar una cita ya facturada NO anula su factura: hágalo aparte desde Facturación.'
          ]
        },
        {
          sub: 'Bloquear horarios',
          pasos: [
            'Pulse "Bloquear horario" para reservar un espacio sin citas (capacitación, asunto personal).',
            'Marque "Todo el día" o "Bloquear varios días" para vacaciones, con fecha de inicio y fin.',
            'Los bloqueos tampoco se ofrecen en las reservas en línea.'
          ]
        }
      ]
    },
    !esLegal && {
      id: 'consultas',
      titulo: 'Consultas clínicas',
      intro: 'Registro de la atención de fisioterapia o nutrición y su reporte.',
      bloques: [
        {
          sub: 'Fisioterapia',
          pasos: [
            'Registre el motivo de consulta, el diagnóstico médico o referencia y la intensidad del dolor (escala EVA 0-10).',
            'Marque las zonas de dolor en el mapa anatómico digital.',
            'Complete el examen físico: postura, palpación, fuerza (escala Daniels 0-5) y factores agravantes y atenuantes.',
            'Indique la prescripción: agentes físicos (TENS, ultrasonido…), ejercicio terapéutico, frecuencia e indicaciones.'
          ]
        },
        {
          sub: 'Nutrición',
          pasos: [
            'Registre la antropometría (estatura, peso, circunferencias), la composición corporal y los exámenes de laboratorio.',
            'Complete la evaluación dietética y el estilo de vida (sueño, ejercicio, hábitos).',
            'El sistema calcula el IMC y la tasa metabólica basal; elija el factor de actividad y la prescripción calórica (déficit, mantenimiento o superávit).',
            'Ajuste la distribución de macronutrientes y diseñe el menú semanal, partiendo de una plantilla si lo desea.'
          ]
        },
        {
          sub: 'Guardar y reporte',
          pasos: [
            'Pulse "Guardar consulta y ver reporte".',
            'En el reporte puede imprimirlo o guardarlo en PDF ("Imprimir / PDF"), enviarlo por correo al paciente y facturar la consulta.',
            '"Marcar como cerrada" finaliza la consulta; "Reabrir consulta" permite modificarla otra vez.'
          ]
        },
        {
          sub: 'Historial de citas',
          pasos: [
            'Lista todas las consultas registradas, con buscador.',
            '"Ver reporte" abre el reporte; la papelera elimina la consulta (pide confirmación).'
          ]
        }
      ]
    },
    esLegal && {
      id: 'casos',
      titulo: 'Casos y documentos',
      intro: 'Control de los expedientes del despacho y de los documentos que debe aportar cada cliente.',
      bloques: [
        {
          sub: 'Crear un caso',
          pasos: [
            'Elija el cliente y escriba el título del caso (obligatorios).',
            'Agregue materia, número de expediente judicial y ubicación física de la carpeta.',
            'Pulse "Guardar". El estado puede ser Abierto o Cerrado.'
          ]
        },
        {
          sub: 'Documentos pendientes',
          pasos: [
            'Agregue cada documento requerido con su fecha límite.',
            'Defina cada cuántos días se le recuerda al cliente por correo los documentos pendientes.',
            'Los documentos pendientes y vencidos se muestran en el Resumen.'
          ]
        }
      ]
    },
    {
      id: 'facturacion',
      titulo: 'Facturación electrónica',
      intro: 'Emisión y control de comprobantes electrónicos ante Hacienda.',
      bloques: [
        {
          sub: 'Emitir una factura',
          pasos: [
            `Desde una cita${esLegal ? '' : ' o desde el reporte de una consulta'}, pulse "Facturar".`,
            'Revise las líneas y el subtotal, elija el medio de pago (efectivo, tarjeta o SINPE Móvil) y, si es efectivo, el monto recibido.',
            'Pulse "Emitir Factura". La opción "Modo prueba" genera el comprobante sin enviarlo a Hacienda.'
          ]
        },
        {
          sub: 'Historial de comprobantes',
          pasos: [
            'Ver / Imprimir / Reenviar: abre el comprobante, permite imprimirlo y enviarlo de nuevo al correo del cliente.',
            'Verificar estado con Hacienda: consulta si el comprobante fue aceptado o rechazado.',
            'Nota de Crédito parcial: rebaja una parte de la factura, indicando el motivo.',
            'Nota de Débito: aumenta el monto de una factura.',
            'Anular factura: emite una nota de crédito total con su motivo. Solo el Administrador puede anular.'
          ]
        },
        {
          sub: 'Cuentas por cobrar',
          pasos: [
            'Debajo del historial se listan las facturas a crédito con su estado: Pendiente, Cobrado o Vencido.',
            'Pulse "Registrar Abono" para anotar un pago con su monto, medio de pago y referencia (por ejemplo, el número de SINPE).'
          ]
        }
      ]
    },
    {
      id: 'cxp',
      titulo: 'Cuentas por pagar y proveedores',
      intro: 'Registro de compras y gastos y de lo que se debe a cada proveedor.',
      bloques: [
        {
          sub: 'Proveedores',
          pasos: ['Registre y edite los proveedores antes de cargar sus facturas.']
        },
        {
          sub: 'Registrar una compra',
          pasos: [
            'Pulse "Registrar Compra" y elija el tipo: "Gasto (sin inventario)" o "Compra de Artículos" (suma existencias al inventario).',
            'Indique proveedor, monto total con IVA, referencia y plazo de crédito en días.',
            'También puede usar "Cargar Factura XML" para importar la compra directamente desde el XML de la factura electrónica del proveedor; revise los datos y pulse "Confirmar e Importar".'
          ]
        },
        {
          sub: 'Facturas recibidas por correo',
          pasos: [
            'Si configuró el correo entrante, las facturas de proveedores aparecen en la bandeja como Pendientes.',
            'Pulse "Importar" para convertirla en cuenta por pagar o "Descartar" si no corresponde. "Revisar correo ahora" fuerza una revisión inmediata.'
          ]
        },
        {
          sub: 'Pagos',
          pasos: [
            'Cada cuenta muestra su estado: Pendiente, Pagado o Vencido.',
            'Pulse "Registrar Abono" para anotar un pago parcial o total.'
          ]
        }
      ]
    },
    {
      id: 'fiscales',
      titulo: 'Reportes fiscales',
      intro: 'Apoyo para preparar la declaración de IVA (D-104) y de renta (D-101).',
      bloques: [
        {
          sub: 'Uso',
          pasos: [
            'Elija el período (D-104) o el año fiscal (D-101).',
            'El D-104 muestra el débito fiscal de las ventas, el crédito fiscal de las compras y las ventas exentas.',
            'El D-101 calcula ventas netas, gastos deducibles, utilidad neta y el impuesto de renta estimado. Agregue los gastos anuales adicionales (planilla, alquileres) para afinar el cálculo y use "Ver desglose por tramos".',
            'Si hay comprobantes sin resolver en Hacienda, el sistema le avisa: verifíquelos antes de declarar.'
          ]
        }
      ],
      nota: 'Las cifras son una guía basada en lo registrado en el sistema; confirme siempre con su contador antes de presentar la declaración. En régimen simplificado el reporte es solo informativo.'
    },
    !esLegal && {
      id: 'reporteria',
      titulo: 'Reportería',
      intro: 'Indicadores de atención: pacientes atendidos, pacientes nuevos, sesiones completadas y tasa de asistencia.',
      bloques: [
        {
          sub: 'Uso',
          pasos: [
            'Elija vista mensual o un rango personalizado de fechas.',
            'Revise la tendencia mensual y el detalle por paciente.',
            'Pulse "Exportar CSV" para abrir los datos en Excel.'
          ]
        }
      ]
    },
    {
      id: 'perfil',
      titulo: 'Mi perfil',
      intro: 'Datos del profesional para las visitas a domicilio.',
      bloques: [
        {
          sub: 'Uso',
          pasos: [
            'Escriba su dirección principal y el tiempo máximo de traslado que acepta (en minutos).',
            'La agenda usa estos datos al programar visitas a domicilio.'
          ]
        }
      ]
    },
    {
      id: 'reservas',
      titulo: 'Reservas en línea',
      intro: `Página pública donde sus ${pacs} agendan una cita sin llamar.`,
      bloques: [
        {
          sub: 'Compartir el enlace',
          pasos: [
            'Use "Copiar enlace" o "Compartir" para enviarlo por WhatsApp, redes sociales o correo, y "Ver página" para revisarla.',
            `El ${pac} elige profesional, servicio, tipo de visita (en consultorio o a domicilio) y horario disponible, y escribe sus datos.`,
            'En Personalizar se define si las citas en línea se auto-confirman o requieren confirmación manual; las pendientes se cuentan en el menú de Agenda.'
          ]
        }
      ]
    },
    {
      id: 'problemas',
      titulo: 'Solución de problemas',
      intro: 'Situaciones frecuentes y qué hacer.',
      bloques: [
        {
          sub: 'Preguntas frecuentes',
          pasos: [
            'Una factura aparece como rechazada o sin respuesta: use "Verificar estado con Hacienda". Si fue rechazada, corrija el dato (por ejemplo, CABYS o cédula del cliente) y emita una nueva.',
            'No llegan los correos: revise la configuración SMTP; con Gmail u Outlook debe usar una contraseña de aplicación, no la contraseña normal.',
            'No se puede facturar un servicio: verifique que tenga código CABYS de 13 dígitos y que la firma digital esté configurada y vigente.',
            'No aparece un horario en la agenda o en reservas: revise el horario de atención y los bloqueos.',
            'Olvidó la contraseña: use "¿Olvidó su contraseña?" en la pantalla de ingreso, o pida al Administrador que la cambie en Usuarios y Colaboradores.'
          ]
        }
      ]
    }
  ];
  return lista.filter((s): s is Seccion => !!s);
};

interface Props {
  esLegal: boolean;
  nombreEmpresa: string;
  themeColor: string;
  onClose: () => void;
}

export default function ManualUsuario({ esLegal, nombreEmpresa, themeColor, onClose }: Props) {
  const contenido = secciones(esLegal);
  // El índice usa scrollIntoView: un enlace #id rompería la navegación, que vive en el hash (#/manual)
  const irA = (id: string) => document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 shrink-0 flex items-center justify-center gap-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Volver</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Manual de usuario</h2>
            <p className="text-xs text-slate-600">Para descargarlo, pulse "Descargar PDF" y elija "Guardar como PDF"</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-10 flex items-center gap-1.5 px-3 rounded-xl text-white text-xs font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: themeColor }}
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Descargar PDF
        </button>
      </div>

      <article className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-8 print:border-none print:shadow-none print:p-0">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: themeColor }}>TuanisBooking · {nombreEmpresa}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Manual de usuario</h1>
          <p className="text-sm text-slate-600 mt-1">Guía paso a paso de cada sección del sistema.</p>
        </header>

        <nav aria-label="Contenido del manual" className="print:break-after-page">
          <h2 className="text-sm font-bold text-slate-900 mb-2">Contenido</h2>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal pl-5">
            {contenido.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => irA(s.id)} className="block text-slate-700 hover:underline text-left">{s.titulo}</button>
              </li>
            ))}
          </ol>
        </nav>

        {contenido.map((s, i) => (
          <section key={s.id} id={`manual-${s.id}`} className="scroll-mt-24 space-y-3 break-inside-avoid-page">
            <h2 className="text-lg font-bold text-slate-900">{i + 1}. {s.titulo}</h2>
            <p className="text-sm text-slate-600">{s.intro}</p>
            {s.bloques.map(b => (
              <div key={b.sub} className="break-inside-avoid">
                <h3 className="text-sm font-bold text-slate-800 mt-3 mb-1">{b.sub}</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  {b.pasos.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
            ))}
            {s.nota && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{s.nota}</p>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
