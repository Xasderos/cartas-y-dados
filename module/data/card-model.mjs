/**
 * @file card-model.mjs
 * @description Esquemas de datos (TypeDataModel) para Cartas de Acción y Trinkets en Foundry VTT v14.
 * Incluye efectos mecánicos automatizados (bono de tirada/daño, curación, robo extra,
 * modificación de cansancio y defensa activa mientras un Trinket está 'En Juego').
 */

import { SISTEMA_CONFIG } from "../config.mjs";

const { TypeDataModel } = foundry.abstract;
const { BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Sub-esquema reutilizable con los efectos mecánicos que se ejecutan automáticamente
 * al jugar una carta desde la mano.
 */
function esquemaEfectosMecanicos() {
  return new SchemaField({
    // Valor plano que se suma al total de los dados lanzados (y por tanto al daño si es ataque)
    bonoTirada: new NumberField({ required: true, integer: true, initial: 0 }),
    // Puntos de Salud que recupera el personaje al jugar esta carta
    curacion: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    // Cantidad de cartas extra que roba inmediatamente después de resolver la carta
    robarCartas: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    // Modificador al Cansancio (ej. -1 para aliviar 1 punto de cansancio, +1 si la carta agota)
    cambioCansancio: new NumberField({ required: true, integer: true, initial: 0 })
  });
}

export class CartaAccionDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      palo: new StringField({
        required: true,
        initial: "espadas",
        choices: () => Object.keys(CONFIG.CARTASYDADOS?.palosCartas ?? SISTEMA_CONFIG.palosCartas)
      }),

      numero: new NumberField({
        required: true,
        integer: true,
        initial: 2,
        min: 1,
        max: 5
      }),

      esAtaque: new BooleanField({
        required: true,
        initial: true
      }),

      seQuema: new BooleanField({
        required: true,
        initial: false
      }),

      // Efectos mecánicos automáticos al jugar la carta
      automatizacion: esquemaEfectosMecanicos(),

      efecto: new HTMLField({
        required: false,
        blank: true,
        initial: ""
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const config = CONFIG.CARTASYDADOS ?? SISTEMA_CONFIG;
    this.tipoDado = config.dadoPorNumeroCarta[this.numero] ?? "d6";
    this.caracteristicaAsociada = config.palosCartas[this.palo]?.caracteristicaAsociada ?? "fisico";
  }
}

export class CartaTrinketDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      efectoPermanente: new HTMLField({
        required: false,
        blank: true,
        initial: ""
      }),

      efectoAlJugar: new HTMLField({
        required: false,
        blank: true,
        initial: ""
      }),

      realizaTirada: new BooleanField({
        required: true,
        initial: false
      }),

      esAtaque: new BooleanField({
        required: true,
        initial: false
      }),

      palo: new StringField({
        required: true,
        initial: "oros",
        choices: () => Object.keys(CONFIG.CARTASYDADOS?.palosCartas ?? SISTEMA_CONFIG.palosCartas)
      }),

      numero: new NumberField({
        required: true,
        integer: true,
        initial: 3,
        min: 1,
        max: 5
      }),

      // Bonificador a la Defensa del jugador mientras este Trinket permanezca 'En Juego'
      bonoDefensaEnJuego: new NumberField({
        required: true,
        integer: true,
        initial: 0
      }),

      // Efectos mecánicos inmediatos al bajar el Trinket a la mesa
      automatizacion: esquemaEfectosMecanicos()
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const config = CONFIG.CARTASYDADOS ?? SISTEMA_CONFIG;
    this.tipoDado = config.dadoPorNumeroCarta[this.numero] ?? "d6";
    this.caracteristicaAsociada = config.palosCartas[this.palo]?.caracteristicaAsociada ?? "social";
  }
}