/**
 * @file config.mjs
 * @description Configuración central del sistema Cartas y Dados para Foundry VTT v14.
 * Define la relación entre Palos -> Características (cantidad de dados)
 * y Número de Carta -> Tipo de Dado (caras del dado).
 */

export const SISTEMA_CONFIG = {
  /**
   * Características del personaje.
   * La clave debe coincidir con las propiedades de `actor.system.caracteristicas`.
   */
  caracteristicas: {
    fisico: "CARTASYDADOS.Caracteristicas.Fisico",
    consciencia: "CARTASYDADOS.Caracteristicas.Consciencia",
    social: "CARTASYDADOS.Caracteristicas.Social",
    misticismo: "CARTASYDADOS.Caracteristicas.Misticismo"
  },

  /**
   * Palos de las cartas y a qué característica del personaje están vinculados.
   * Cuando se juega una carta de un palo, se lanzan tantos dados como el valor
   * de la característica asociada (`caracteristicaAsociada`).
   */
  palosCartas: {
    espadas: {
      etiqueta: "CARTASYDADOS.Palos.Espadas",
      abreviado: "FISC",
      caracteristicaAsociada: "fisico",
      acciones: "Combate, proezas de fuerza, agilidad, movimiento y sigilo"
    },
    copas: {
      etiqueta: "CARTASYDADOS.Palos.Copas",
      abreviado: "MIST",
      caracteristicaAsociada: "misticismo",
      acciones: "Habilidades, magia, rituales y canalización mística"
    },
    oros: {
      etiqueta: "CARTASYDADOS.Palos.Oros",
      abreviado: "SOC",
      caracteristicaAsociada: "social",
      acciones: "Interacción social, persuasión, engaño y liderazgo"
    },
    bastos: {
      etiqueta: "CARTASYDADOS.Palos.Bastos",
      abreviado: "CONS",
      caracteristicaAsociada: "consciencia",
      acciones: "Percepción, conocimientos, táctica e investigación"
    }
  },

  /**
   * Mapa del número/valor de la carta (1 al 5) al tipo de dado que se lanza.
   * Puedes ampliar o modificar esta tabla en cualquier momento.
   * @type {Object<number, string>}
   */
  dadoPorNumeroCarta: {
    1: "d4",
    2: "d6",
    3: "d8",
    4: "d10",
    5: "d12"
  },

  /**
   * Mano máxima base de cualquier personaje antes de aplicar nivel de clase u objetos.
   */
  manoBasePorDefecto: 4,

  /**
   * Movimiento base en metros por turno (por defecto: ajuste world "movimientoBase").
   * Fórmula: movimiento.max = movimiento.base + (caracteristicasTotales.fisico * 5)
   */
  movimientoBase: 10,

  /**
   * Categoría de tamaño por defecto para nuevos actores (ajuste world "tamanoBase").
   * Opciones: Diminuto, Pequeño, Mediano, Grande, Enorme.
   */
  tamanoBase: "Mediano",

  /**
   * Razas Base del sistema (v0.10.1).
   * El Asistente de Creación de Personaje ofrece estas razas en su primer paso y crea
   * con la elegida el Item `raza` del Actor (`system.claveRaza` guarda la clave).
   * Rasgos, bonificadores y descripción quedan a definir en la ficha del Item
   * (todos los bonificadores a 0 por ahora).
   */
  RAZAS_BASE: {
    humanos: { nombre: "Humanos" },
    mairu: { nombre: "Mairu" },
    mandragora: { nombre: "Mandrágora" },
    trastolillos: { nombre: "Trastolillos" },
    sierpes: { nombre: "Sierpes" }
  },

  /**
   * Clases Base del sistema (v0.8.4).
   * El Asistente de Creación de Personaje usa esta configuración para ofrecer
   * la elección de Clase y Trinket inicial, y para generar el Mazo de Juego:
   * - `atributo`: característica asociada a la clase (null en Tabula Rasa).
   * - `paloPrincipal`: palo que recibe +3 cartas d4 extra y 1 carta d8 (null en Tabula Rasa,
   *   en cuyo caso el Mazo de Acción queda vacío para personalización manual).
   * - `avanzada`: si es true, requiere confirmación explícita (no recomendada a novatos).
   * - `trinkets`: nombres de Trinkets ofrecidos al crear el personaje.
   * - `progresion` (v0.10.0): recompensas por nivel alcanzado, `{ <nivelDestino>: { habilidades, packs } }`.
   *   · `habilidades`: lista de `{ nombre, esAtaque }`; el jugador elige UNA y se crea como
   *     Item `habilidad` (origen "clase") en el Actor.
   *   · `packs`: lista de packs de cartas; el jugador elige UNO y sus cartas `{ palo, numero }`
   *     (numero 1 = d4, 2 = d6...) se añaden al Mazo de Juego con nombre místico.
   *   Sin entrada para el nivel siguiente → la subida de nivel no está disponible.
   */
  CLASES_BASE: {
    fortisCorpore: {
      nombre: "Fortis Corpore",
      atributo: "fisico",
      paloPrincipal: "espadas",
      trinkets: ["Espada", "Escudo", "Daga"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Potenciación", esAtaque: false },
            { nombre: "Baluarte", esAtaque: false },
            { nombre: "Paso de las sombras", esAtaque: false }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "espadas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "espadas", numero: 2 }]
          ]
        }
      }
    },
    mendaciumCharisma: {
      nombre: "Mendacium Charisma",
      atributo: "social",
      paloPrincipal: "oros",
      trinkets: ["Empatía", "Compañero Eterno", "Amistad"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Sanación", esAtaque: false },
            { nombre: "Promesa", esAtaque: false },
            { nombre: "Limpieza", esAtaque: false }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "oros", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "oros", numero: 2 }]
          ]
        }
      }
    },
    altaScentia: {
      nombre: "Alta Scentia",
      atributo: "consciencia",
      paloPrincipal: "bastos",
      trinkets: ["Elementalismo", "Visión del futuro", "Artilugio de primera"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Manifestar arma", esAtaque: false },
            { nombre: "Tiempo embotellado", esAtaque: false },
            { nombre: "Descarga elemental (hielo)", esAtaque: true },
            { nombre: "Descarga elemental (rayo)", esAtaque: true },
            { nombre: "Descarga elemental (fuego)", esAtaque: true }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "bastos", numero: 2 }],
            [{ palo: "espadas", numero: 1 }, { palo: "bastos", numero: 2 }]
          ]
        }
      }
    },
    potensMystica: {
      nombre: "Potens Mystica",
      atributo: "misticismo",
      paloPrincipal: "copas",
      trinkets: ["Ojo por ojo", "Preservación espiritual", "Barrera espiritual"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Mal de ojo", esAtaque: true },
            { nombre: "Sellar destino", esAtaque: false },
            { nombre: "Flagelar esencia", esAtaque: true }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "oros", numero: 1 }, { palo: "copas", numero: 2 }]
          ]
        }
      }
    },
    tabulaRasa: {
      nombre: "Tabula Rasa",
      atributo: null,
      paloPrincipal: null,
      avanzada: true,
      trinkets: ["Vasija vacía"]
    }
  }
};

