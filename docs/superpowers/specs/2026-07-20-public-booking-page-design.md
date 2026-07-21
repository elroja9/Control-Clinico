# Página Pública de Citas con Validación de Traslado — Diseño

## Contexto

Hoy, agendar una cita en Control-Clínico requiere que un miembro del personal
(rol `Administrador` o `Profesional`) inicie sesión y use `AgendaCalendar.tsx`.
No existe ninguna vía para que un paciente (nuevo o existente) agende su
propia cita sin pasar por el personal, y no existe ningún concepto de
"visita a domicilio" ni de ubicación geográfica en el sistema.

Este trabajo agrega una página pública (sin login) donde cualquier persona
puede: escoger una clínica, escoger un profesional de esa clínica, escoger
si la cita es en el consultorio o en su domicilio, ver solo los horarios
realmente disponibles, y — si es a domicilio — validar que su ubicación
esté dentro del tiempo de traslado que ese profesional acepta, calculado
con la API de Google Maps.

## Objetivo

1. Página pública (`/agendar`, sin autenticación) para agendar citas.
2. Selección: clínica (empresa activa) → profesional de esa clínica → tipo
   de visita (consultorio/domicilio) → fecha/hora (solo espacios libres).
3. Para visitas a domicilio: el paciente indica su dirección (autocompletado
   de Google Places o su ubicación GPS actual), el sistema calcula el
   tiempo de traslado real (Google Distance Matrix, del lado del servidor)
   desde la ubicación principal del profesional, y **bloquea** el agendado
   si excede el máximo que ese profesional acepta.
4. El tiempo de traslado se **reserva en la agenda** del profesional (antes
   y después de la cita), para que no se le agende otra cita encima del
   traslado.
5. Cada profesional configura su propia ubicación principal y su tiempo
   máximo de traslado aceptado, en una pantalla nueva de autoservicio
   ("Mi Perfil"), separada de la administración de usuarios ya existente.
6. Cada empresa configura su horario de atención (día por día) desde el
   inicio — no un horario fijo genérico.
7. La cita creada desde esta página queda **confirmada de inmediato**
   (`PROGRAMADA`), igual que si la creara el personal. Dura 45 minutos si
   es en consultorio, 60 minutos si es a domicilio (valores fijos, sin que
   el paciente los elija).
8. El paciente puede ser nuevo o ya existir (se busca por cédula dentro de
   esa empresa); si no existe, se crea con los datos básicos del
   formulario.
9. Aplica tanto a profesionales de perfil Nutrición como Fisioterapia.

## Fuera de alcance

- Pasarela de pago o cobro por la visita a domicilio.
- Optimización de rutas entre citas consecutivas: el tiempo de traslado
  siempre se calcula entre la ubicación principal fija del profesional y
  la dirección del paciente — nunca entre dos citas a domicilio
  consecutivas entre sí. Si un profesional tiene varias visitas a
  domicilio el mismo día, cada una se valida y se bloquea en el calendario
  de forma independiente contra la ubicación principal, no entre ellas.
- Cancelar/reprogramar desde la página pública — solo agenda inicial.
- Notificación por correo de la cita agendada desde esta página (ya existe
  el mecanismo de `/api/notifications/send`; se puede enchufar después,
  no es parte de este alcance).
- Autenticación/portal de paciente — la página es pública, sin cuenta.

## Modelo de datos

### `Company` — horario de atención

```ts
export interface HorarioDia {
  abre: string | null;   // 'HH:MM', null = cerrado ese día
  cierra: string | null; // 'HH:MM'
}

export interface HorarioAtencion {
  lunes: HorarioDia;
  martes: HorarioDia;
  miercoles: HorarioDia;
  jueves: HorarioDia;
  viernes: HorarioDia;
  sabado: HorarioDia;
  domingo: HorarioDia;
}
```

Se agrega `horarioAtencion: HorarioAtencion` a la interfaz `Company`, y una
columna `horarioAtencion JSON NULL` en `companias` (mismo patrón que las
columnas JSON ya usadas en `consultas`, p.ej. `antropometria`). Default
sugerido para empresas existentes (grandfathering, igual que `estadoSaas`):
lunes-viernes 08:00-18:00, sábado 08:00-12:00, domingo cerrado — asignado
por la propia app al leer una empresa sin `horarioAtencion` configurado
(no requiere backfill en la migración: si la columna es `NULL`, el backend
aplica este default en memoria al servir la respuesta).

### `User` — ubicación del profesional

```ts
export interface User {
  // ...campos existentes...
  ubicacionDireccion: string | null;       // dirección formateada (Google Places)
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  maxTiempoTrasladoMinutos: number;        // default 45
}
```

Columnas nuevas en `usuarios`: `ubicacionDireccion VARCHAR(255) NULL`,
`ubicacionLat DECIMAL(10,7) NULL`, `ubicacionLng DECIMAL(10,7) NULL`,
`maxTiempoTrasladoMinutos INT NOT NULL DEFAULT 45`.

