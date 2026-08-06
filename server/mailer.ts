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

export async function sendMail(config: CompaniaSmtpConfig, message: OutgoingEmail): Promise<void> {
  const password = decryptSecret(config.smtpPasswordCifrado);

  const transporter = nodemailer.createTransport({
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

  await transporter.sendMail({
    from: `"${config.remitenteNombre}" <${config.remitenteCorreo}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  });
}
