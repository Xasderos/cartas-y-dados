/**
 * @file npc-sheet.mjs
 * @description Hoja de Criatura / PNJ (ApplicationV2) para Foundry VTT v14.
 * Permite configurar el tipo de dado por cada característica de forma individual
 * e integra las zonas del Mazo de Jefe (Mano, Mazo, Descarte y Quemadas) directamente en la ficha.
 */

import { abreviadoPalo } from "../config.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class HojaPnjActor extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cartas-y-dados", "sheet", "actor", "pnj"],
    position: {
      width: 720,
      height: 760
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true,
      title: "Ficha de Criatura / PNJ"
    },
    actions: {
      usarHabilidad: HojaPnjActor.#onUsarHabilidad,
      crearItemPnj: HojaPnjActor.#onCrearItemPnj,
      editarItem: HojaPnjActor.#onEditarItem,
      eliminarItem: HojaPnjActor.#onEliminarItem,
      alternarEquipado: HojaPnjActor.#onAlternarEquipado,
      // Acciones del Mazo de Jefe integrado
      inicializarPilasJefe: HojaPnjActor.#onInicializarPilasJefe,
      robarTurno: HojaPnjActor.#onRobarTurno,
      jugarCarta: HojaPnjActor.#onJugarCarta,
      descartarCarta: HojaPnjActor.#onDescartarCarta,
      quemarCarta: HojaPnjActor.#onQuemarCarta,
      finCombate: HojaPnjActor.#onFinCombate,
      descansar: HojaPnjActor.#onDescansar,
      abrirPila: HojaPnjActor.#onAbrirPila,
      crearCartaEnMazo: HojaPnjActor.#onCrearCartaEnMazo,
      generarMazoBase: HojaPnjActor.#onGenerarMazoBase,
      tiradaAtributoPnj: HojaPnjActor.#onTiradaAtributoPnj
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/actor/hoja-pnj.hbs",
      scrollable: [".cyd-cuerpo-hoja"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    actor.prepareData();
    const system = actor.system;
    const pilas = system.pilasDocumentos ?? {};

    const habilidades = actor.items.filter(i => i.type === "habilidad");
    const objetos = actor.items.filter(i => i.type === "objeto");

    // Verificar si el PNJ tiene activado su Mazo de Jefe
    const tieneMazoJefe = Boolean(pilas.mazo && pilas.mano && pilas.descarte && pilas.quemadas);

    const contadoresPilas = tieneMazoJefe
      ? {
          mazoDisponibles: pilas.mazo.availableCards.length,
          mazoTotal: pilas.mazo.cards.size,
          manoActual: pilas.mano.cards.size,
          descarteActual: pilas.descarte.cards.size,
          quemadasActual: pilas.quemadas.cards.size
        }
      : null;

    // Cartas en mano del Jefe (excluyendo Trinkets)
    const cartasEnMano = tieneMazoJefe
      ? pilas.mano.cards.contents
          .filter(c => c.type === "accion")
          .map(c => ({
            id: c.id,
            nombre: c.name,
            palo: c.system.palo,
            paloAbrev: abreviadoPalo(c.system.palo),
            numero: c.system.numero,
            tipoDado: c.system.tipoDado,
            caracteristica: c.system.caracteristicaAsociada,
            cantidadDados: system.caracteristicasTotales[c.system.caracteristicaAsociada] ?? 1,
            seQuema: c.system.seQuema,
            efecto: c.system.efecto
          }))
      : [];

    return {
      ...context,
      actor,
      system,
      esPropietario: actor.isOwner,
      habilidades,
      objetos,
      tieneMazoJefe,
      contadoresPilas,
      cartasEnMano
    };
  }

  /* ======================================================================== */
  /*  ACCIONES DE ITEMS DEL PNJ                                               */
  /* ======================================================================== */

  static async #onUsarHabilidad(event, target) {
    await this.document.usarHabilidadItem(target.dataset.itemId);
  }

  static async #onCrearItemPnj(event, target) {
    const tipo = target.dataset.tipo || "habilidad";
    const nombrePorDefecto = tipo === "objeto" ? "Nuevo Equipo" : "Nuevo Ataque / Habilidad";

    const [nuevo] = await this.document.createEmbeddedDocuments("Item", [{
      name: nombrePorDefecto,
      type: tipo
    }]);

    this.render();
    if (nuevo) nuevo.sheet.render(true);
  }

  static async #onEditarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static async #onEliminarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) {
      await item.delete();
      this.render();
    }
  }

  static async #onAlternarEquipado(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item && item.type === "objeto") {
      await item.update({ "system.equipado": !item.system.equipado });
      this.render();
    }
  }

  /**
   * Permite al PNJ lanzar un atributo directamente sin necesidad de una carta.
   * Usa el valor de la característica y el tipo de dado configurado.
   */
  static async #onTiradaAtributoPnj(event, target) {
    const actor = this.document;
    const caracteristica = target.dataset.caracteristica;
    const tipoDado = target.dataset.dado || "d6";

    const sistema = actor.system;
    const valorBase = sistema.caracteristicas?.[caracteristica] ?? 1;
    const caracteristicaTotal = sistema.caracteristicasTotales?.[caracteristica] ?? valorBase;

    const nombresCaracteristicas = {
      fisico: "⚔️ Físico (FISC)",
      consciencia: "🦯 Consciencia (CONS)",
      social: "🪙 Social (SOC)",
      misticismo: "🏆 Misticismo (MIST)"
    };
    const nombreCaract = nombresCaracteristicas[caracteristica] || caracteristica;

    const formula = `${valorBase}${tipoDado}`;
    const roll = new Roll(formula, actor.getRollData());
    await roll.evaluate();

    let contenidoHtml = "";
    const dificultadMaster = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;

    if (dificultadMaster > 0) {
      const exito = roll.total >= dificultadMaster;
      const textoExito = exito ? "✅ ¡ÉXITO!" : "❌ FALLO";
      contenidoHtml = `
        <div class="cyd-resolucion-caja">
          <p>🎲 <strong>Dificultad del Master (${dificultadMaster}):</strong> ${textoExito} (Total: ${roll.total})</p>
        </div>
      `;
    } else {
      contenidoHtml = `
        <div class="cyd-resolucion-caja">
          <p>🎲 <strong>Resultado:</strong> ${roll.total}</p>
        </div>
      `;
    }

    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} lanza ${nombreCaract} — ${valorBase}${tipoDado} (${caracteristicaTotal} dados totales)`,
      content: `
        <div class="cyd-chat-tirada-pnj">
          <h4>🎲 Tirada de Atributo: ${nombreCaract}</h4>
          <p><strong>Fórmula:</strong> ${formula} = <strong>${roll.total}</strong></p>
          ${contenidoHtml}
        </div>
      `,
      rolls: [roll]
    };

    await ChatMessage.create(chatData);
  }

  /* ======================================================================== */
  /*  ACCIONES DEL MAZO DE JEFE (INTEGRADO EN LA FICHA DEL PNJ)               */
  /* ======================================================================== */

  static async #onInicializarPilasJefe() {
    await this.document.inicializarPilasDeJugador();
    await this.document.generarMazoInicialDePrueba();
    this.render();
  }

  static async #onRobarTurno() {
    await this.document.robarHastaLimiteMano();
    this.render();
  }

  static async #onJugarCarta(event, target) {
    const cartaId = target.dataset.cartaId;
    const modo = target.dataset.modo || "usar";
    await this.document.jugarCarta(cartaId, { modo });
    this.render();
  }

  static async #onFinCombate() {
    await this.document.finalizarAccionOCombate();
    this.render();
  }

  static async #onDescansar() {
    await this.document.realizarDescanso();
    this.render();
  }

  static async #onAbrirPila(event, target) {
    const docPila = this.document.system.pilasDocumentos?.[target.dataset.pila];
    if (docPila) docPila.sheet.render(true);
  }

  static async #onCrearCartaEnMazo() {
    const mazo = this.document.system.pilasDocumentos?.mazo;
    if (!mazo) return;

    const [nuevaCarta] = await mazo.createEmbeddedDocuments("Card", [{
      name: "Nueva Carta de Jefe",
      type: "accion"
    }]);
    if (nuevaCarta) nuevaCarta.sheet.render(true);
  }

  static async #onGenerarMazoBase() {
    await this.document.generarMazoInicialDePrueba();
    this.render();
  }

  static async #onDescartarCarta(event, target) {
    const cartaId = target.dataset.cartaId;
    await this.document.descartarCarta(cartaId);
    this.render();
  }

  static async #onQuemarCarta(event, target) {
    const cartaId = target.dataset.cartaId;
    await this.document.quemarCarta(cartaId);
    this.render();
  }
}