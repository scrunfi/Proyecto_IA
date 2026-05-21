const SUBSECTOR_LABELS: Record<string, string> = {
  yes: "Comercio general",
  general: "General",
  doityourself: "Bricolaje",
  estate_agent: "Inmobiliaria",
  travel_agency: "Agencia de viajes",
  travel_agent: "Agencia de viajes",
  car: "Automoviles y concesionarios",
  car_parts: "Repuestos automotrices",
  restaurant: "Restaurante",
  fast_food: "Comida rapida",
  cafe: "Cafeteria",
  bar: "Bar",
  pharmacy: "Farmacias",
  supermarket: "Supermercado",
  convenience: "Tiendas de conveniencia",
  greengrocer: "Fruteria",
  seafood: "Pescaderias",
  hairdresser: "Peluquerias",
  beauty: "Belleza",
  clothes: "Moda y ropa",
  shoes: "Calzado",
  jewelry: "Joyeria y accesorios",
  mobile_phone: "Telefonia movil",
  mobile_phone_accessories: "Accesorios de movil",
  car_repair: "Reparacion automotriz",
  motorcycle_repair: "Reparacion de motocicletas",
  dentist: "Clinicas dentales",
  clinic: "Clinicas",
  bank: "Banca",
  insurance: "Seguros y corredurias",
  lawyer: "Despachos legales",
  electrician: "Servicios electricos",
  plumber: "Fontaneria y saneamiento",
  veterinary: "Servicios veterinarios",
  bakery: "Panaderias",
  butcher: "Carnicerias",
  pastry: "Pasteleria",
  optician: "Opticas",
  stationery: "Papeleria y oficina",
  copyshop: "Copisteria e impresion",
  hardware: "Ferreteria y bricolaje",
  houseware: "Equipamiento del hogar",
  furniture: "Muebles",
  interior_decoration: "Decoracion interior",
  flooring: "Suelos",
  locksmith: "Cerrajeria y seguridad",
  cosmetics: "Cosmetica y cuidado personal",
  perfumery: "Perfumeria",
  herbalist: "Herbolario",
  pet: "Mascotas",
  pet_grooming: "Peluqueria canina",
  tattoo: "Tatuajes",
  photo: "Fotografia",
  toys: "Jugueteria",
  books: "Libreria",
  gift: "Regalos",
  florist: "Floristerias",
  lottery: "Loteria",
  tobacco: "Estanco",
  beverages: "Bebidas",
  confectionery: "Dulcerias",
  glaziery: "Cristaleria y cerramientos",
  glaziery_hardware: "Cristaleria y ferreteria",
  hvac: "Climatizacion y ventilacion",
  toolmaker: "Fabricacion de herramientas",
  upholsterer: "Tapiceria",
  watchmaker: "Relojeria y reparacion",
  window_construction: "Carpinteria metalica",
};

export function getSubsectorLabel(value: string) {
  const key = value.trim().toLowerCase();
  const normalizedKey = key.replaceAll(";", "_");
  const translated =
    SUBSECTOR_LABELS[key] ??
    SUBSECTOR_LABELS[normalizedKey];
  if (translated) {
    return translated;
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
