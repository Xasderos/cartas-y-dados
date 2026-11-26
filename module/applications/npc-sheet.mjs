/**
 * @file npc-sheet.mjs
 * @description Hoja de Criatura / PNJ (ApplicationV2) para Foundry VTT v14.
 * Permite configurar el tipo de dado por cada característica de forma individual
 * e integra las zonas del Mazo de Jefe (Mano, Mazo, Descarte y Quemadas) directamente en la ficha.
 */

import { VentanaDinamicaMixin } from "./ventana-dinamica.mjs";
import { RetratoFichaMixin } from "./retrato-ficha.mjs";

import { abreviadoPalo, generarNombreUnico, nombreVisibleCarta, contextoAgotamiento, contextoBarraSalud } from "../config.mjs";
import { preguntarTipoDescanso } from "../documents/actor.mjs";
import { htmlResolucionDificultad, publicarTirada, tirarDadosSistema } from "../dados.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class HojaPnjActor extends VentanaDinamicaMixin(RetratoFichaMixin(HandlebarsApplicationMixin(ActorSheetV2))) {

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
      fijarAgotamiento: HojaPnjActor.#onFijarAgotamiento,
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

    // Cartas en mano del Jefe (excluyendo Trinkets). El nombre visible nunca
    // muestra vacíos ni genéricos tipo "Unknown": usa un identificador
    // descriptivo (tipo + palo + dado) como respaldo (v0.8.2).
    const cartasEnMano = tieneMazoJefe
      ? (pilas.mano?.cards?.contents ?? [])
          .filter(c => c.type === "accion")
          .map(c => ({
            id: c.id,
            nombre: nombreVisibleCarta(c),
            palo: c.system?.palo,
            paloAbrev: abreviadoPalo(c.system?.palo),
            numero: c.system?.numero,
            tipoDado: c.system?.tipoDado,
            caracteristica: c.system?.caracteristicaAsociada,
            cantidadDados: system.caracteristicasTotales?.[c.system?.caracteristicaAsociada] ?? 1,
            seQuema: c.system?.seQuema,
            efecto: c.system?.efecto
          }))
      : [];

    return {
      ...context,
      actor,
      system,
      esPropietario: actor.isOwner,
      agotamiento: contextoAgotamiento(system.cansancio?.value),
      barraSalud: contextoBarraSalud(system.salud?.value, system.salud?.maxTotal),
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
    await this.document.usarHabilidad(target.dataset.itemId);
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
      fisico: "Físico (FISC)",
      consciencia: "Consciencia (CONS)",
      social: "Social (SOC)",
      misticismo: "Misticismo (MIST)"
    };
    const nombreCaract = nombresCaracteristicas[caracteristica] || caracteristica;

    // Tirada con Crítico y Pifia (v0.11.0, `module/dados.mjs`).
    const tirada = await tirarDadosSistema({
      cantidadDados: valorBase, tipoDado, rollData: actor.getRollData(),
      mitadPorAgotamiento: actor._tiradasAMitadPorAgotamiento()
    });
    const contenidoHtml = htmlResolucionDificultad(tirada);

    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `
        <div class="cyd-chat-tirada-pnj">
          <h4><i class="fa-solid fa-dice-d20"></i> Tirada de Atributo: ${nombreCaract}</h4>
          <p><small>${actor.name} lanza ${valorBase}${tipoDado} (${caracteristicaTotal} dados totales)</small></p>
          ${tirada.html}
          ${contenidoHtml}
        </div>
      `
    };

    await publicarTirada(tirada, chatData);
  }

  /* ======================================================================== */
  /*  ACCIONES DEL MAZO DE JEFE (INTEGRADO EN LA FICHA DEL PNJ)               */
  /* ======================================================================== */

  static async #onInicializarPilasJefe() {
    // Solo crea/vincula las 6 pilas; el Master puebla el Mazo de Jefe manualmente
    await this.document.inicializarPilasDeJugador();
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

  /** Descanso: pregunta si es cómodo y seguro (−1 Agotamiento) antes de realizarlo (v0.12.0). */
  /**
   * Clic en un segmento de la barra de Agotamiento (v0.12.0): fija ese nivel; si se pulsa
   * el segmento del nivel actual, baja uno (permite volver a 0).
   */
  static async #onFijarAgotamiento(event, target) {
    const nivel = Number(target.dataset.nivel) || 0;
    const actual = Number(this.document.system.cansancio?.value) || 0;
    const nuevo = nivel === actual ? nivel - 1 : nivel;
    await this.document.cambiarAgotamiento(nuevo - actual);
  }

  static async #onDescansar() {
    const opciones = await preguntarTipoDescanso(this.document.name);
    if (!opciones) return;
    await this.document.realizarDescanso(opciones);
    this.render();
  }

  static async #onAbrirPila(event, target) {
    const docPila = this.document.system.pilasDocumentos?.[target.dataset.pila];
    if (docPila) docPila.sheet.render(true);
  }

  static async #onCrearCartaEnMazo() {
    const pilas = this.document.system.pilasDocumentos;
    const mazo = pilas?.mazo;
    if (!mazo) return;

    const nombresEnMazo = [...mazo.cards].map(c => c.name);
    const nombreUnico = generarNombreUnico(nombresEnMazo, "Nueva Carta de Jefe");

    // Payload normalizado (name/face/faces/back sincronizados) para evitar "Unknown"
    const [nuevaCarta] = await mazo.createEmbeddedDocuments("Card", [
      this.document._normalizarPayloadCarta({ name: nombreUnico, type: "accion" })
    ]);
    if (nuevaCarta) nuevaCarta.sheet.render(true);
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