### `Cita` — tipo de visita y traslado

```ts
export interface Cita {
  // ...campos existentes...
  tipoVisita: 'CONSULTORIO' | 'DOMICILIO';
  direccionDomicilio?: string | null;
  pacienteLat?: number | null;
  pacienteLng?: number | null;
  tiempoTrasladoMinutos?: number | null; // una vía, solo si DOMICILIO
}
```

Columnas nuevas en `citas`: `tipoVisita VARCHAR(20) NOT NULL DEFAULT
'CONSULTORIO'`, `direccionDomicilio VARCHAR(255) NULL`, `pacienteLat
DECIMAL(10,7) NULL`, `pacienteLng DECIMAL(10,7) NULL`,
`tiempoTrasladoMinutos INT NULL`.

**Bloque efectivo en la agenda:** para una cita `DOMICILIO` con
`tiempoTrasladoMinutos = T` que empieza en `fechaHora` y dura
`duracionMinutos = D`, el rango que ocupa en la agenda del profesional es
`[fechaHora − T, fechaHora + D + T]` (ida y vuelta desde su ubicación
principal). Para `CONSULTORIO`, el rango es simplemente `[fechaHora,
fechaHora + D]`, igual que hoy.

## Backend

### `server/googleMaps.ts` (nuevo)

```ts
export async function calcularTiempoTrasladoMinutos(params: {
  origenLat: number;
  origenLng: number;
  destinoLat: number;
  destinoLng: number;
}): Promise<number>
```

