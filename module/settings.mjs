/**
 * @file settings.mjs
 * @description Registro centralizado de opciones de configuración del sistema (game.settings)
 * para Foundry VTT v14. Permite al Master personalizar los valores iniciales y base
 * de Jugadores y PNJs sin tocar el código.
 */

import { SISTEMA_CONFIG } from "./config.mjs";

const SYSTEM_ID = "cartas-y-dados";

/**
 * Valores por defecto de los 7 botones de dificultad rápida del Panel del Master.
 * @type {number[]}
 */
export const PRESETS_DIFICULTAD_POR_DEFECTO = [2, 5, 9, 12, 14, 17, 21];

/**
 * Categorías de tamaño válidas (ajuste "tamanoBase" y `system.categoriaTamano` del Actor).
 * @type {string[]}
 */
export const CATEGORIAS_TAMANO = ["Diminuto", "Pequeño", "Mediano", "Grande", "Enorme"];

/**
 * Tamaño por defecto para nuevos Actores según el ajuste "tamanoBase" (v0.14.1). Convierte los
 * índices ("0".."4") que guardaba la versión anterior del ajuste y descarta valores no válidos.
 * @returns {string}
 */
export function leerTamanoBase() {
  const valor = String(leerAjuste("tamanoBase", "Mediano"));
  if (CATEGORIAS_TAMANO.includes(valor)) return valor;
  return CATEGORIAS_TAMANO[Number(valor)] ?? "Mediano";
}

/**
 * Lee de forma segura un ajuste del sistema. Si aún no está inicializado,
 * devuelve el valor por defecto indicado.
 *
 * @param {string} clave - Nombre del ajuste registrado.
 * @param {*} valorPorDefecto - Valor de respaldo.
 * @returns {*}
 */
export function leerAjuste(clave, valorPorDefecto) {
  try {
    if (game?.settings?.settings?.has(`${SYSTEM_ID}.${clave}`)) {
      return game.settings.get(SYSTEM_ID, clave);
    }
  } catch (err) {
    // Silencioso durante la fase temprana de construcción de esquemas
  }
  return valorPorDefecto;
}

/**
 * Registra todos los ajustes configurables del sistema durante el hook `init`.
 * @param {Function} [onUpdateCallback] - Función opcional para refrescar interfaces al cambiar un ajuste.
 */
export function registrarAjustesDelSistema(onUpdateCallback = () => {}) {
  // 1. Dificultad actual del Master (controlada también desde el Panel del Master)
  game.settings.register(SYSTEM_ID, "dificultadMaster", {
    name: "Dificultad Actual del Master",
    hint: "Dificultad numérica objetivo para las cartas y acciones que no sean ataques.",
    scope: "world",
    config: true,
    type: Number,
    default: 7,
    onChange: onUpdateCallback
  });

  // 1b. (v0.20.0) Nivel de peligro de la escena (Panel del Master). (v0.21.0) Mecánica global
  // 0–15 con efectos acumulativos (`module/peligro.mjs`); también lo usan «Ritual de espíritu» y
  // «Flagelar esencia» (Brujo / Potens Mystica).
  game.settings.register(SYSTEM_ID, "nivelPeligro", {
    name: "Nivel de Peligro",
    hint: "Peligro de la escena actual (0–15). Sus efectos se acumulan y afectan a todas las criaturas; sube cada 3 abalorios jugados y cada vez que el Master baraja su mazo. Se reinicia con «Fin Escena» en el Panel del Master.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 15, step: 1 },
    default: 0,
    onChange: onUpdateCallback
  });

  // 1c. (v0.21.0) Abalorios jugados En Juego desde la última subida del Nivel de peligro (0–2).
  //     Oculto: se muestra en el Panel del Master.
  game.settings.register(SYSTEM_ID, "abaloriosPeligro", {
    name: "Abalorios jugados (Nivel de peligro)",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: onUpdateCallback
  });

  // 2. Salud Máxima Base
  game.settings.register(SYSTEM_ID, "saludBase", {
    name: "Salud Máxima Base",
    hint: "Puntos de salud iniciales por defecto al crear un nuevo personaje o criatura.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    onChange: onUpdateCallback
  });

  // 3. Defensa Base
  game.settings.register(SYSTEM_ID, "defensaBase", {
    name: "Defensa Base",
    hint: "Valor de Defensa inicial por defecto antes de sumar equipo, raza o Trinkets.",
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    onChange: onUpdateCallback
  });

  // 4. Mano Máxima Base
  game.settings.register(SYSTEM_ID, "manoBase", {
    name: "Mano Máxima Base",
    hint: "Cantidad base de cartas en mano para los personajes antes de aplicar bonificadores de clase, raza u objetos.",
    scope: "world",
    config: true,
    type: Number,
    default: SISTEMA_CONFIG.manoBasePorDefecto,
    onChange: onUpdateCallback
  });

  // 5. Valor Inicial de Atributos (Jugadores)
  game.settings.register(SYSTEM_ID, "atributoInicialPJ", {
    name: "Valor Inicial de Características (Jugadores)",
    hint: "Cantidad inicial de dados en Físico, Consciencia, Social y Misticismo al crear un Personaje Jugador.",
    scope: "world",
    config: true,
    type: Number,
    default: 2,
    onChange: onUpdateCallback
  });

  // 6-7. (v0.12.0) Eliminados "cansancioMaxPJ"/"cansancioMaxPNJ": el Agotamiento tiene escala fija 0-8.

  // 8. Categoría de Tamaño Base
  game.settings.register(SYSTEM_ID, "tamanoBase", {
    name: "Categoría de Tamaño Base",
    hint: "Categoría de tamaño por defecto para nuevos personajes y criaturas.",
    scope: "world",
    config: true,
    type: String,
    // (v0.14.1) Objeto clave → etiqueta: con un array, Foundry usa los índices como valor y el
    // valor por defecto "Mediano" no coincidía con ninguna opción (se mostraba "Diminuto").
    choices: Object.fromEntries(CATEGORIAS_TAMANO.map(t => [t, t])),
    default: "Mediano",
    onChange: onUpdateCallback
  });

  // 9. Movimiento Base Predeterminado
  game.settings.register(SYSTEM_ID, "movimientoBase", {
    name: "Movimiento Base Predeterminado",
    hint: "Metros de movimiento base por defecto para nuevos personajes y criaturas. El Movimiento Máximo = Base + (Físico × 5). Puede editarse individualmente en cada ficha.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    onChange: onUpdateCallback
  });

  // 10. (v0.14.1) Modo de lanzar los dados de Crítico y Pifia.
  game.settings.register(SYSTEM_ID, "modoCriticosPifias", {
    name: "Tirar Críticos y Pifias",
    hint: "Automático: los dados extra del Crítico y la Pifia se lanzan solos. Manual: la tarjeta de la tirada muestra los botones «Tirar Crítico» / «Tirar Pifia» y quien lanzó la tirada debe pulsarlos para completarla.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      automatico: "Automático",
      manual: "Manual (clic en la tarjeta de la tirada)"
    },
    default: "automatico"
  });

  // 11. Valores de los botones de dificultad rápida del Panel del Master (7 botones).
  //     Oculto en la configuración: se edita con clic derecho sobre cada botón del panel.
  game.settings.register(SYSTEM_ID, "presetsDificultad", {
    name: "Presets de Dificultad del Panel del Master",
    scope: "world",
    config: false,
    type: Array,
    default: [...PRESETS_DIFICULTAD_POR_DEFECTO],
    onChange: onUpdateCallback
  });
}