/**
 * Devuelve la abreviatura corta de un palo para mostrarla en chat, fichas y diálogos.
 * @param {string} clavePalo - Clave interna del palo ("espadas", "bastos", "oros", "copas").
 * @returns {string} "FISC", "CONS", "SOC" o "MIST" (o la clave en mayúsculas si es desconocida).
 */
/**
 * Resuelve la clave de `SISTEMA_CONFIG.CLASES_BASE` de un Item de Clase (v0.10.0).
 * Usa `system.claveClase`; para personajes anteriores a v0.10.0 (sin clave guardada)
 * la deduce comparando el nombre del Item con `CLASES_BASE.<clave>.nombre`.
 * @param {Item|null} itemClase - Item de tipo "clase" del Actor.
 * @returns {string|null} Clave de la clase base o null si no corresponde a ninguna.
 */
export function claveClaseDeItem(itemClase) {
  if (!itemClase) return null;
  const clases = SISTEMA_CONFIG.CLASES_BASE;
  const guardada = itemClase.system?.claveClase;
  if (guardada && clases[guardada]) return guardada;
  const nombre = String(itemClase.name ?? "").trim().toLowerCase();
  return Object.keys(clases).find(k => clases[k].nombre.toLowerCase() === nombre) ?? null;
}

/**
 * Describe un pack de cartas de progresión en texto plano (v0.10.0),
 * p. ej. "1× SOC d4 + 1× FISC d6". Apto para labels de `DialogV2` y chat.
 * @param {Array<{palo: string, numero: number}>} pack - Cartas del pack.
 * @returns {string} Descripción legible del pack.
 */
export function describirPackCartas(pack) {
  const conteo = new Map();
  for (const { palo, numero } of pack ?? []) {
    const etiqueta = `${abreviadoPalo(palo)} ${SISTEMA_CONFIG.dadoPorNumeroCarta[numero] ?? "?"}`;
    conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1);
  }
  return [...conteo].map(([etiqueta, n]) => `${n}× ${etiqueta}`).join(" + ");
}

export function abreviadoPalo(clavePalo) {
  return SISTEMA_CONFIG.palosCartas[clavePalo]?.abreviado
    ?? String(clavePalo ?? "").toUpperCase();
}

/**
 * Limpia un nombre de carta eliminando cualquier prefijo o aparición residual de
 * "Unknown" (case-insensitive). Devuelve string vacío si no hay nombre válido.
 * @param {string} nombreRaw - Nombre crudo de la carta (puede ser undefined).
 * @returns {string} Nombre limpio sin "Unknown", o string vacío si no hay nombre.
 */
