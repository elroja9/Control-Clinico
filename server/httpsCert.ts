import fs from "fs";
import os from "os";
import path from "path";
import forge from "node-forge";

// Certificado TLS autofirmado para que server.ts sirva HTTPS directamente. Se genera una sola vez
// y se reutiliza en los siguientes arranques — no se versiona en git (server/certs/ está en
// .gitignore), ya que incluye la llave privada del servidor.
const CERT_DIR = path.join(process.cwd(), "server", "certs");
const CERT_PATH = path.join(CERT_DIR, "cert.pem");
const KEY_PATH = path.join(CERT_DIR, "key.pem");

function direccionesLan(): string[] {
  const direcciones: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const lista of Object.values(interfaces)) {
    for (const iface of lista || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        direcciones.push(iface.address);
      }
    }
  }
  return direcciones;
}

function generarCertificadoAutofirmado(): { cert: string; key: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: "commonName", value: "localhost" },
    { name: "countryName", value: "CR" },
    { name: "organizationName", value: "Control-Clinico (certificado local autofirmado)" }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const altNames: Array<{ type: number; value?: string; ip?: string }> = [
    { type: 2, value: "localhost" }, // dNSName
    { type: 7, ip: "127.0.0.1" } // iPAddress
  ];
  for (const ip of direccionesLan()) {
    altNames.push({ type: 7, ip });
  }

  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
    { name: "subjectAltName", altNames }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey)
  };
}

export function obtenerCertificadoHttps(): { cert: string; key: string } {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return {
      cert: fs.readFileSync(CERT_PATH, "utf8"),
      key: fs.readFileSync(KEY_PATH, "utf8")
    };
  }

  console.log("[HTTPS] No se encontró un certificado TLS local — generando uno autofirmado...");
  const { cert, key } = generarCertificadoAutofirmado();
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_PATH, cert);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  console.log(`[HTTPS] Certificado autofirmado generado en ${CERT_DIR}. El navegador mostrará una advertencia de "certificado no confiable" la primera vez — es normal para un certificado autofirmado.`);

  return { cert, key };
}
