/**
 * @file actor-model.mjs
 * @description Esquema de datos (TypeDataModel) para Actores en Foundry VTT v14.
 * - Calcula Salud Máxima Total = Salud Base + Físico Total + Bonos (Raza/Origen/Clase/Equipo).
 * - Añade dados configurables por característica de forma individual para los PNJs.
 */

import { SISTEMA_CONFIG } from "../config.mjs";
import { leerAjuste } from "../settings.mjs";

const { TypeDataModel } = foundry.abstract;
const { NumberField, SchemaField, StringField, HTMLField, ForeignDocumentField } = foundry.data.fields;

function crearCampoPila() {
  return new ForeignDocumentField(foundry.documents.BaseCards, {
    idOnly: true,
    required: false,
    nullable: true,
    initial: null
  });
}

function crearCampoDadoPnj() {
  return new StringField({
    required: true,
    initial: "d6",
    choices: ["d4", "d6", "d8", "d10", "d12"]
  });
}

export class BaseActorDataModel extends TypeDataModel {
  static defineSchema() {
    return {
      salud: new SchemaField({
        value: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("saludBase", 10),
          min: 0
        }),
        max: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("saludBase", 10),
          min: 1
        })
      }),

      cansancio: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("cansancioMaxPJ", 6),
          min: 1
        })
      }),

      defensa: new NumberField({
        required: true,
        integer: true,
        initial: () => leerAjuste("defensaBase", 5),
        min: 0
      }),

      caracteristicas: new SchemaField({
        fisico: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        consciencia: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        social: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        misticismo: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        })
      }),

      movimiento: new SchemaField({
        value: new NumberField({
          required: true,
          integer: true,
          initial: 0,
          min: 0
        }),
        max: new NumberField({
          required: true,
          integer: true,
          initial: () => SISTEMA_CONFIG.movimientoBase,
          min: 1
        })
      }),

      categoriaTamano: new StringField({
        required: true,
        initial: () => leerAjuste("tamanoBase", "Mediano"),
        choices: ["Diminuto", "Pequeño", "Mediano", "Grande", "Enorme"]
      }),

      manoConfig: new SchemaField({
        base: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("manoBase", SISTEMA_CONFIG.manoBasePorDefecto),
          min: 1
        }),
        bonificadorClase: new NumberField({ required: true, integer: true, initial: 0 }),
        bonificadorObjetos: new NumberField({ required: true, integer: true, initial: 0 }),
        bonificadorAtributos: new NumberField({ required: true, integer: true, initial: 0 })
      }),

      pilas: new SchemaField({
        mazoId: crearCampoPila(),
        manoId: crearCampoPila(),
        descarteId: crearCampoPila(),
        quemadasId: crearCampoPila(),
        trinketsId: crearCampoPila(),
        enJuegoId: crearCampoPila()
      }),

      biografia: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /**
   * Calcula todos los valores derivados sumando Raza, Origen, Clase, Equipo,
   * Trinkets en Juego y la nueva fórmula de Salud Máxima (Base + Físico + Otros).
   */
  prepareDerivedData() {
    super.prepareDerivedData();

    const items = this.parent?.items ?? [];

    this.itemRaza = items.find(i => i.type === "raza") ?? null;
    this.itemOrigen = items.find(i => i.type === "origen") ?? null;
    this.itemClase = items.find(i => i.type === "clase") ?? null;

    const bonosCaract = { fisico: 0, consciencia: 0, social: 0, misticismo: 0 };
    let bonoDefensa = 0;
    let bonoManoItems = 0;
    let bonoSaludOtros = 0;
    let bonoCansancioMax = 0;

    for (const item of items) {
      if (item.type === "objeto" && !item.system.equipado) continue;

      const b = item.system.bonificadores;
      if (!b) continue;

      bonosCaract.fisico += b.fisico || 0;
      bonosCaract.consciencia += b.consciencia || 0;
      bonosCaract.social += b.social || 0;
      bonosCaract.misticismo += b.misticismo || 0;

      bonoDefensa += b.defensa || 0;
      bonoManoItems += b.limiteMano || 0;
      bonoSaludOtros += b.saludMax || 0;
      bonoCansancioMax += b.cansancioMax || 0;
    }

    if (game.cards) {
      this.pilasDocumentos = {
        mazo: game.cards.get(this.pilas.mazoId) ?? null,
        mano: game.cards.get(this.pilas.manoId) ?? null,
        descarte: game.cards.get(this.pilas.descarteId) ?? null,
        quemadas: game.cards.get(this.pilas.quemadasId) ?? null,
        trinkets: game.cards.get(this.pilas.trinketsId) ?? null,
        enJuego: game.cards.get(this.pilas.enJuegoId) ?? null
      };

      if (this.pilasDocumentos.enJuego) {
        for (const trinketActivo of this.pilasDocumentos.enJuego.cards) {
          bonoDefensa += Number(trinketActivo.system?.bonoDefensaEnJuego) || 0;
        }
      }
    }

    this.bonificadoresCaracteristicas = bonosCaract;
    this.caracteristicasTotales = {
      fisico: Math.max(1, this.caracteristicas.fisico + bonosCaract.fisico),
      consciencia: Math.max(1, this.caracteristicas.consciencia + bonosCaract.consciencia),
      social: Math.max(1, this.caracteristicas.social + bonosCaract.social),
      misticismo: Math.max(1, this.caracteristicas.misticismo + bonosCaract.misticismo)
    };

    this.bonificadorDefensa = bonoDefensa;
    this.defensaTotal = Math.max(0, this.defensa + bonoDefensa);

    const nivelEfectivo = this.itemClase?.system.nivel ?? this.nivelClase ?? 1;
    this.nivelEfectivo = nivelEfectivo;
    this.manoConfig.bonificadorClase = Math.floor((nivelEfectivo - 1) / 3);
    this.manoConfig.bonificadorObjetos = bonoManoItems;

    const { base, bonificadorClase, bonificadorObjetos, bonificadorAtributos } = this.manoConfig;
    this.limiteMano = Math.max(
      1,
      base + bonificadorClase + bonificadorObjetos + bonificadorAtributos
    );

    // Movimiento máximo = Base [10] + (Físico Total * 5) metros
    this.movimiento.value = this.movimiento.max ?? SISTEMA_CONFIG.movimientoBase;
    this.movimiento.max = SISTEMA_CONFIG.movimientoBase + this.caracteristicasTotales.fisico * 5;

    // NUEVA REGLA: Salud Máxima = Base (salud.max) + Físico Total + Otros Bonos (Raza/Origen/Clase/Equipo)
    this.salud.bonoFisico = this.caracteristicasTotales.fisico;
    this.salud.bonoOtros = bonoSaludOtros;
    this.salud.maxTotal = Math.max(
      1,
      this.salud.max + this.salud.bonoFisico + this.salud.bonoOtros
    );

    this.cansancio.maxTotal = Math.max(1, this.cansancio.max + bonoCansancioMax);
  }
}

export class PersonajeDataModel extends BaseActorDataModel {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.cansancio = new SchemaField({
      value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      max: new NumberField({
        required: true,
        integer: true,
        initial: () => leerAjuste("cansancioMaxPJ", 6),
        min: 1
      })
    });
    return {
      ...schema,
      nivelClase: new NumberField({ required: true, integer: true, initial: 1, min: 1 })
    };
  }
}

/**
 * Modelo de datos para Criaturas y PNJs ('pnj').
 * Incluye el esquema `dadosCaracteristicas` para elegir el tipo de dado de cada atributo por separado.
 */
export class PnjDataModel extends BaseActorDataModel {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.cansancio = new SchemaField({
      value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      max: new NumberField({
        required: true,
        integer: true,
        initial: () => leerAjuste("cansancioMaxPNJ", 4),
        min: 1
      })
    });
    return {
      ...schema,
      amenaza: new NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      // Dado individual asignado a cada característica de la criatura
      dadosCaracteristicas: new SchemaField({
        fisico: crearCampoDadoPnj(),
        consciencia: crearCampoDadoPnj(),
        social: crearCampoDadoPnj(),
        misticismo: crearCampoDadoPnj()
      })
    };
  }
}