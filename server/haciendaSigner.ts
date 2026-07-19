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
