import nodemailer from "nodemailer";
import type { CompaniaSmtpConfig } from "../src/data/mockData";
import { decryptSecret } from "./crypto";

export interface AdjuntoEmail {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Opcional: si viene vacío o sin definir, el correo sale sin adjuntos. */
  attachments?: AdjuntoEmail[];
}

/** Resultado resumido del envío (messageId y destinatarios aceptados/rechazados por el SMTP). */
export interface ResultadoEnvio {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Crea el transporte nodemailer a partir de la configuración SMTP guardada de una empresa. */
export function createTransportFromConfig(config: CompaniaSmtpConfig) {
  const password = decryptSecret(config.smtpPasswordCifrado);

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSeguridad === "SSL",
    requireTLS: config.smtpSeguridad === "TLS",
    ignoreTLS: config.smtpSeguridad === "NINGUNA",
    auth: {
      user: config.smtpUsuario,
      pass: password,
    },
  });
}

export async function sendMail(config: CompaniaSmtpConfig, message: OutgoingEmail): Promise<ResultadoEnvio> {
  const transporter = createTransportFromConfig(config);

  const info = await transporter.sendMail({
    from: `"${config.remitenteNombre}" <${config.remitenteCorreo}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  });

  const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.map(d => (typeof d === "string" ? d : (d as any)?.address ?? String(d))) : []);
  return { messageId: info.messageId, accepted: comoLista(info.accepted), rejected: comoLista(info.rejected) };
}
