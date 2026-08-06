import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

/**
 * Genera PDFs a partir de HTML usando Chrome en modo headless por línea de comandos.
 *
 * Por qué no Puppeteer: da exactamente el mismo resultado (es el mismo motor) pero descarga
 * ~300 MB de Chromium y mantiene un navegador vivo consumiendo 200-400 MB. Este servidor tiene
 * 8 GB con ~0,5 GB libres y comparte PM2 con otras dos aplicaciones, así que un navegador
 * persistente es un riesgo real. Invocando el binario ya instalado, Chrome arranca, escribe el
 * PDF y termina: medido en este servidor, 3,8 s por documento y la memoria se libera al salir.
 *
 * La ruta del binario se lee de CHROME_PATH (.env) — nunca se codifica aquí, igual que el resto
 * de la configuración del entorno.
 */

const TIMEOUT_MS = 45000;

/**
 * Chrome se invoca de a uno. Sin esto, varias solicitudes simultáneas levantarían un navegador
 * cada una y multiplicarían el consumo de memoria, que es justo lo que este diseño evita.
 */
let cola: Promise<unknown> = Promise.resolve();
function enFila<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  // La cola nunca debe quedarse en estado rechazado o bloquearía las siguientes generaciones.
  cola = resultado.catch(() => undefined);
  return resultado;
}

/**
 * Convierte HTML en un PDF.
 *
 * Devuelve `null` en vez de lanzar cuando no se puede generar (falta CHROME_PATH, el binario no
 * existe, Chrome falla o se agota el tiempo). Quien llama decide qué hacer: en los correos se
 * envía el mensaje igual, sin adjunto, porque perder la notificación completa por un fallo del
 * PDF sería peor que enviarla incompleta.
 */
export async function generarPdfDesdeHtml(html: string, nombreParaLog = "documento"): Promise<Buffer | null> {
  const chromePath = process.env.CHROME_PATH;
  if (!chromePath) {
    console.warn(`[PDF] CHROME_PATH no está configurado en .env — se omite el PDF de ${nombreParaLog}.`);
    return null;
  }

  try {
    await fs.access(chromePath);
  } catch {
    console.warn(`[PDF] El binario de Chrome no existe en CHROME_PATH (${chromePath}) — se omite el PDF de ${nombreParaLog}.`);
    return null;
  }

  return enFila(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-pdf-"));
    const htmlPath = path.join(dir, "doc.html");
    const pdfPath = path.join(dir, "doc.pdf");
    // Perfil aislado y desechable: evita tocar el perfil real de Chrome del usuario y que se
    // abran ventanas del navegador en el escritorio del servidor.
    const perfilPath = path.join(dir, "perfil");

    try {
      await fs.writeFile(htmlPath, html, "utf8");

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(chromePath, [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          `--user-data-dir=${perfilPath}`,
          `--print-to-pdf=${pdfPath}`,
          "--print-to-pdf-no-header",
          htmlPath
        ], { windowsHide: true });

        const temporizador = setTimeout(() => {
          proc.kill("SIGKILL");
          reject(new Error(`Chrome excedió ${TIMEOUT_MS} ms generando el PDF`));
        }, TIMEOUT_MS);

        proc.on("error", err => { clearTimeout(temporizador); reject(err); });
        proc.on("exit", code => {
          clearTimeout(temporizador);
          // Chrome devuelve 0 aunque haya escrito el PDF con avisos; lo que decide es que el
          // archivo exista, y eso se comprueba al leerlo justo después.
          if (code === 0 || code === null) resolve();
          else reject(new Error(`Chrome terminó con código ${code}`));
        });
      });

      const pdf = await fs.readFile(pdfPath);
      if (pdf.length === 0 || pdf.subarray(0, 5).toString() !== "%PDF-") {
        throw new Error("El archivo generado no es un PDF válido");
      }
      return pdf;
    } catch (err: any) {
      console.error(`[PDF] No se pudo generar el PDF de ${nombreParaLog}: ${err.message}`);
      return null;
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}
