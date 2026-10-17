/**
 * @file actor-model.mjs
 * @description Esquema de datos (TypeDataModel) para Actores en Foundry VTT v14.
 * - Calcula Salud Máxima Total = Salud Base + Vigor Total + Bonos (Raza/Origen/Clase/Equipo).
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
        vigor: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        destreza: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        ingenio: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        }),
        voluntad: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("atributoInicialPJ", 2),
          min: 1,
          max: 10
        })
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
   * Trinkets en Juego y la nueva fórmula de Salud Máxima (Base + Vigor + Otros).
   */
  prepareDerivedData() {
    super.prepareDerivedData();

    const items = this.parent?.items ?? [];

    this.itemRaza = items.find(i => i.type === "raza") ?? null;
    this.itemOrigen = items.find(i => i.type === "origen") ?? null;
    this.itemClase = items.find(i => i.type === "clase") ?? null;

    const bonosCaract = { vigor: 0, destreza: 0, ingenio: 0, voluntad: 0 };
    let bonoDefensa = 0;
    let bonoManoItems = 0;
    let bonoSaludOtros = 0;
    let bonoCansancioMax = 0;

    for (const item of items) {
      if (item.type === "objeto" && !item.system.equipado) continue;

      const b = item.system.bonificadores;
      if (!b) continue;

      bonosCaract.vigor += b.vigor || 0;
      bonosCaract.destreza += b.destreza || 0;
      bonosCaract.ingenio += b.ingenio || 0;
      bonosCaract.voluntad += b.voluntad || 0;

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
      vigor: Math.max(1, this.caracteristicas.vigor + bonosCaract.vigor),
      destreza: Math.max(1, this.caracteristicas.destreza + bonosCaract.destreza),
      ingenio: Math.max(1, this.caracteristicas.ingenio + bonosCaract.ingenio),
      voluntad: Math.max(1, this.caracteristicas.voluntad + bonosCaract.voluntad)
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

    // NUEVA REGLA: Salud Máxima = Base (salud.max) + Vigor Total + Otros Bonos (Raza/Origen/Clase/Equipo)
    this.salud.bonoVigor = this.caracteristicasTotales.vigor;
    this.salud.bonoOtros = bonoSaludOtros;
    this.salud.maxTotal = Math.max(
      1,
      this.salud.max + this.salud.bonoVigor + this.salud.bonoOtros
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
        vigor: crearCampoDadoPnj(),
        destreza: crearCampoDadoPnj(),
        ingenio: crearCampoDadoPnj(),
        voluntad: crearCampoDadoPnj()
      })
    };
  }
}