import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required but not configured.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Endpoint to talk to the AI database schema assistant
  app.post("/api/chat", async (req: express.Request, res: express.Response) => {
    try {
      const { message, schemaContext } = req.body;
      
      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(400).json({
          error: "Clave API ausente. Por favor, configura GEMINI_API_KEY en el panel de Secretos."
        });
      }

      const prompt = `
Eres un Diseñador de Bases de Datos experto y un Especialista en Fisioterapia e Informática Médica en Costa Rica.
El usuario tiene un sistema de nutrición y facturación en Costa Rica, y quiere agregar tablas para manejar pacientes de fisioterapia.

Aquí está la estructura actual de las tablas principales que el usuario compartió:
${schemaContext}

Petición del usuario:
"${message}"

Responde en español de forma profesional, clara y didáctica.
Si te piden modificaciones o adiciones al esquema, muestra los scripts de SQL (compatibles con MySQL / MariaDB como en el dump phpMyAdmin proporcionado). Asegúrate de incluir comentarios útiles y de respetar las claves foráneas (como vincular con 'pacientes' o 'consultas' usando id_paciente o id_consulta).
Mantén una estructura limpia y fácil de copiar.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error en API de Chat:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor al consultar la IA." });
    }
  });

  // Serve Vite in development, or compiled static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
