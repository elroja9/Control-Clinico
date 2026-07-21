export class TrasladoNoCalculableError extends Error {}

export async function calcularTiempoTrasladoMinutos(params: {
  origenLat: number;
  origenLng: number;
  destinoLat: number;
  destinoLng: number;
}): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY no está configurada.");
  }

  const { origenLat, origenLng, destinoLat, destinoLng } = params;
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origenLat},${origenLng}`);
  url.searchParams.set("destinations", `${destinoLat},${destinoLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  const data: any = await response.json();

  if (data.status !== "OK") {
    throw new Error(`Google Distance Matrix respondió: ${data.status}`);
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new TrasladoNoCalculableError("No se pudo calcular la ruta a esa dirección.");
  }

  return Math.round(element.duration.value / 60);
}