export function limpiarNombreCarta(nombreRaw) {
  if (typeof nombreRaw !== "string") return "";
  return String(nombreRaw)
    .replace(/^unknown\s*[:\-–—]?\s*/i, "")
    .replace(/^unknown$/i, "")
    .replace(/\s*unknown\s*/gi, " ")
    .trim();
}

/**
 * Genera un nombre único que no colisione con ninguno de los nombres existentes.
 * Si `base` ya está en uso, añade un sufijo numérico incremental ("Base 2", "Base 3"...).
 * Se usa al crear Trinkets y Cartas para que cada uno nazca con un nombre
 * personalizado y diferenciable (v0.8.4).
 * @param {Iterable<string>} nombresExistentes - Nombres ya presentes en la pila destino.
 * @param {string} base - Nombre base deseado (ej. "Nuevo Trinket").
 * @returns {string} Nombre garantizado como único dentro de la colección.
 */
export function generarNombreUnico(nombresExistentes, base) {
  const raizLimpia = limpiarNombreCarta(base) || "Carta";
  const usados = new Set(
    // Comparación case-insensitive: se normaliza todo a minúsculas
    [...(nombresExistentes ?? [])].map(n => limpiarNombreCarta(n).toLowerCase())
  );
  if (!usados.has(raizLimpia.toLowerCase())) return raizLimpia;
  let i = 2;
  while (usados.has(`${raizLimpia} ${i}`.toLowerCase())) i++;
  return `${raizLimpia} ${i}`;
}

/**
 * Sílabas iniciales y finales combinables para generar vocablos arcanos/místicos
 * sin significado real, usadas por el generador de nombres de cartas iniciales (v0.8.4).
 * @type {string[]}
 */
const SILABAS_INICIALES_MISTICAS = ["Ael", "Vyr", "Kael", "Zor", "Nyx", "Thal", "Orym", "Syr", "Vael", "Lir", "Drak", "Morn"];
const SILABAS_FINALES_MISTICAS = ["ith", "os", "ar", "en", "ul", "ia", "on", "is", "um", "esh"];

/**
 * Genera un nombre místico único y sin significado real (ej. "Kaelith", "VyrOS")
 * combinando sílabas arcanas, garantizando que no colisione con ninguno de los
 * nombres ya usados. Se emplea para bautizar las 12 Cartas de Acción iniciales
 * que el Asistente de Clase genera en el Mazo de Juego (v0.8.4).
 * @param {Iterable<string>} usados - Nombres ya empleados (se comparan en minúsculas).
 * @returns {string} Nombre místico garantizado como único.
 */
export function generarNombreMisticoUnico(usados) {
  const conjuntoUsados = new Set([...(usados ?? [])].map(n => String(n).toLowerCase()));

  let nombre = "";
  for (let intento = 0; intento < 500; intento++) {
    const inicial = SILABAS_INICIALES_MISTICAS[Math.floor(Math.random() * SILABAS_INICIALES_MISTICAS.length)];
    const final = SILABAS_FINALES_MISTICAS[Math.floor(Math.random() * SILABAS_FINALES_MISTICAS.length)];
    nombre = `${inicial}${final}`;
    if (!conjuntoUsados.has(nombre.toLowerCase())) return nombre;
  }

  // Fallback por improbable agotamiento aleatorio: sufijo numérico incremental
  let i = 2;
  while (conjuntoUsados.has(`${nombre} ${i}`.toLowerCase())) i++;
  return `${nombre} ${i}`;
}

/**
 * Devuelve siempre un nombre visible, identificativo y reconocible para una carta.
 * Si la carta tiene nombre propio lo devuelve limpio; en caso contrario (nombre
 * vacío, ausente o que contenga "Unknown") construye un identificador descriptivo:
 * "Trinket Nv. X" para Trinkets (v0.8.4, sin palo ni dado) o tipo + palo + dado
 * para Cartas de Acción, para que jamás se muestre un genérico tipo "Unknown".
 * @param {object} carta - Documento Card o datos con `name`, `type` y `system`.
 * @returns {string} Nombre garantizado no vacío y reconocible.
 */
export function nombreVisibleCarta(carta) {
  if (!carta) return "Carta (?)";
  const nombreLimpio = limpiarNombreCarta(carta?.name)
    || limpiarNombreCarta(carta?._source?.name)
    || limpiarNombreCarta(carta?.faces?.[0]?.name);
  if (nombreLimpio) return nombreLimpio;
  // Fallback de Trinkets sin nombre válido: identificador por Nivel (sin palo ni dado, v0.8.4)
  if (carta.type === "trinket") {
    const nivel = Number(carta?.system?.nivel) || 1;
    return `Trinket Nv. ${nivel}`;
  }
  const palo = abreviadoPalo(carta?.system?.palo) || "?";
  const numero = Number(carta?.system?.numero) || "?";
  const dado = SISTEMA_CONFIG.dadoPorNumeroCarta?.[numero] ?? "?";
  return `Carta ${palo}${numero} (${dado})`;
}
