export type Business = {
  id: string;
  name: string;
  neighborhood: string;
  category: string;
  subcategory?: string;
  lat: number;
  lon: number;
  score: number;
  gap: number;
  reviews: number;
};

export const neighborhoods = [
  "Centro",
  "Nueva Andalucia",
  "Zapillo",
  "Ciudad Jardin",
  "El Alquian",
];

export const businesses: Business[] = [
  {
    id: "al-001",
    name: "Cafe Sol de Levante",
    neighborhood: "Centro",
    category: "Restauracion",
    lat: 36.8382,
    lon: -2.4589,
    score: 73,
    gap: 12,
    reviews: 184,
  },
  {
    id: "al-014",
    name: "Taller Rueda Sur",
    neighborhood: "Nueva Andalucia",
    category: "Automocion",
    lat: 36.8473,
    lon: -2.4525,
    score: 41,
    gap: 36,
    reviews: 28,
  },
  {
    id: "al-035",
    name: "Farmacia Costa Azul",
    neighborhood: "Zapillo",
    category: "Salud",
    lat: 36.8251,
    lon: -2.4512,
    score: 66,
    gap: 18,
    reviews: 93,
  },
  {
    id: "al-050",
    name: "Peluqueria La Estacion",
    neighborhood: "Ciudad Jardin",
    category: "Belleza",
    lat: 36.8356,
    lon: -2.4448,
    score: 55,
    gap: 24,
    reviews: 47,
  },
  {
    id: "al-071",
    name: "Panaderia El Faro",
    neighborhood: "El Alquian",
    category: "Alimentacion",
    lat: 36.8759,
    lon: -2.3899,
    score: 38,
    gap: 39,
    reviews: 21,
  },
];
