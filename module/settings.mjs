/**
 * @file settings.mjs
 * @description Registro centralizado de opciones de configuración del sistema (game.settings)
 * para Foundry VTT v14. Permite al Master personalizar los valores iniciales y base
 * de Jugadores y PNJs sin tocar el código.
 */

import { SISTEMA_CONFIG } from "./config.mjs";

const SYSTEM_ID = "cartas-y-dados";

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
    hint: "Cantidad inicial de dados en Vigor, Destreza, Ingenio y Voluntad al crear un Personaje Jugador.",
    scope: "world",
    config: true,
    type: Number,
    default: 2,
    onChange: onUpdateCallback
  });

  // 6. Cansancio Máximo (Jugadores)
  game.settings.register(SYSTEM_ID, "cansancioMaxPJ", {
    name: "Cansancio Máximo Base (Jugadores)",
    hint: "Límite base de puntos de Cansancio para los Personajes Jugadores.",
    scope: "world",
    config: true,
    type: Number,
    default: 6,
    onChange: onUpdateCallback
  });

  // 7. Cansancio Máximo (PNJs / Criaturas)
  game.settings.register(SYSTEM_ID, "cansancioMaxPNJ", {
    name: "Cansancio Máximo Base (PNJs / Criaturas)",
    hint: "Límite base de puntos de Cansancio para los PNJs y criaturas.",
    scope: "world",
    config: true,
    type: Number,
    default: 4,
    onChange: onUpdateCallback
  });
}