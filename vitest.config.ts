import { defineConfig } from 'vitest/config';

// Zona horaria fija que no es UTC ni UTC-6: así las pruebas de fechas de Hacienda fallan tanto con el
// error viejo de "hora UTC con -06:00 pegado" como con "hora local del servidor". En una máquina en
// Costa Rica, el código con hora local pasaba igual. Los procesos de prueba heredan esta variable.
process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
