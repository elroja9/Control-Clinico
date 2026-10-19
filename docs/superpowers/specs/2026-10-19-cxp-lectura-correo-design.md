# CxP: lectura de facturas de proveedor por correo (IMAP)

## Contexto

Hoy una compra se registra en CxP subiendo a mano el XML del proveedor (`POST /api/cxp/importar-xml`).
El ERP-Elrotech (`D:\erp-elrotech\src\correoProveedores.ts` + `correoProveedoresRoutes.ts`) ya lee esas
facturas del buzón de la empresa y las deja en una bandeja para que una persona las importe. Se porta
ese diseño a Control-Clínico.

## Decisiones (confirmadas con el usuario)

1. **Mismo diseño que el ERP**: proceso cada 5 min, buzón IMAP en solo lectura, ventana de 45 días, avance
   por UID y por carpeta (con UIDVALIDITY), solo adjuntos XML/ZIP, filtro "compra de esta empresa"
   (emisor ≠ empresa; receptor = empresa o ausente en tiquete), bandeja con Importar/Descartar.
2. **La bandeja no crea CxP**: Importar reutiliza el importador actual (`/api/cxp/importar-xml`) con el XML
   guardado y luego marca el comprobante `IMPORTADA` con el id de la CxP.
3. **Solo Factura (01) y Tiquete (04)**: el importador no soporta notas de crédito/débito; se descartan al recolectar.
4. **Contraseña IMAP cifrada** con `encryptSecret` (igual que SMTP); nunca viaja al navegador.
5. **Proceso automático solo en producción** (el `.env` de desarrollo apunta a la BD de producción).
6. Si al recolectar la factura ya existe en `cuentas_pagar` (mismo `numeroFacturaProveedor` + cédula del
   proveedor, no anulada), entra a la bandeja ya `IMPORTADA` apuntando a esa CxP.

## Fuera de alcance

Notas de crédito/débito, crear CxP sin intervención humana, PDFs.

## Datos (`docs/sql/2026-10-19-cxp-correo.sql`, se aplica a mano)

- `compania_imap_config`: `idCompania` (único), `imapHost`, `imapPort`, `imapSeguro` (1 = TLS directo 993,
  0 = STARTTLS), `imapUsuario`, `imapPasswordCifrado`, `imapCarpeta` (varias separadas por coma),
  `activo`, `avance` (JSON por carpeta), `verificadaEn`.
- `facturas_proveedor_correo`: metadatos del comprobante, `xml` LONGTEXT, `estado`
  `PENDIENTE|IMPORTADA|DESCARTADA`, `idCuentaPagar`, `motivoDescarte`, `procesadoEn`, único `(idCompania, clave)`.
  Fechas como VARCHAR (convención de la BD).

## Módulos

- `server/correoProveedores.ts`: colector IMAP portado del ERP (`recolectarComprobantes`,
  `verificarConexionImap`, `listarCarpetas`, funciones puras `extraerMetadatosComprobante`,
  `esCompraDeLaEmpresa`, `partesXmlDelMensaje`, `extraerXmlDeZip`, `carpetasDe`).
- `server.ts`: endpoints y proceso.
  - `GET/POST /api/imap-config`, `POST /api/imap-config/probar`, `GET /api/imap-config/carpetas`
  - `GET /api/facturas-correo?estado=`, `GET /api/facturas-correo/:id/xml`,
    `POST /api/facturas-correo/:id/estado`, `POST /api/facturas-correo/revisar-ahora`
  - Cambiar host o usuario reinicia el avance; cambiar credenciales borra `verificadaEn`.
  - Un `Set` de empresas en revisión evita dos sesiones IMAP simultáneas (proceso + botón).
  - El avance solo se guarda si todos los comprobantes del lote se guardaron.
  - Sin BD conectada estos endpoints responden 503 (la bandeja no tiene modo memoria).
- UI: sección "Correo entrante (facturas de proveedores)" en CompanySettings; panel
  "Facturas recibidas por correo" en CxPManager.

## Pruebas

`server/correoProveedores.test.ts`: metadatos (factura, tiquete, nota de crédito rechazada, moneda USD),
`esCompraDeLaEmpresa`, `partesXmlDelMensaje`, `carpetasDe`.
