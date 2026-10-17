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
    vigor: "CARTASYDADOS.Caracteristicas.Vigor",
    destreza: "CARTASYDADOS.Caracteristicas.Destreza",
    ingenio: "CARTASYDADOS.Caracteristicas.Ingenio",
    voluntad: "CARTASYDADOS.Caracteristicas.Voluntad"
  },

  /**
   * Palos de las cartas y a qué característica del personaje están vinculados.
   * Cuando se juega una carta de un palo, se lanzan tantos dados como el valor
   * de la característica asociada (`caracteristicaAsociada`).
   */
  palosCartas: {
    espadas: {
      etiqueta: "CARTASYDADOS.Palos.Espadas",
      caracteristicaAsociada: "vigor",
      acciones: "Ataques cuerpo a cuerpo y proezas de fuerza"
    },
    copas: {
      etiqueta: "CARTASYDADOS.Palos.Copas",
      caracteristicaAsociada: "voluntad",
      acciones: "Interacción social, apoyo y canalización"
    },
    oros: {
      etiqueta: "CARTASYDADOS.Palos.Oros",
      caracteristicaAsociada: "ingenio",
      acciones: "Táctica, percepción, trampas y conocimientos"
    },
    bastos: {
      etiqueta: "CARTASYDADOS.Palos.Bastos",
      caracteristicaAsociada: "destreza",
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
  manoBasePorDefecto: 4
};