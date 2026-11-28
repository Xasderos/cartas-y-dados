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
const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Esquema reutilizable de bonificadores que cualquier Raza, Origen, Clase u Objeto
 * puede aportar al personaje.
 * @returns {Object} Campos de esquema de bonificadores.
 */
function esquemaBonificadoresPersonaje() {
  return {
    bonificadores: new SchemaField({
      // Modificadores a las 4 características (afectan al número de dados lanzados por palo)
      fisico: new NumberField({ required: true, integer: true, initial: 0 }),
      consciencia: new NumberField({ required: true, integer: true, initial: 0 }),
      social: new NumberField({ required: true, integer: true, initial: 0 }),
      misticismo: new NumberField({ required: true, integer: true, initial: 0 }),

      // Modificadores a Defensa, Mano Máxima y Salud (v0.12.0: sin bono de Cansancio Máx.;
      // el Agotamiento tiene escala fija 0-8)
      defensa: new NumberField({ required: true, integer: true, initial: 0 }),
      limiteMano: new NumberField({ required: true, integer: true, initial: 0 }),
      saludMax: new NumberField({ required: true, integer: true, initial: 0 })
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
      rasgoRacial: new StringField({ required: false, blank: true, initial: "" }),
      // Clave de `SISTEMA_CONFIG.RAZAS_BASE` (v0.10.1); vacía en razas personalizadas.
      claveRaza: new StringField({ required: false, blank: true, initial: "" })
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
 * (v0.10.0) El Item de Clase es el registro de progresión del personaje:
 * - `claveClase`: clave de `SISTEMA_CONFIG.CLASES_BASE` (vacía en clases personalizadas).
 * - `nivel`: nivel actual (lo sube `SistemaActor#subirDeNivel`).
 * - `historialNiveles`: una entrada por subida con la habilidad, el pack y (v0.15.0) la especialización elegidos.
 * - `especializacion` (v0.15.0): nombre de la especialización elegida (vacío hasta elegirla).
 *   (v0.18.0) Su progresión propia (`progresion` de la especialización) se suma a la de la clase.
 * - (v0.18.0) `bonificadores.limiteMano` acumula los «+1 Mano Máxima» de la progresión.
 * Los `bonificadores` se conservan por compatibilidad, pero las clases base no aportan ninguno.
 */
export class ClaseDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      ...esquemaBonificadoresPersonaje(),
      claveClase: new StringField({ required: true, blank: true, initial: "" }),
      historialNiveles: new ArrayField(new SchemaField({
        nivel: new NumberField({ required: true, integer: true, min: 2 }),
        habilidad: new StringField({ required: true, blank: true, initial: "" }),
        cartas: new StringField({ required: true, blank: true, initial: "" }),
        especializacion: new StringField({ required: false, blank: true, initial: "" }),
        // (v0.18.0) Abalorio obtenido y resto de beneficios (característica, Mano Máx., pasivas).
        abalorio: new StringField({ required: false, blank: true, initial: "" }),
        otros: new StringField({ required: false, blank: true, initial: "" })
      })),
      especializacion: new StringField({ required: false, blank: true, initial: "" }),
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
      // Si es true, activar la habilidad requiere consumir una Carta de Misticismo (Copas)
      // de la mano y lanzar dados. Si es false, el efecto se aplica directamente sin tirada.
      requiereTirada: new BooleanField({ required: true, initial: true }),
      esAtaque: new BooleanField({ required: true, initial: true }),
      caracteristica: new StringField({
        required: true,
        initial: "fisico",
        choices: ["fisico", "consciencia", "social", "misticismo"]
      }),
      tipoDado: new StringField({
        required: true,
        initial: "d6",
        choices: ["d4", "d6", "d8", "d10", "d12"]
      }),
      bonoTirada: new NumberField({ required: true, integer: true, initial: 0 }),
      // (v0.15.0) La tirada fija el valor X del efecto (sin Dificultad ni objetivo).
      valorX: new BooleanField({ required: true, initial: false }),
      // (v0.15.0) Usar la habilidad no gasta acción (se indica en el chat).
      sinAccion: new BooleanField({ required: true, initial: false }),

      // Automatización aplicada al activar la habilidad (solo los campos configurados tienen efecto)
      automatizacion: new SchemaField({
        curacion: new NumberField({ required: true, integer: true, initial: 0 }),
        cambioCansancio: new NumberField({ required: true, integer: true, initial: 0 }),
        robarCartas: new NumberField({ required: true, integer: true, initial: 0 })
      })
    };
  }
}