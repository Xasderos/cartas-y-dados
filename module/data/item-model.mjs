/**
 * @file item-model.mjs
 * @description Esquemas de datos (TypeDataModel) para los subtipos de Item en Foundry VTT v14:
 * - 'raza': Define la ascendencia biológica/cultural y sus bonificadores innatos.
 * - 'origen': Define el trasfondo previo del personaje y qué aporta a sus capacidades.
 * - 'clase': Define el arquetipo, el nivel y la progresión de mano/atributos.
 * - 'objeto': Equipo portátil que aplica sus bonificadores solo cuando está equipado.
 * - 'habilidad': Rasgos especiales pasivos o activos.
 */

const { TypeDataModel } = foundry.abstract;
const { BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Esquema reutilizable de bonificadores que cualquier Raza, Origen, Clase u Objeto
 * puede aportar al personaje.
 * @returns {Object} Campos de esquema de bonificadores.
 */
function esquemaBonificadoresPersonaje() {
  return {
    bonificadores: new SchemaField({
      // Modificadores a las 4 características (afectan al número de dados lanzados por palo)
      vigor: new NumberField({ required: true, integer: true, initial: 0 }),
      destreza: new NumberField({ required: true, integer: true, initial: 0 }),
      ingenio: new NumberField({ required: true, integer: true, initial: 0 }),
      voluntad: new NumberField({ required: true, integer: true, initial: 0 }),

      // Modificadores a Defensa, Mano Máxima, Salud y Cansancio
      defensa: new NumberField({ required: true, integer: true, initial: 0 }),
      limiteMano: new NumberField({ required: true, integer: true, initial: 0 }),
      saludMax: new NumberField({ required: true, integer: true, initial: 0 }),
      cansancioMax: new NumberField({ required: true, integer: true, initial: 0 })
    }),
    descripcion: new HTMLField({ required: false, blank: true, initial: "" })
  };
}

/**
 * 1. Modelo de datos para RAZA ('raza')
 */
export class RazaDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      rasgoRacial: new StringField({ required: false, blank: true, initial: "" })
    };
  }
}

/**
 * 2. Modelo de datos para ORIGEN ('origen')
 */
export class OrigenDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      beneficioTrasfondo: new StringField({ required: false, blank: true, initial: "" })
    };
  }
}

/**
 * 3. Modelo de datos para CLASE ('clase')
 */
export class ClaseDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      nivel: new NumberField({ required: true, integer: true, initial: 1, min: 1, max: 20 }),
      paloAfin: new StringField({
        required: true,
        initial: "espadas",
        choices: ["espadas", "bastos", "oros", "copas"]
      })
    };
  }
}

/**
 * 4. Modelo de datos para OBJETO / EQUIPO ('objeto')
 */
export class ObjetoDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      equipado: new BooleanField({ required: true, initial: true }),
      cantidad: new NumberField({ required: true, integer: true, initial: 1, min: 0 })
    };
  }
}

/**
 * 5. Modelo de datos para HABILIDAD / ATAQUE DE CRIATURA ('habilidad')
 * Permite definir rasgos pasivos o acciones/ataques directos (especialmente útiles para PNJs).
 */
export class HabilidadDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      origenHabilidad: new StringField({
        required: true,
        initial: "general",
        choices: ["raza", "origen", "clase", "criatura", "general"]
      }),
      // Si es true, muestra un botón para lanzar dados al usar la habilidad
      esActivable: new BooleanField({ required: true, initial: true }),
      esAtaque: new BooleanField({ required: true, initial: true }),
      caracteristica: new StringField({
        required: true,
        initial: "vigor",
        choices: ["vigor", "destreza", "ingenio", "voluntad"]
      }),
      tipoDado: new StringField({
        required: true,
        initial: "d6",
        choices: ["d4", "d6", "d8", "d10", "d12"]
      }),
      bonoTirada: new NumberField({ required: true, integer: true, initial: 0 })
    };
  }
}