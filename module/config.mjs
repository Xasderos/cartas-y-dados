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
      acciones: "Ataques cuerpo a cuerpo y proezas de fuerza"
    },
    copas: {
      etiqueta: "CARTASYDADOS.Palos.Copas",
      abreviado: "MIST",
      caracteristicaAsociada: "misticismo",
      acciones: "Interacción social, apoyo y canalización"
    },
    oros: {
      etiqueta: "CARTASYDADOS.Palos.Oros",
      abreviado: "SOC",
      caracteristicaAsociada: "social",
      acciones: "Táctica, percepción, trampas y conocimientos"
    },
    bastos: {
      etiqueta: "CARTASYDADOS.Palos.Bastos",
      abreviado: "CONS",
      caracteristicaAsociada: "consciencia",
      acciones: "Movimiento, sigilo, defensa y ataques a distancia"
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
  tamanoBase: "Mediano"
};

/**
 * Devuelve la abreviatura corta de un palo para mostrarla en chat, fichas y diálogos.
 * @param {string} clavePalo - Clave interna del palo ("espadas", "bastos", "oros", "copas").
 * @returns {string} "FISC", "CONS", "SOC" o "MIST" (o la clave en mayúsculas si es desconocida).
 */
export function abreviadoPalo(clavePalo) {
  return SISTEMA_CONFIG.palosCartas[clavePalo]?.abreviado
    ?? String(clavePalo ?? "").toUpperCase();
}

/**
 * Genera un nombre único que no colisione con ninguno de los nombres existentes.
 * Si `base` ya está en uso, añade un sufijo numérico incremental ("Base 2", "Base 3"...).
 * Se usa al crear Trinkets y Cartas para que cada uno nazca con un nombre
 * personalizado y diferenciable (v0.8.2).
 * @param {Iterable<string>} nombresExistentes - Nombres ya presentes en la pila destino.
 * @param {string} base - Nombre base deseado (ej. "Nuevo Trinket").
 * @returns {string} Nombre garantizado como único dentro de la colección.
 */
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
    [...(nombresExistentes ?? [])].map(n => limpiarNombreCarta(n))
  );
  if (!usados.has(raizLimpia.toLowerCase())) return raizLimpia;
  let i = 2;
  while (usados.has(`${raizLimpia} ${i}`.toLowerCase())) i++;
  return `${raizLimpia} ${i}`;
}

/**
 * Devuelve siempre un nombre visible, identificativo y reconocible para una carta.
 * Si la carta tiene nombre propio lo devuelve limpio; en caso contrario (nombre
 * vacío, ausente o que contenga "Unknown") construye un identificador descriptivo
 * con tipo, palo y dado para que jamás se muestre un genérico tipo "Unknown" o un vacío.
 * @param {object} carta - Documento Card o datos con `name`, `type` y `system`.
 * @returns {string} Nombre garantizado no vacío y reconocible.
 */
export function nombreVisibleCarta(carta) {
  if (!carta) return "Carta (?)";
  const nombreLimpio = limpiarNombreCarta(carta?.name)
    || limpiarNombreCarta(carta?._source?.name)
    || limpiarNombreCarta(carta?.faces?.[0]?.name);
  if (nombreLimpio) return nombreLimpio;
  const esTrinket = carta.type === "trinket";
  const etiqueta = esTrinket ? "Trinket" : "Carta";
  const palo = abreviadoPalo(carta?.system?.palo) || "?";
  const numero = Number(carta?.system?.numero) || "?";
  const dado = SISTEMA_CONFIG.dadoPorNumeroCarta?.[numero] ?? "?";
  return `${etiqueta} ${palo}${numero} (${dado})`;
}
