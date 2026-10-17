/**
 * @file gm-panel.mjs
 * @description Panel de Control del Master (ApplicationV2) para Foundry VTT v14.
 * Cuadrícula visual minimalista de iconos y números con enlaces directos a cada ficha y pila.
 */

import { poblarCompendiosDelSistema } from "../compendios-base.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PanelMasterApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static instancia = null;

  static mostrar() {
    if (!game.user.isGM) {
      ui.notifications.warn("Solo el Master puede abrir el Panel de Control del Master.");
      return;
    }
    if (!this.instancia) {
      this.instancia = new PanelMasterApp();
    }
    this.instancia.render(true);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "cyd-panel-master",
    classes: ["cartas-y-dados", "cyd-gm-panel"],
    position: {
      width: 680,
      height: 540
    },
    window: {
      resizable: true,
      title: "👑 Panel del Master — Cartas y Dados"
    },
    actions: {
      ajustarDificultad: PanelMasterApp.#onAjustarDificultad,
      fijarDificultad: PanelMasterApp.#onFijarDificultad,
      abrirFichaActor: PanelMasterApp.#onAbrirFichaActor,
      abrirPilaActor: PanelMasterApp.#onAbrirPilaActor,
      ajustarCansancio: PanelMasterApp.#onAjustarCansancio,
      robarGrupo: PanelMasterApp.#onRobarGrupo,
      finCombateGrupo: PanelMasterApp.#onFinCombateGrupo,
      descansoGrupo: PanelMasterApp.#onDescansoGrupo,
      poblarCompendios: PanelMasterApp.#onPoblarCompendios
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/apps/panel-master.hbs",
      scrollable: [".cyd-gm-lista-personajes"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const dificultadActual = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;

    const personajes = game.actors
      .filter(a => a.type === "personaje")
      .map(actor => {
        actor.prepareData();
        const sys = actor.system;
        const pilas = sys.pilasDocumentos ?? {};
        const inicializado = Boolean(pilas.mazo && pilas.mano);

        const resumenTrinkets = actor.obtenerResumenTrinkets();
        const trinketsEnJuego = resumenTrinkets.filter(t => t.estado === "enJuego");
        const nombresEnJuego = trinketsEnJuego.map(t => t.nombre).join(", ") || "Ninguno";

        return {
          id: actor.id,
          nombre: actor.name,
          img: actor.img,
          saludActual: sys.salud.value,
          saludMax: sys.salud.maxTotal,
          defensaTotal: sys.defensaTotal,
          cansancioActual: sys.cansancio.value,
          cansancioMax: sys.cansancio.maxTotal,
          limiteMano: sys.limiteMano,
          inicializado,
          manoActual: pilas.mano?.cards.size ?? 0,
          mazoDisponibles: pilas.mazo?.availableCards.length ?? 0,
          mazoTotal: pilas.mazo?.cards.size ?? 0,
          descarteActual: pilas.descarte?.cards.size ?? 0,
          quemadasActual: pilas.quemadas?.cards.size ?? 0,
          trinketsDisponibles: pilas.trinkets?.availableCards.length ?? 0,
          trinketsTotal: pilas.trinkets?.cards.size ?? 0,
          enJuegoActual: trinketsEnJuego.length,
          nombresEnJuego
        };
      });

    return {
      ...context,
      dificultadActual,
      personajes
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const inputDif = this.element.querySelector(".cyd-gm-input-dificultad");
    if (inputDif) {
      inputDif.addEventListener("change", async ev => {
        const nuevoValor = Math.max(0, Number(ev.target.value) || 0);
        await game.settings.set("cartas-y-dados", "dificultadMaster", nuevoValor);
        this.render();
      });
    }
  }

  /* ======================================================================== */
  /*  ACCIONES DEL PANEL DEL MASTER                                           */
  /* ======================================================================== */

  static async #onAjustarDificultad(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    const actual = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;
    await game.settings.set("cartas-y-dados", "dificultadMaster", Math.max(0, actual + delta));
    this.render();
  }

  static async #onFijarDificultad(event, target) {
    const valor = Math.max(0, Number(target.dataset.valor) || 0);
    await game.settings.set("cartas-y-dados", "dificultadMaster", valor);
    this.render();
  }

  /**
   * Abre la Hoja de Personaje individual del jugador seleccionado.
   */
  static async #onAbrirFichaActor(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (actor) actor.sheet.render(true);
  }

  /**
   * Abre directamente la ventana de una pila específica del jugador
   * ('mano', 'mazo', 'descarte', 'quemadas', 'trinkets' o 'enJuego').
   */
  static async #onAbrirPilaActor(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    const clavePila = target.dataset.pila;
    if (!actor || !clavePila) return;

    actor.prepareData();
    const docPila = actor.system.pilasDocumentos?.[clavePila];
    if (docPila) {
      docPila.sheet.render(true);
    } else {
      ui.notifications.warn(`${actor.name} no tiene inicializada la pila "${clavePila}".`);
    }
  }

  static async #onAjustarCansancio(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor) return;
    const delta = Number(target.dataset.delta) || 0;
    const nuevo = Math.max(0, actor.system.cansancio.value + delta);
    await actor.update({ "system.cansancio.value": nuevo });
    this.render();
  }

  static async #onRobarGrupo() {
    for (const actor of game.actors.filter(a => a.type === "personaje")) {
      if (actor.system.pilasDocumentos?.mazo) await actor.robarHastaLimiteMano();
    }
    this.render();
  }

  static async #onFinCombateGrupo() {
    for (const actor of game.actors.filter(a => a.type === "personaje")) {
      if (actor.system.pilasDocumentos?.mazo) await actor.finalizarAccionOCombate();
    }
    this.render();
  }

  static async #onDescansoGrupo() {
    for (const actor of game.actors.filter(a => a.type === "personaje")) {
      if (actor.system.pilasDocumentos?.mazo) await actor.realizarDescanso();
    }
    this.render();
  }

  static async #onPoblarCompendios() {
    await poblarCompendiosDelSistema();
  }
}