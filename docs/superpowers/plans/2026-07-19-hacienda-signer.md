# Firmador XAdES-EPES para Hacienda Costa Rica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the verified `haciendaSigner.ts` (XAdES-EPES signer for Costa Rica electronic invoices) from the sister project `POS--RESTAURANTE` into Control-Clinico, wired to encrypted certificate storage and two callable endpoints (verify certificate, sign a given XML) — no invoice UI or Hacienda API submission yet.

**Architecture:** A new server-only module `server/haciendaSigner.ts` (ported verbatim — this is proven cryptographic logic, not something to rewrite) exposes `verificarLlaveP12` and `firmarXadesEpes`. The existing `compania_hacienda_config` table (already defined in `ConsultorioDB_schema.sql`, unused until now) stores the certificate/PIN/ATV credentials encrypted with the same AES-256-GCM helper (`server/crypto.ts`) already used for SMTP passwords. A small UI section in `CompanySettings.tsx` uploads the certificate and offers a "Probar Configuración" button.

**Tech Stack:** Same as the rest of the app (Express/MySQL2/React/TypeScript) plus five new dependencies for XAdES/PKCS12: `node-forge`, `xadesjs`, `@xmldom/xmldom`, `xpath`, `xml-core`.

## Global Constraints

- No test runner is configured in this project — verification is manual `curl`/`node` checks.
- **This handles real cryptographic secrets.** Never log, echo, print, or include in any report/commit the contents of a `.p12` file, a certificate PIN, or an ATV password — not even a truncated/partial value. Error messages must describe *what* is wrong (e.g. "PIN incorrecto") without including the secret itself.
- **Never use the user's real `certificado.p12` (at `D:\administrador\Documents\certificado.p12`) for automated verification.** For automated testing, generate a throwaway self-signed `.p12` with `node-forge` (a few lines — see Task 5) and discard it after. The user's real certificate is only ever exercised by the user themselves, manually, through the browser UI.
- `certificado_p12_enc` and `certificado_password_enc`/`password_atv_enc` come back from MySQL as Node `Buffer` objects (they're `LONGBLOB`/`VARBINARY` columns) — always call `.toString()` on them before treating them as the encrypted string `encryptSecret`/`decryptSecret` expect.
- `certificado_vence_en` is a MySQL `DATE` column — it comes back from `mysql2` as a JS `Date` object, which `res.json()` serializes as a full ISO datetime, not `YYYY-MM-DD`. Format it explicitly with `.toISOString().split('T')[0]` wherever it's read from the DB and returned to the client.
- Follow the existing dual-mode pattern (`dbConnected && pool` vs in-memory fallback) used throughout `server.ts` — `compania_hacienda_config` uses `id_compania` as its own primary key (one row per company, no separate auto-increment `id`), so upserts key on `id_compania`, not on a generic `id` like `citas`/`compania_smtp_config` do.
- Protect the shared live database (real remote MySQL, one real company `id_compania: 7`) exactly as in every prior task in this project's history: use throwaway test data for verification and clean it up, confirming with a follow-up read; confirm no dev server is left listening on port 3000 afterward.
- There is a pre-existing, unrelated uncommitted change to `index.html` in the working tree (the user's own in-progress edit). Do not touch, revert, or commit that file.

---

### Task 1: Dependencies and the ported `server/haciendaSigner.ts` module

**Files:**
- Modify: `package.json`
- Create: `server/haciendaSigner.ts`

**Interfaces:**
- Produces: `verificarLlaveP12(p12Base64: string, pin: string): InfoCertificadoP12`, `firmarXadesEpes(xml: string, p12Base64: string, pin: string): Promise<string>`, and the `InfoCertificadoP12` interface (`{ sujeto, emisor, numeroSerie, validoDesde, validoHasta, expirado }`) — consumed by Task 2 (`verificarLlaveP12`) and Task 3 (`firmarXadesEpes`).

- [ ] **Step 1: Add the five dependencies to `package.json`**

In `"dependencies"`, add (alphabetically, matching the file's existing ordering):
```json
    "@xmldom/xmldom": "^0.8.13",
```
right after `"@vitejs/plugin-react": "^5.0.4",`, and:
```json
    "node-forge": "^1.4.0",
```
right after `"mysql2": "^3.23.0",`, and:
```json
    "xadesjs": "^2.6.7",
    "xml-core": "^1.2.5",
    "xpath": "^0.0.34"
```
right after `"vite": "^6.2.3"` (as the new last three entries — remember to add a trailing comma to the `vite` line above them).

In `"devDependencies"`, add:
```json
    "@types/node-forge": "^1.3.14",
```
right after `"@types/nodemailer": "^6.4.17",`.

- [ ] **Step 2: Run `npm install`**

Run: `npm install`
Expected: installs all five packages (plus the one devDependency) with no errors. Confirm `node_modules/xadesjs` and `node_modules/node-forge` exist.

- [ ] **Step 3: Create `server/haciendaSigner.ts`**

This is a verbatim port of the proven implementation at `D:\pos-restaurante\POS--RESTAURANTE\src\haciendaSigner.ts` — do not rewrite the cryptographic logic, only adjust import paths if `npm run lint` reports a resolution error (there should be none, since all five dependencies now exist in this project too):

```typescript
// Firma XAdES-EPES de comprobantes electrónicos de Hacienda Costa Rica, ejecutada en este mismo
// proceso — reemplaza el proxy externo CRLibre (api.crlibre.org): ese dominio nunca fue un servicio
// público, CRLibre/API_Hacienda es software de auto-hospedaje obligatorio (AGPL v3).
//
// Import exclusivo del servidor: no lo importe desde componentes React (usa node:crypto y
// node-forge, no existen en el navegador).

import { webcrypto, randomUUID } from 'node:crypto';
import forge from 'node-forge';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { Application, SignedXml, Parse } from 'xadesjs';
import { Stringify, setNodeDependencies } from 'xml-core';

// Motor de Web Crypto nativo de Node (disponible desde Node 19+) — evita depender del polyfill
// @peculiar/webcrypto que usan las referencias comunitarias de este mismo firmador.
Application.setEngine('NodeJS', webcrypto as unknown as Crypto);

// Node no trae DOMParser/XMLSerializer/XPath nativos como el navegador — xml-core (del que
// depende xadesjs) los busca aquí en vez de asumir un engine por defecto.
setNodeDependencies({ DOMParser, XMLSerializer, xpath });

// Identificador y hash de la política de firma XAdES-EPES vigente para Hacienda Costa Rica.
// Verificados contra el ejemplo OFICIAL que trae el propio Ministerio de Hacienda en
// "ANEXOS Y ESTRUCTURAS_V4.4.pdf" (página 86 de 98, cuatro ejemplos de firma distintos,
// todos consistentes en este mismo valor) — NO el identificador de 2016
// (tribunet.hacienda.go.cr/.../DGT-R-48-2016.pdf) que trae el paquete comunitario
// "haciendacostarica-signer" en npm: ese dominio y resolución están desactualizados y Hacienda
// rechazaría la firma con ellos.
const POLITICA_FIRMA_URL =
  'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
const POLITICA_FIRMA_HASH_SHA256 = 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';

const ALGORITMO_FIRMA: RsaHashedImportParams = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256'
};

interface LlavesP12 {
  certificadoBase64: string; // DER (X.509), base64
  llavePrivadaBase64: string; // DER (PKCS8), base64 — formato que crypto.subtle.importKey('pkcs8', ...) exige
  llavePublicaBase64: string; // DER (SPKI), base64 — formato que crypto.subtle.importKey('spki', ...) exige
}

function derToBase64(asn1Obj: forge.asn1.Asn1): string {
  return forge.util.encode64(forge.asn1.toDer(asn1Obj).getBytes());
}

// Separa el .p12 (PKCS12) de la empresa en certificado + llave privada (PKCS8) + llave pública
// (SPKI), todas en DER/base64.
function separarP12(p12Base64: string, pin: string): LlavesP12 {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.decode64(p12Base64));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, true, pin);
  } catch (err) {
    throw new Error('No se pudo leer la llave criptográfica (.p12): verifique el archivo y el PIN configurados en Configuración de Emisor.');
  }

  const keyBags = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])
    .concat(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  if (keyBags.length === 0 || !keyBags[0].key) {
    throw new Error('La llave criptográfica (.p12) no contiene una llave privada válida.');
  }
  if (certBags.length === 0 || !certBags[0].cert) {
    throw new Error('La llave criptográfica (.p12) no contiene un certificado válido.');
  }

  const privateKey = keyBags[0].key;
  const cert = certBags[0].cert!;

  const privateKeyInfo = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey));
  const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

  return {
    certificadoBase64: derToBase64(forge.pki.certificateToAsn1(cert)),
    llavePrivadaBase64: derToBase64(privateKeyInfo),
    llavePublicaBase64: derToBase64(forge.pki.publicKeyToAsn1(publicKey))
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(base64, 'base64')).buffer;
}

export interface InfoCertificadoP12 {
  sujeto: string;
  emisor: string;
  numeroSerie: string;
  validoDesde: string;
  validoHasta: string;
  expirado: boolean;
}

/**
 * Verifica que la llave criptográfica (.p12) y su PIN sean legibles, sin firmar nada.
 * Devuelve datos del certificado (sujeto/emisor/vigencia).
 */
export function verificarLlaveP12(p12Base64: string, pin: string): InfoCertificadoP12 {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.decode64(p12Base64));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, true, pin);
  } catch (err) {
    throw new Error('No se pudo leer la llave criptográfica (.p12): verifique el archivo y el PIN configurados en Configuración de Emisor.');
  }

  const keyBags = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])
    .concat(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  if (keyBags.length === 0 || !keyBags[0].key) {
    throw new Error('La llave criptográfica (.p12) no contiene una llave privada válida.');
  }
  if (certBags.length === 0 || !certBags[0].cert) {
    throw new Error('La llave criptográfica (.p12) no contiene un certificado válido.');
  }

  const cert = certBags[0].cert!;
  const ahora = new Date();
  const attrsToString = (attrs: forge.pki.CertificateField[]) =>
    attrs.map(a => `${a.shortName || a.name || a.type}=${a.value}`).join(', ');

  return {
    sujeto: attrsToString(cert.subject.attributes),
    emisor: attrsToString(cert.issuer.attributes),
    numeroSerie: cert.serialNumber,
    validoDesde: cert.validity.notBefore.toISOString(),
    validoHasta: cert.validity.notAfter.toISOString(),
    expirado: ahora > cert.validity.notAfter || ahora < cert.validity.notBefore
  };
}

/**
 * Firma un XML de Hacienda Costa Rica (Factura o Nota de Crédito Electrónica) con XAdES-EPES,
 * usando la llave criptográfica (.p12) y el PIN de la empresa.
 */
export async function firmarXadesEpes(xml: string, p12Base64: string, pin: string): Promise<string> {
  const { certificadoBase64, llavePrivadaBase64, llavePublicaBase64 } = separarP12(p12Base64, pin);

  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(llavePrivadaBase64),
    ALGORITMO_FIRMA,
    false,
    ['sign']
  );
  const publicKey = await webcrypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(llavePublicaBase64),
    ALGORITMO_FIRMA,
    true,
    ['verify']
  );

  // Sanitizar la cadena eliminando firmas previas antes de pasarla al parser de xadesjs.
  const xmlSinFirmaPrevia = xml.replace(/<(?:\w+:)?Signature\b[\s\S]*?<\/(?:\w+:)?Signature>/g, '');

  const documento = Parse(xmlSinFirmaPrevia);
  const firmador = new SignedXml();

  const firma = await firmador.Sign(
    ALGORITMO_FIRMA,
    privateKey,
    documento,
    {
      keyValue: publicKey,
      references: [{
        id: `Reference-${randomUUID()}`,
        uri: '',
        hash: 'SHA-256',
        transforms: ['enveloped']
      }],
      signerRole: { claimed: ['ObligadoTributario'] },
      x509: [certificadoBase64],
      // El ejemplo oficial de Hacienda usa SHA-1 consistentemente para este digest específico
      // (el del certificado, no el del documento ni el de la política) en sus cuatro ejemplos de
      // firma — se respeta esa convención en vez del default SHA-256 de la librería.
      signingCertificate: { certificate: certificadoBase64, digestAlgorithm: 'SHA-1' },
      policy: {
        hash: 'SHA-256',
        digestValue: POLITICA_FIRMA_HASH_SHA256,
        identifier: {
          qualifier: 'OIDAsURI',
          value: POLITICA_FIRMA_URL
        }
      }
    }
  );

  documento.documentElement.appendChild(firma.GetXml());
  return Stringify(documento);
}
```

- [ ] **Step 4: Verify with `npm run lint`**

Run: `npm run lint`
Expected: no errors. If there's a type error on `Application.setEngine`/`webcrypto as unknown as Crypto` or similar, that's an acceptable minimal type-assertion adjustment — do not change the underlying logic or algorithm choices to work around a type error.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/haciendaSigner.ts
git commit -m "feat: port XAdES-EPES Hacienda signer module from POS--RESTAURANTE"
```

---

### Task 2: Data model and encrypted certificate storage endpoints

**Files:**
- Modify: `src/data/mockData.ts` (append at end)
- Modify: `server.ts` (imports; new `localHaciendaConfigs` fallback array; new `GET/POST /api/hacienda-config` endpoints)

**Interfaces:**
- Produces: `HaciendaConfig`, `HaciendaConfigInput` types (consumed by Task 4); `GET /api/hacienda-config/:idCompania`, `POST /api/hacienda-config` (consumed by Task 4).
- Consumes: `encryptSecret`/`decryptSecret` (already imported in `server.ts` — add `decryptSecret`, `encryptSecret` is already there); `verificarLlaveP12` (Task 1).

- [ ] **Step 1: Append types to `src/data/mockData.ts`**

At the end of the file (after `defaultCalendarBlocks`), add:

```typescript

export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  tienePasswordAtv: boolean;
  tieneCertificado: boolean;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null; // YYYY-MM-DD
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  passwordAtv?: string; // solo cuando el usuario escribe una nueva
  certificadoP12Base64?: string; // solo cuando el usuario sube un nuevo archivo .p12
  certificadoNombreArchivo?: string; // nombre del archivo nuevo, acompaña a certificadoP12Base64
  certificadoPin?: string; // solo cuando el usuario escribe un nuevo PIN
};
```

- [ ] **Step 2: Update the crypto import in `server.ts`**

Find:
```typescript
import { encryptSecret } from "./server/crypto";
```
replace with:
```typescript
import { encryptSecret, decryptSecret } from "./server/crypto";
import { verificarLlaveP12 } from "./server/haciendaSigner";
```

- [ ] **Step 3: Add the in-memory fallback type and array**

Find (the line added by the calendar-blocking feature):
```typescript
let localCalendarBlocks = [...defaultCalendarBlocks];
```
add immediately after it:
```typescript

interface LocalHaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  passwordAtvCifrado: string;
  certificadoP12Cifrado: string;
  certificadoPinCifrado: string;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null;
}
let localHaciendaConfigs: LocalHaciendaConfig[] = [];
```

- [ ] **Step 4: Add the two endpoints, right after `DELETE /api/calendar-blocks/:id` (before the `// 6. SMTP Configs` comment)**

Find:
```typescript
  app.delete("/api/calendar-blocks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (dbConnected && pool) {
        await pool.query("DELETE FROM calendar_blocks WHERE id = ?", [id]);
        res.json({ success: true });
      } else {
        localCalendarBlocks = localCalendarBlocks.filter(item => item.id !== id);
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. SMTP Configs
```
replace with:
```typescript
  app.delete("/api/calendar-blocks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (dbConnected && pool) {
        await pool.query("DELETE FROM calendar_blocks WHERE id = ?", [id]);
        res.json({ success: true });
      } else {
        localCalendarBlocks = localCalendarBlocks.filter(item => item.id !== id);
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Hacienda Digital Signature Config
  app.get("/api/hacienda-config/:idCompania", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.idCompania);

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (!row) {
          return res.json({
            idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null
          });
        }
        res.json({
          idCompania: row.id_compania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuario_atv || '',
          tienePasswordAtv: !!row.password_atv_enc,
          tieneCertificado: !!row.certificado_p12_enc,
          certificadoNombreArchivo: row.certificado_nombre_archivo,
          certificadoVenceEn: row.certificado_vence_en ? new Date(row.certificado_vence_en).toISOString().split('T')[0] : null
        });
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (!row) {
          return res.json({
            idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null
          });
        }
        res.json({
          idCompania: row.idCompania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuarioAtv || '',
          tienePasswordAtv: !!row.passwordAtvCifrado,
          tieneCertificado: !!row.certificadoP12Cifrado,
          certificadoNombreArchivo: row.certificadoNombreArchivo,
          certificadoVenceEn: row.certificadoVenceEn
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hacienda-config", async (req, res) => {
    try {
      const b = req.body;
      const idCompania = parseInt(b.idCompania);

      let existing: { passwordAtvCifrado: string; certificadoP12Cifrado: string; certificadoPinCifrado: string; certificadoNombreArchivo: string | null } | undefined;

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT password_atv_enc, certificado_p12_enc, certificado_password_enc, certificado_nombre_archivo FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (row) {
          existing = {
            passwordAtvCifrado: row.password_atv_enc ? row.password_atv_enc.toString() : '',
            certificadoP12Cifrado: row.certificado_p12_enc ? row.certificado_p12_enc.toString() : '',
            certificadoPinCifrado: row.certificado_password_enc ? row.certificado_password_enc.toString() : '',
            certificadoNombreArchivo: row.certificado_nombre_archivo
          };
        }
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (row) {
          existing = {
            passwordAtvCifrado: row.passwordAtvCifrado,
            certificadoP12Cifrado: row.certificadoP12Cifrado,
            certificadoPinCifrado: row.certificadoPinCifrado,
            certificadoNombreArchivo: row.certificadoNombreArchivo
          };
        }
      }

      const passwordAtvCifrado = b.passwordAtv && String(b.passwordAtv).trim()
        ? encryptSecret(String(b.passwordAtv).trim())
        : (existing?.passwordAtvCifrado || '');

      const certificadoP12Cifrado = b.certificadoP12Base64 && String(b.certificadoP12Base64).trim()
        ? encryptSecret(String(b.certificadoP12Base64).trim())
        : (existing?.certificadoP12Cifrado || '');

      const certificadoPinCifrado = b.certificadoPin && String(b.certificadoPin).trim()
        ? encryptSecret(String(b.certificadoPin).trim())
        : (existing?.certificadoPinCifrado || '');

      const certificadoNombreArchivo = b.certificadoNombreArchivo || existing?.certificadoNombreArchivo || null;

      let certificadoVenceEn: string | null = null;
      if (certificadoP12Cifrado && certificadoPinCifrado) {
        try {
          const p12Base64 = decryptSecret(certificadoP12Cifrado);
          const pin = decryptSecret(certificadoPinCifrado);
          const info = verificarLlaveP12(p12Base64, pin);
          certificadoVenceEn = info.validoHasta.split('T')[0];
        } catch (err: any) {
          return res.status(400).json({ error: err.message });
        }
      }

      if (dbConnected && pool) {
        const [exists] = await pool.query("SELECT id_compania FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        if ((exists as any).length > 0) {
          await pool.query(
            "UPDATE compania_hacienda_config SET ambiente = ?, usuario_atv = ?, password_atv_enc = ?, certificado_p12_enc = ?, certificado_password_enc = ?, certificado_nombre_archivo = ?, certificado_vence_en = ? WHERE id_compania = ?",
            [b.ambiente, b.usuarioAtv || '', passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado, certificadoNombreArchivo, certificadoVenceEn, idCompania]
          );
        } else {
          await pool.query(
            "INSERT INTO compania_hacienda_config (id_compania, ambiente, usuario_atv, password_atv_enc, certificado_p12_enc, certificado_password_enc, certificado_nombre_archivo, certificado_vence_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, b.ambiente, b.usuarioAtv || '', passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado, certificadoNombreArchivo, certificadoVenceEn]
          );
        }
      } else {
        const index = localHaciendaConfigs.findIndex(c => c.idCompania === idCompania);
        const stored: LocalHaciendaConfig = {
          idCompania, ambiente: b.ambiente, usuarioAtv: b.usuarioAtv || '',
          passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado,
          certificadoNombreArchivo, certificadoVenceEn
        };
        if (index !== -1) {
          localHaciendaConfigs[index] = stored;
        } else {
          localHaciendaConfigs.push(stored);
        }
      }

      res.json({
        idCompania,
        ambiente: b.ambiente,
        usuarioAtv: b.usuarioAtv || '',
        tienePasswordAtv: !!passwordAtvCifrado,
        tieneCertificado: !!certificadoP12Cifrado,
        certificadoNombreArchivo,
        certificadoVenceEn
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. SMTP Configs
```

- [ ] **Step 5: Verify with `npm run lint`**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Verify manually with a synthetic certificate (NEVER the user's real one)**

Generate a throwaway self-signed `.p12` for testing:
```bash
node -e "
const forge = require('node-forge');
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(Date.now() + 365*24*60*60*1000);
const attrs = [{ name: 'commonName', value: 'Test Signer' }, { name: 'countryName', value: 'CR' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'test1234');
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
console.log(Buffer.from(p12Der, 'binary').toString('base64'));
" > /tmp/test-cert-base64.txt
wc -c /tmp/test-cert-base64.txt
```

With `npm run dev` running, using a throwaway `idCompania` (e.g. `9002`):
```bash
P12B64=$(cat /tmp/test-cert-base64.txt)
curl -s -X POST http://localhost:3000/api/hacienda-config -H "Content-Type: application/json" -d "{\"idCompania\":9002,\"ambiente\":\"SANDBOX\",\"usuarioAtv\":\"test@example.com\",\"passwordAtv\":\"pw123\",\"certificadoP12Base64\":\"$P12B64\",\"certificadoPin\":\"test1234\",\"certificadoNombreArchivo\":\"test.p12\"}"
curl -s http://localhost:3000/api/hacienda-config/9002
```
Expected: POST returns `tieneCertificado: true`, `tienePasswordAtv: true`, `certificadoVenceEn` set to ~1 year from now, and no encrypted fields present. GET returns the same non-sensitive shape. Test with an intentionally wrong PIN (e.g. `"certificadoPin":"wrongpin"`) and confirm a `400` with a clear error message, and that nothing was saved (a follow-up GET shows the previous state unchanged). Delete the throwaway `idCompania: 9002` row afterward (`DELETE FROM compania_hacienda_config WHERE id_compania = 9002` via a one-off script if `dbConnected`) and confirm it's gone. Stop the dev server and confirm port 3000 is free. Delete `/tmp/test-cert-base64.txt` and the throwaway `.p12` — nothing sensitive, but no reason to leave test artifacts around.

- [ ] **Step 7: Commit**

```bash
git add src/data/mockData.ts server.ts
git commit -m "feat: add encrypted Hacienda certificate storage endpoints"
```

---

### Task 3: Certificate verification and signing endpoints

**Files:**
- Modify: `server.ts` (import `firmarXadesEpes`; add `cargarCertificadoEmpresa` helper + two endpoints, right after Task 2's `POST /api/hacienda-config`)

**Interfaces:**
- Consumes: `firmarXadesEpes`, `verificarLlaveP12` (Task 1); `decryptSecret` (already imported by Task 2); `localHaciendaConfigs` (Task 2).
- Produces: `POST /api/hacienda/verificar-certificado`, `POST /api/hacienda/firmar` — consumed by Task 4 (the "Probar Configuración" button) and by any future invoice-signing caller.

- [ ] **Step 1: Update the haciendaSigner import**

Find:
```typescript
import { verificarLlaveP12 } from "./server/haciendaSigner";
```
replace with:
```typescript
import { verificarLlaveP12, firmarXadesEpes } from "./server/haciendaSigner";
```

- [ ] **Step 2: Add the helper and two endpoints, right after the `POST /api/hacienda-config` handler from Task 2**

```typescript

  async function cargarCertificadoEmpresa(idCompania: number): Promise<{ p12Base64: string; pin: string } | null> {
    let certificadoP12Cifrado: string | undefined;
    let certificadoPinCifrado: string | undefined;

    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT certificado_p12_enc, certificado_password_enc FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
      const row = (rows as any[])[0];
      certificadoP12Cifrado = row?.certificado_p12_enc ? row.certificado_p12_enc.toString() : undefined;
      certificadoPinCifrado = row?.certificado_password_enc ? row.certificado_password_enc.toString() : undefined;
    } else {
      const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
      certificadoP12Cifrado = row?.certificadoP12Cifrado || undefined;
      certificadoPinCifrado = row?.certificadoPinCifrado || undefined;
    }

    if (!certificadoP12Cifrado || !certificadoPinCifrado) return null;

    return {
      p12Base64: decryptSecret(certificadoP12Cifrado),
      pin: decryptSecret(certificadoPinCifrado)
    };
  }

  app.post("/api/hacienda/verificar-certificado", async (req, res) => {
    try {
      const idCompania = parseInt(req.body.idCompania);
      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "No se ha configurado un certificado criptográfico (.p12) para esta empresa." });
      }
      const info = verificarLlaveP12(cert.p12Base64, cert.pin);
      res.json(info);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/hacienda/firmar", async (req, res) => {
    try {
      const idCompania = parseInt(req.body.idCompania);
      const xml = req.body.xml;
      if (!xml || typeof xml !== 'string') {
        return res.status(400).json({ error: "Falta el XML a firmar." });
      }
      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "No se ha configurado un certificado criptográfico (.p12) para esta empresa." });
      }
      const xmlFirmado = await firmarXadesEpes(xml, cert.p12Base64, cert.pin);
      res.json({ xmlFirmado });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
```

- [ ] **Step 3: Verify with `npm run lint`**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify manually with the synthetic certificate**

Reuse the same throwaway `.p12`/`idCompania: 9002` approach from Task 2 (regenerate if needed — a fresh self-signed cert is fine, it doesn't need to match a previous run).

```bash
curl -s -X POST http://localhost:3000/api/hacienda/verificar-certificado -H "Content-Type: application/json" -d '{"idCompania":9002}'
```
Expected: `200` with `{ sujeto, emisor, numeroSerie, validoDesde, validoHasta, expirado: false }` reflecting the synthetic cert's `commonName=Test Signer`.

```bash
curl -s -X POST http://localhost:3000/api/hacienda/firmar -H "Content-Type: application/json" -d '{"idCompania":9002,"xml":"<?xml version=\"1.0\"?><FacturaElectronica><Clave>123</Clave></FacturaElectronica>"}'
```
Expected: `200` with `{ xmlFirmado: "<?xml ...><FacturaElectronica>...<ds:Signature ...>...<xades:QualifyingProperties ...>...</ds:Signature></FacturaElectronica>" }` — confirm the returned XML contains a `Signature` element with `SignedInfo`, `SignatureValue`, `KeyInfo`/`X509Certificate`, and a `QualifyingProperties`/`SignedProperties` block referencing the policy URL from Task 1. Confirm calling with a nonexistent `idCompania` (e.g. `9999`) returns `400` with the "No se ha configurado..." message, not a crash.

Clean up the throwaway `compania_hacienda_config` row for `idCompania: 9002` and confirm removal. Stop the dev server, confirm port 3000 is free.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: add certificate verification and XML signing endpoints"
```

---

### Task 4: `CompanySettings.tsx` — certificate upload and "Probar Configuración" UI

**Files:**
- Modify: `src/components/CompanySettings.tsx`

**Interfaces:**
- Consumes: `HaciendaConfig`, `HaciendaConfigInput` (Task 2); `GET /api/hacienda-config/:idCompania`, `POST /api/hacienda-config`, `POST /api/hacienda/verificar-certificado` (Tasks 2-3).

This component manages its own local fetch/save for this config (not threaded through `App.tsx` props like `smtpConfigs`) because, unlike SMTP config, no other component needs Hacienda config data — keeping it self-contained matches the "solo el módulo firmador" scope and avoids widening `App.tsx`/`AgendaCalendarProps` for a feature nothing else consumes yet.

- [ ] **Step 1: Add imports**

Find:
```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput } from '../data/mockData';
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Database, Copy, Mail, Server } from 'lucide-react';
```
replace with:
```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput } from '../data/mockData';
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Database, Copy, Mail, Server, ShieldCheck, Upload, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Add state, after the SMTP state block (find `const [smtpActivo, setSmtpActivo] = useState(false);`)**

Find:
```typescript
  const [smtpActivo, setSmtpActivo] = useState(false);
```
add immediately after it:
```typescript

  // --- Hacienda Digital Signature State ---
  const [haciendaAmbiente, setHaciendaAmbiente] = useState<'SANDBOX' | 'PRODUCCION'>('SANDBOX');
  const [haciendaUsuarioAtv, setHaciendaUsuarioAtv] = useState('');
  const [haciendaPasswordAtv, setHaciendaPasswordAtv] = useState('');
  const [haciendaTienePasswordAtv, setHaciendaTienePasswordAtv] = useState(false);
  const [haciendaCertificadoBase64, setHaciendaCertificadoBase64] = useState('');
  const [haciendaCertificadoNombreNuevo, setHaciendaCertificadoNombreNuevo] = useState('');
  const [haciendaCertificadoPin, setHaciendaCertificadoPin] = useState('');
  const [haciendaTieneCertificado, setHaciendaTieneCertificado] = useState(false);
  const [haciendaCertificadoNombreArchivo, setHaciendaCertificadoNombreArchivo] = useState<string | null>(null);
  const [haciendaCertificadoVenceEn, setHaciendaCertificadoVenceEn] = useState<string | null>(null);
  const [haciendaGuardando, setHaciendaGuardando] = useState(false);
  const [haciendaMensaje, setHaciendaMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [haciendaProbando, setHaciendaProbando] = useState(false);
  const [haciendaInfoCertificado, setHaciendaInfoCertificado] = useState<{ sujeto: string; emisor: string; validoHasta: string; expirado: boolean } | null>(null);
```

- [ ] **Step 3: Fetch the config when the selected company changes**

Find the existing SMTP-sync `useEffect` (`useEffect(() => { const matched = smtpConfigs.find(...`) and add a new, separate `useEffect` right after that entire effect (after its closing `}, [selectedCompanyId, smtpConfigs]);`):

```typescript

  // Sync Hacienda config when company changes
  useEffect(() => {
    setHaciendaMensaje(null);
    setHaciendaInfoCertificado(null);
    setHaciendaCertificadoBase64('');
    setHaciendaCertificadoNombreNuevo('');
    setHaciendaCertificadoPin('');
    fetch(`/api/hacienda-config/${selectedCompanyId}`)
      .then(res => res.json())
      .then((data: HaciendaConfig) => {
        setHaciendaAmbiente(data.ambiente);
        setHaciendaUsuarioAtv(data.usuarioAtv);
        setHaciendaPasswordAtv('');
        setHaciendaTienePasswordAtv(data.tienePasswordAtv);
        setHaciendaTieneCertificado(data.tieneCertificado);
        setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
        setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
      })
      .catch(err => console.error('Error cargando configuración de Hacienda:', err));
  }, [selectedCompanyId]);
```

- [ ] **Step 4: Add the file-to-base64 handler and save/test handlers, after `handleSaveSmtp`**

Find the end of `handleSaveSmtp` (`alert('¡Configuración SMTP y notificaciones guardadas con éxito!'); };`) and add immediately after it:

```typescript

  const handleCertificadoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const base64 = btoa(new Uint8Array(result).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      setHaciendaCertificadoBase64(base64);
      setHaciendaCertificadoNombreNuevo(file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveHacienda = async (e: React.FormEvent) => {
    e.preventDefault();
    setHaciendaGuardando(true);
    setHaciendaMensaje(null);
    try {
      const payload: HaciendaConfigInput = {
        idCompania: selectedCompanyId,
        ambiente: haciendaAmbiente,
        usuarioAtv: haciendaUsuarioAtv,
        ...(haciendaPasswordAtv.trim() ? { passwordAtv: haciendaPasswordAtv.trim() } : {}),
        ...(haciendaCertificadoBase64 ? { certificadoP12Base64: haciendaCertificadoBase64, certificadoNombreArchivo: haciendaCertificadoNombreNuevo } : {}),
        ...(haciendaCertificadoPin.trim() ? { certificadoPin: haciendaCertificadoPin.trim() } : {})
      };
      const res = await fetch('/api/hacienda-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setHaciendaTienePasswordAtv(data.tienePasswordAtv);
      setHaciendaTieneCertificado(data.tieneCertificado);
      setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
      setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
      setHaciendaPasswordAtv('');
      setHaciendaCertificadoBase64('');
      setHaciendaCertificadoNombreNuevo('');
      setHaciendaCertificadoPin('');
      setHaciendaMensaje({ tipo: 'ok', texto: 'Configuración de Hacienda guardada con éxito.' });
    } catch (err: any) {
      setHaciendaMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setHaciendaGuardando(false);
    }
  };

  const handleProbarCertificado = async () => {
    setHaciendaProbando(true);
    setHaciendaMensaje(null);
    setHaciendaInfoCertificado(null);
    try {
      const res = await fetch('/api/hacienda/verificar-certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCompania: selectedCompanyId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo verificar el certificado.');
      setHaciendaInfoCertificado(data);
    } catch (err: any) {
      setHaciendaMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setHaciendaProbando(false);
    }
  };
```

- [ ] **Step 5: Add the UI section, right after the SMTP form's closing (`</form>\n      )}`, before `{/* Editing / Creating Form */}`)**

Find:
```tsx
        </form>
      )}

      {/* Editing / Creating Form */}
```
replace with:
```tsx
        </form>
      )}

      {/* Hacienda Digital Signature configuration per company */}
      {!isEditing && !isAdding && (
        <form onSubmit={handleSaveHacienda} className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Firma Digital Hacienda (Facturación Electrónica)</h4>
              <p className="text-[10px] text-slate-500">Certificado criptográfico (.p12) y credenciales ATV para firmar comprobantes electrónicos</p>
            </div>
          </div>

          {haciendaMensaje && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${haciendaMensaje.tipo === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{haciendaMensaje.texto}</span>
            </div>
          )}

          {haciendaInfoCertificado && (
            <div className="p-3 rounded-xl border border-slate-200 bg-white text-[10.5px] space-y-1">
              <div><span className="font-bold text-slate-600">Sujeto: </span>{haciendaInfoCertificado.sujeto}</div>
              <div><span className="font-bold text-slate-600">Emisor: </span>{haciendaInfoCertificado.emisor}</div>
              <div><span className="font-bold text-slate-600">Vence: </span>{new Date(haciendaInfoCertificado.validoHasta).toLocaleDateString('es-CR')}</div>
              {haciendaInfoCertificado.expirado && <div className="text-rose-600 font-bold">Este certificado está VENCIDO.</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Ambiente</label>
              <select
                value={haciendaAmbiente}
                onChange={(e) => setHaciendaAmbiente(e.target.value as 'SANDBOX' | 'PRODUCCION')}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="SANDBOX">Sandbox (Pruebas)</option>
                <option value="PRODUCCION">Producción</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Usuario ATV</label>
              <input
                type="text"
                value={haciendaUsuarioAtv}
                onChange={(e) => setHaciendaUsuarioAtv(e.target.value)}
                placeholder="ej: cpf-01-1234-5678"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 mb-1 font-semibold">Contraseña ATV</label>
            <input
              type="password"
              value={haciendaPasswordAtv}
              onChange={(e) => setHaciendaPasswordAtv(e.target.value)}
              placeholder={haciendaTienePasswordAtv ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña ATV'}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold flex items-center gap-1">
                <Upload className="w-3 h-3" /> Certificado Criptográfico (.p12)
              </label>
              <input
                type="file"
                accept=".p12,.pfx"
                onChange={handleCertificadoFileChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                {haciendaCertificadoNombreNuevo
                  ? `Nuevo archivo seleccionado: ${haciendaCertificadoNombreNuevo}`
                  : haciendaTieneCertificado
                  ? `Archivo actual: ${haciendaCertificadoNombreArchivo || 'certificado.p12'}${haciendaCertificadoVenceEn ? ` · vence ${haciendaCertificadoVenceEn}` : ''}`
                  : 'Ningún certificado configurado todavía.'}
              </span>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">PIN del Certificado</label>
              <input
                type="password"
                value={haciendaCertificadoPin}
                onChange={(e) => setHaciendaCertificadoPin(e.target.value)}
                placeholder={haciendaTieneCertificado ? '•••••••• (dejar en blanco para mantener el actual)' : 'PIN del certificado .p12'}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleProbarCertificado}
              disabled={haciendaProbando || !haciendaTieneCertificado}
              className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {haciendaProbando ? 'Probando...' : 'Probar Configuración'}
            </button>

            <button
              type="submit"
              disabled={haciendaGuardando}
              className="text-white px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Check className="w-4 h-4" />
              {haciendaGuardando ? 'Guardando...' : 'Guardar Configuración Hacienda'}
            </button>
          </div>
        </form>
      )}

      {/* Editing / Creating Form */}
```

- [ ] **Step 6: Verify with `npm run lint`**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Verify manually in the browser**

Run `npm run dev`, open Ajustes de Empresa. Confirm the new "Firma Digital Hacienda" section renders below the SMTP section. Using a throwaway synthetic `.p12` (same generation script as Task 2, saved to a temp file on disk so it can be selected via the file input — e.g. write the base64-decoded bytes to `/tmp/test.p12`), select it in the file input, fill in a PIN, save, and confirm "Configuración de Hacienda guardada con éxito." appears along with the certificate's expiration date. Click "Probar Configuración" and confirm the subject/issuer/expiration display. Do NOT use the user's real `certificado.p12` for this step. Clean up: after verifying, save the section back to an empty/default state or note that this was throwaway test data if it landed in the real DB (same `idCompania` as whichever real company was selected in the dropdown during this manual test — if that's the real company `id_compania: 7`, this leaves harmless test credentials in a company config row that isn't used for anything yet; still, note in your report whether real company 7's `compania_hacienda_config` row now holds this test data, since the user may want to know it's there before they later put in their real certificate).

- [ ] **Step 8: Commit**

```bash
git add src/components/CompanySettings.tsx
git commit -m "feat: add Hacienda certificate upload and verification UI"
```

---

### Task 5: Final verification and handoff notes

**Files:** none (verification and documentation only)

- [ ] **Step 1: Full lint pass**

Run: `npm run lint`
Expected: zero errors across the whole project.

- [ ] **Step 2: End-to-end synthetic-certificate smoke test**

With `npm run dev` running and a throwaway `idCompania`, exercise the full chain once more end-to-end: save config with a synthetic `.p12` → GET config (confirm no secrets leak) → verificar-certificado (confirm subject/issuer/expiration) → firmar with a minimal XML (confirm a well-formed `Signature`/`QualifyingProperties` block appears) → delete the throwaway config row. Confirm the dev server is stopped and port 3000 is free afterward.

- [ ] **Step 3: Write a short handoff note for the user (not a code change — report this back in your final message, not in a committed file)**

State clearly, in the final report to the user:
- The module is ready to test with their real `certificado.p12` and Sandbox ATV credentials, through the "Firma Digital Hacienda" section in Ajustes de Empresa → "Probar Configuración".
- This only covers signing — there is still no invoice-creation UI, no XML generator matching Hacienda's v4.4 schema, and no submission to Hacienda's real API. `POST /api/hacienda/firmar` can sign any XML string handed to it, but nothing in the app produces a Hacienda-compliant invoice XML yet.
- If they later want the full pipeline (invoice UI, XML generation, OAuth2 + submission to Hacienda), that reference exists in `POS--RESTAURANTE`'s `server.ts` (`procesarFacturaHacienda`) and would be a separate, larger scope decision.