Llama a la Google Distance Matrix API (`GOOGLE_MAPS_API_KEY` desde `.env`,
ya configurada) con `mode=driving`, y devuelve la duración en minutos
(`duration.value / 60`, redondeado). Si Google devuelve una fila sin ruta
posible (`NOT_FOUND`/`ZERO_RESULTS`), lanza un error que el endpoint que lo
llama traduce a un 400 claro para el paciente ("No se pudo calcular la
ruta a esa dirección").

Esta es la fuente de verdad para la validación — nunca se confía en un
tiempo de traslado calculado en el navegador.

### Endpoints públicos nuevos (sin autenticación)

- **`GET /api/public/clinicas`** — devuelve las empresas con `estadoSaas =
  'ACTIVA'` (id, nombreComercial, perfilCompania, logoUrl, colorPrimario,
  colorSidebar) — nada sensible (sin identificación fiscal, sin SMTP, etc).

- **`GET /api/public/clinicas/:id/profesionales`** — usuarios de esa
  empresa con `activo = true` (id, nombre, rol) — nunca se exponen
  `usuario`/`contrasena`/`correo`.

- **`GET /api/public/disponibilidad?idUsuario=&fecha=&tipoVisita=`** —
  calcula los espacios libres de ese profesional en esa fecha:
  1. Obtiene `horarioAtencion` de la empresa de ese usuario para el día de
     la semana de `fecha` (o el default si es `NULL`). Si ese día está
     cerrado, devuelve lista vacía.
  2. Genera slots candidatos cada 30 minutos dentro del horario de
     apertura/cierre (la duración real de la cita — 45 min consultorio /
     60 min domicilio, ver Objetivo — se usa para calcular qué candidatos
     quedan libres en el paso 4, aunque el intervalo entre candidatos sea
     siempre de 30 min).
  3. Descarta los que caen dentro de un `calendar_blocks` de ese
     profesional (mismo `isSlotBlocked` que ya usa `AgendaCalendar.tsx`,
     portado al backend).
  4. Descarta los que se solapan con el **bloque efectivo** (ver arriba)
     de cualquier cita ya existente de ese profesional ese día — usando la
     duración fija según `tipoVisita` (ver Objetivo) para el slot
     candidato mismo.
  5. Devuelve la lista de horas `HH:MM` libres.

- **`GET /api/public/clinicas/:id/pacientes/:identificacion`** — busca un
  paciente existente de esa empresa por cédula. Devuelve `{ nombreCompleto,
  telefono, correoElectronico, tipoIdentificacion }` si existe (200), o 404
  si no. El frontend lo llama al completar el campo de cédula en el paso 5,
  para auto-rellenar el resto del formulario cuando el paciente ya existe,
  en vez de esperar hasta el envío final para saberlo.

- **`POST /api/public/citas`** — body: `{ idCompania, idUsuarioNutricionista,
  fechaHora, tipoVisita, direccionDomicilio?, pacienteLat?, pacienteLng?,
  paciente: { identificacion, tipoIdentificacion, nombreCompleto, telefono,
  correoElectronico } }`.
  1. Busca un `Patient` con esa `identificacion` en esa `idCompania`; si no
     existe, lo crea con los campos del formulario y el resto de campos
     clínicos vacíos/por defecto (igual que hoy hace el registro de
     paciente desde `PatientForm.tsx`, pero con un subconjunto mínimo de
     campos).
  2. Si `tipoVisita === 'DOMICILIO'`: llama
     `calcularTiempoTrasladoMinutos` con la ubicación del profesional
     (`ubicacionLat`/`ubicacionLng` — si el profesional no tiene ubicación
     configurada, responde 400 "Este profesional no tiene ubicación
     configurada para visitas a domicilio") y la del paciente. Si el
     resultado excede `maxTiempoTrasladoMinutos` del profesional, responde
     400 con el tiempo calculado y el máximo aceptado, sin crear la cita.
  3. Vuelve a verificar que el slot sigue libre (mismo chequeo que
     `disponibilidad`, para evitar condiciones de carrera entre dos
     personas agendando el mismo espacio) — 409 si ya no está libre.
  4. Crea la `Cita` con `estadoCita: 'PROGRAMADA'` y los campos de
     traslado si aplica. Devuelve la cita creada.

### Extensión de endpoints existentes

- `POST /api/companies`: agrega `horarioAtencion` (JSON.stringify) al
  INSERT/UPDATE.
- `POST /api/users`: agrega `ubicacionDireccion`, `ubicacionLat`,
  `ubicacionLng`, `maxTiempoTrasladoMinutos` al INSERT/UPDATE.

## Frontend

### Ruteo simple sin librería nueva

Este proyecto no usa `react-router` (todo `App.tsx` es un switch de estado
sobre un solo componente). Se agrega, en el punto de entrada (`src/main.tsx`
o el inicio de `App.tsx`), una revisión de `window.location.pathname`:
si es `/agendar`, se renderiza `<PublicBooking />` en vez del flujo normal
(que empieza con `LoginView` si no hay `currentUser`) — sin agregar
`react-router-dom` como dependencia nueva.

### `src/components/PublicBooking.tsx` (nuevo)

Flujo de un solo formulario con pasos (wizard), sin necesidad de guardar
estado entre pasos en el servidor:

1. **Clínica** — grid de tarjetas, una por empresa de `GET
   /api/public/clinicas`.
2. **Profesional** — lista de `GET
   /api/public/clinicas/:id/profesionales` de la clínica escogida.
3. **Tipo de visita y fecha/hora** — selector Consultorio/Domicilio, luego
   un calendario simple (día por día) que llama `GET
   /api/public/disponibilidad` para pintar solo las horas libres.
4. **Dirección** (solo si Domicilio) — campo de autocompletado de Google
   Places (Maps JavaScript API cargada con la API key, restringida por
   referrer) + botón "Usar mi ubicación actual" (Geolocation API del
   navegador). Al confirmar la dirección, se muestra un resumen
   ("agendando aquí, profesional revisará el tiempo de traslado al
   confirmar" — la validación real y bloqueante ocurre en el paso 6 contra
   el servidor, el frontend no calcula el tiempo por su cuenta).
5. **Datos del paciente** — campo de cédula primero; al completarlo se
   llama `GET /api/public/clinicas/:id/pacientes/:identificacion` — si
   existe, se auto-rellenan nombre/teléfono/correo (editable igual, por si
   cambiaron); si no, se piden esos datos vacíos.
6. **Confirmar** — `POST /api/public/citas`. Si el backend rechaza por
   tiempo de traslado excedido o por slot ya ocupado, se muestra el error
   y se regresa al paso correspondiente (4 o 3).

### "Mi Perfil" (pestaña nueva en la app autenticada)

Visible para cualquier usuario logueado (`Administrador` o `Profesional`),
edita únicamente su propio registro: dirección principal (autocompletado
de Google Places) + tiempo máximo de traslado aceptado (minutos). Usa el
mismo `POST /api/users` ya existente (upsert), enviando solo estos campos
más su `id` actual.

### `CompanySettings.tsx` — sección "Horario de Atención"

Nueva sección (mismo patrón visual que SMTP/Hacienda/Usuarios): una fila
por día de la semana, con apertura/cierre o un checkbox "Cerrado".

## Casos límite

- Profesional sin ubicación configurada: no puede recibir citas a
  domicilio (el backend lo rechaza explícitamente, ver endpoint de
  reserva); en la página pública, si un profesional no tiene ubicación
  configurada, la opción "Domicilio" se deshabilita para él con un
  mensaje.
- Empresa sin `horarioAtencion` configurado: se usa el default en memoria
  (lunes-viernes 08:00-18:00, sábado medio día, domingo cerrado) sin
  necesidad de backfill en la base de datos.
- Dirección del paciente no ubicable por Google (dirección inválida o
  fuera de Costa Rica): la creación de la cita se rechaza con un mensaje
  claro, no se agenda nada.
- Dos personas agendando el mismo espacio simultáneamente: el `POST
  /api/public/citas` reverifica disponibilidad antes de insertar y
  responde 409 si ya se ocupó, mostrando un mensaje para escoger otro
  horario.
- Empresa `PENDIENTE` o `SUSPENDIDA`: nunca aparece en `GET
  /api/public/clinicas`, así que no es posible agendarle citas desde esta
  página mientras esté en ese estado.
