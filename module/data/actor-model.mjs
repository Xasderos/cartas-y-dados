/**
 * @file actor-model.mjs
 * @description Esquema de datos (TypeDataModel) para Actores en Foundry VTT v14.
 * - Calcula Salud Máxima Total = Salud Base + Físico Total + Bonos (Raza/Origen/Clase/Equipo).
 * - Añade dados configurables por característica de forma individual para los PNJs.
 */

import { SISTEMA_CONFIG, estadoAgotamiento, razaBaseDeActor } from "../config.mjs";
import { leerAjuste } from "../settings.mjs";

const { TypeDataModel } = foundry.abstract;
const { BooleanField, NumberField, SchemaField, StringField, HTMLField, ForeignDocumentField } = foundry.data.fields;

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

      // Agotamiento (v0.12.0). Clave histórica `cansancio` (no cambiar: datos guardados y barra
      // secundaria del Token). `max` se fuerza en prepareDerivedData a AGOTAMIENTO_MAXIMO (8).
      cansancio: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max: new NumberField({ required: true, integer: true, initial: SISTEMA_CONFIG.AGOTAMIENTO_MAXIMO, min: 1 })
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
        base: new NumberField({
          required: true,
          integer: true,
          initial: () => leerAjuste("movimientoBase", SISTEMA_CONFIG.movimientoBase),
          min: 0
        }),
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

      // Estado de los rasgos raciales con usos limitados o interruptores (v0.13.0).
      rasgosRaza: new SchemaField({
        // Humanos · Espera un momento: repetir una tirada (1 por descanso).
        esperaUnMomentoUsado: new BooleanField({ required: true, initial: false }),
        // Sierpes · Tradición alquímica: ungüento curativo (1 por día = descanso cómodo).
        alquimiaUsada: new BooleanField({ required: true, initial: false }),
        // Sierpes · Sangre fría: sufriendo por la exposición a los elementos (Mano Máx. ÷ 2).
        expuestoElementos: new BooleanField({ required: true, initial: false })
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

    for (const item of items) {
      try {
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
      } catch (error) {
        console.warn("[Cartas y Dados] Error calculando bonificadores derivados del ítem", item?.id, error);
      }
    }

    // Rasgos raciales (v0.13.0): bonos fijos de la raza base (p. ej. Sierpes: +1 Defensa).
    const razaBase = razaBaseDeActor(this.parent);
    this.razaBase = razaBase?.clave ?? null;
    const bonosRaza = razaBase?.config.bonificadores ?? {};
    this.bonoDefensaRaza = Number(bonosRaza.defensa) || 0;
    bonoDefensa += this.bonoDefensaRaza;

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

    // Garantizar siempre un objeto de pilas aunque `game.cards` aún no esté hidratado
    // (al recargar el mundo, prepareDerivedData puede ejecutarse antes de que las
    // colecciones de Foundry estén disponibles; nunca debe quedar undefined).
    this.pilasDocumentos = this.pilasDocumentos ?? {};

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

    // Agotamiento (v0.12.0): consecuencias acumulativas por nivel (ver SISTEMA_CONFIG.AGOTAMIENTO_NIVELES).
    const agotamiento = estadoAgotamiento(this.cansancio.value);
    this.agotamiento = agotamiento;
    this.cansancio.max = agotamiento.maximo;
    this.cansancio.maxTotal = agotamiento.maximo;

    const { base, bonificadorClase, bonificadorObjetos, bonificadorAtributos } = this.manoConfig;
    this.limiteManoSinAgotamiento = Math.max(
      1,
      base + bonificadorClase + bonificadorObjetos + bonificadorAtributos
    );
    // Agotamiento 1: mano máxima a la mitad (hacia arriba).
    this.limiteMano = agotamiento.efectos.manoMitad
      ? Math.max(1, Math.ceil(this.limiteManoSinAgotamiento / 2))
      : this.limiteManoSinAgotamiento;
    // Sierpes · Sangre fría (v0.13.0): expuesta a los elementos → Mano Máx. a la mitad
    // (se acumula con la reducción por Agotamiento).
    this.manoMitadPorSangreFria = this.razaBase === "sierpes" && Boolean(this.rasgosRaza?.expuestoElementos);
    if (this.manoMitadPorSangreFria) this.limiteMano = Math.max(1, Math.ceil(this.limiteMano / 2));

    // Movimiento máximo = Base editable (ajuste world "movimientoBase") + (Físico Total * 5) metros.
    // El campo `value` se sincroniza con `max` por compatibilidad con datos antiguos;
    // en las fichas solo se muestra el cuadro editable de Base y el Total calculado (v0.8.2).
    const baseMov = Number.isFinite(Number(this.movimiento.base))
      ? Number(this.movimiento.base)
      : SISTEMA_CONFIG.movimientoBase;
    this.movimiento.maxSinAgotamiento = baseMov + this.caracteristicasTotales.fisico * 5;
    // Agotamiento 2: velocidad a la mitad (hacia arriba, como el resto de reducciones).
    this.movimiento.max = agotamiento.efectos.velocidadMitad
      ? Math.ceil(this.movimiento.maxSinAgotamiento / 2)
      : this.movimiento.maxSinAgotamiento;
    this.movimiento.value = this.movimiento.max;

    // NUEVA REGLA: Salud Máxima = Base (salud.max) + Físico Total + Otros Bonos (Raza/Origen/Clase/Equipo)
    this.salud.bonoFisico = this.caracteristicasTotales.fisico;
    this.salud.bonoOtros = bonoSaludOtros;
    this.salud.maxSinAgotamiento = Math.max(
      1,
      this.salud.max + this.salud.bonoFisico + this.salud.bonoOtros
    );
    // Agotamiento 3: salud máxima a la mitad (hacia arriba).
    this.salud.maxTotal = agotamiento.efectos.saludMitad
      ? Math.max(1, Math.ceil(this.salud.maxSinAgotamiento / 2))
      : this.salud.maxSinAgotamiento;

    // Trastolillos · Que me da algo (v0.13.0): activo con la Salud actual a la mitad o menos.
    this.queMeDaAlgoActivo = this.razaBase === "trastolillos"
      && Number(this.salud.value) <= Math.floor(this.salud.maxTotal / 2);
  }
}

export class PersonajeDataModel extends BaseActorDataModel {
  static defineSchema() {
    const schema = super.defineSchema();
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