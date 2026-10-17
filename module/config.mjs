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
      caracteristicaAsociada: "fisico",
      acciones: "Ataques cuerpo a cuerpo y proezas de fuerza"
    },
    copas: {
      etiqueta: "CARTASYDADOS.Palos.Copas",
      caracteristicaAsociada: "misticismo",
      acciones: "Interacción social, apoyo y canalización"
    },
    oros: {
      etiqueta: "CARTASYDADOS.Palos.Oros",
      caracteristicaAsociada: "social",
      acciones: "Táctica, percepción, trampas y conocimientos"
    },
    bastos: {
      etiqueta: "CARTASYDADOS.Palos.Bastos",
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

  /**\n   * Movimiento base en metros por turno antes de aplicar bonificadores de Físico.\n   * Fórmula: movimientoMax = movimientoBase + (caracteristicasTotales.fisico * 5)\n   */  
  movimientoBase: 10,

  /**\n   * Categoría de tamaño por defecto para nuevos actores.\n   * Opciones: Diminuto, Pequeño, Mediano, Grande, Enorme.\n   */  
  tamanoBase: "Mediano"
};