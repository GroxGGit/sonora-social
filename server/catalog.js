export const GENRES = [
  "Indie",
  "Pop",
  "Rock",
  "Jazz",
  "Electrónica",
  "Hip-hop",
  "Folk",
  "R&B",
  "Clásica",
  "Latina"
];

export const CATALOG = [
  { id: "cielo-de-papel", title: "Cielo de papel", artist: "Luna Norte", genre: "Indie", year: 2024 },
  { id: "luces-de-neon", title: "Luces de neón", artist: "Ciudad Prisma", genre: "Pop", year: 2023 },
  { id: "cafe-de-medianoche", title: "Café de medianoche", artist: "Trío Bruma", genre: "Jazz", year: 2022 },
  { id: "orbitas", title: "Órbitas", artist: "Satélite Azul", genre: "Electrónica", year: 2025 },
  { id: "voces-del-barrio", title: "Voces del barrio", artist: "Rima Clara", genre: "Hip-hop", year: 2024 },
  { id: "rio-de-limon", title: "Río de limón", artist: "Los Días Largos", genre: "Rock", year: 2021 },
  { id: "casa-de-sal", title: "Casa de sal", artist: "Marina Abril", genre: "Folk", year: 2023 },
  { id: "piel-de-ambar", title: "Piel de ámbar", artist: "Nube Canela", genre: "R&B", year: 2025 },
  { id: "jardin-secreto", title: "Jardín secreto", artist: "Cuarteto del Alba", genre: "Clásica", year: 2022 },
  { id: "bailar-contigo", title: "Bailar contigo", artist: "Sol de Agosto", genre: "Latina", year: 2024 },
  { id: "mapa-invertido", title: "Mapa invertido", artist: "Luna Norte", genre: "Indie", year: 2022 },
  { id: "azucar-y-humo", title: "Azúcar y humo", artist: "Ciudad Prisma", genre: "Pop", year: 2025 },
  { id: "ventana-abierta", title: "Ventana abierta", artist: "Trío Bruma", genre: "Jazz", year: 2020 },
  { id: "cuerpos-celestes", title: "Cuerpos celestes", artist: "Satélite Azul", genre: "Electrónica", year: 2023 },
  { id: "bajo-la-acera", title: "Bajo la acera", artist: "Rima Clara", genre: "Hip-hop", year: 2021 },
  { id: "kilometro-cero", title: "Kilómetro cero", artist: "Los Días Largos", genre: "Rock", year: 2024 },
  { id: "carta-sin-sello", title: "Carta sin sello", artist: "Marina Abril", genre: "Folk", year: 2025 },
  { id: "domingo-lento", title: "Domingo lento", artist: "Nube Canela", genre: "R&B", year: 2023 },
  { id: "noche-de-luna", title: "Noche de luna", artist: "Cuarteto del Alba", genre: "Clásica", year: 2024 },
  { id: "palmera-azul", title: "Palmera azul", artist: "Sol de Agosto", genre: "Latina", year: 2022 },
  { id: "fotografia-movil", title: "Fotografía móvil", artist: "Luna Norte", genre: "Indie", year: 2025 },
  { id: "pulso-de-cristal", title: "Pulso de cristal", artist: "Satélite Azul", genre: "Electrónica", year: 2021 },
  { id: "primera-fila", title: "Primera fila", artist: "Rima Clara", genre: "Hip-hop", year: 2025 },
  { id: "dias-de-cometa", title: "Días de cometa", artist: "Los Días Largos", genre: "Rock", year: 2023 },
  { id: "un-lugar-comun", title: "Un lugar común", artist: "Marina Abril", genre: "Folk", year: 2022 },
  { id: "todo-brilla", title: "Todo brilla", artist: "Ciudad Prisma", genre: "Pop", year: 2021 },
  { id: "cerca-del-mar", title: "Cerca del mar", artist: "Nube Canela", genre: "R&B", year: 2024 },
  { id: "tarde-de-mayo", title: "Tarde de mayo", artist: "Cuarteto del Alba", genre: "Clásica", year: 2021 },
  { id: "rumbo-sur", title: "Rumbo sur", artist: "Sol de Agosto", genre: "Latina", year: 2025 },
  { id: "persiana-roja", title: "Persiana roja", artist: "Trío Bruma", genre: "Jazz", year: 2025 }
];

export const TRACK_BY_ID = new Map(CATALOG.map((track) => [track.id, track]));
