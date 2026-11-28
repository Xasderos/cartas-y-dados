/**
 * @file gm-panel.mjs
 * @description Panel de Control del Master (ApplicationV2) para Foundry VTT v14.
 * Cuadrícula visual minimalista de iconos y números con enlaces directos a cada ficha y pila,
 * con una sección para Personajes Jugadores y otra para PNJ (Mazo de Jefe opcional).
 */

import { VentanaDinamicaMixin, opcionesDialogoSistema } from "./ventana-dinamica.mjs";

import { PRESETS_DIFICULTAD_POR_DEFECTO } from "../settings.mjs";
import { preguntarTipoDescanso } from "../documents/actor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class PanelMasterApp extends VentanaDinamicaMixin(HandlebarsApplicationMixin(ApplicationV2)) {

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
      title: "Panel del Master — Cartas y Dados",
      icon: "fa-solid fa-crown"
    },
    actions: {
      ajustarDificultad: PanelMasterApp.#onAjustarDificultad,
      fijarDificultad: PanelMasterApp.#onFijarDificultad,
      ajustarPeligro: PanelMasterApp.#onAjustarPeligro, // (v0.20.0)
      abrirFichaActor: PanelMasterApp.#onAbrirFichaActor,
      abrirPilaActor: PanelMasterApp.#onAbrirPilaActor,
      ajustarCansancio: PanelMasterApp.#onAjustarCansancio,
      robarGrupo: PanelMasterApp.#onRobarGrupo,
      finCombateGrupo: PanelMasterApp.#onFinCombateGrupo,
      descansoGrupo: PanelMasterApp.#onDescansoGrupo
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/apps/panel-master.hbs",
      scrollable: [".cyd-gm-zona-listas"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const dificultadActual = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;
    // (v0.20.0) Nivel de peligro del encuentro (Brujo · Ritual de espíritu).
    const nivelPeligro = game.settings.get("cartas-y-dados", "nivelPeligro") || 0;
    const presetsDificultad = PanelMasterApp.#leerPresetsDificultad().map((valor, indice) => ({
      valor,
      indice,
      activo: valor === dificultadActual
    }));

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

    const pnjs = game.actors
      .filter(a => a.type === "pnj")
      .map(actor => PanelMasterApp.#resumirPnj(actor));

    return {
      ...context,
      dificultadActual,
      presetsDificultad,
      nivelPeligro,
      personajes,
      pnjs
    };
  }

  /**
   * Construye el resumen compacto de un PNJ para la cuadrícula del Panel del Master.
   * El Mazo de Jefe se considera activo si existen sus 4 pilas (mazo, mano, descarte,
   * quemadas), con el mismo criterio que `HojaPnjActor`. Los PNJ no usan Trinkets.
   * @param {Actor} actor - Actor de tipo `pnj`.
   * @returns {object} Datos listos para `panel-master.hbs`.
   */
  static #resumirPnj(actor) {
    actor.prepareData();
    const sys = actor.system;
    const pilas = sys.pilasDocumentos ?? {};
    const tieneMazoJefe = Boolean(pilas.mazo && pilas.mano && pilas.descarte && pilas.quemadas);

    return {
      id: actor.id,
      nombre: actor.name,
      img: actor.img,
      amenaza: sys.amenaza,
      saludActual: sys.salud.value,
      saludMax: sys.salud.maxTotal,
      defensaTotal: sys.defensaTotal,
      cansancioActual: sys.cansancio.value,
      cansancioMax: sys.cansancio.maxTotal,
      limiteMano: sys.limiteMano,
      tieneMazoJefe,
      manoActual: pilas.mano?.cards.size ?? 0,
      mazoDisponibles: pilas.mazo?.availableCards.length ?? 0,
      mazoTotal: pilas.mazo?.cards.size ?? 0,
      descarteActual: pilas.descarte?.cards.size ?? 0,
      quemadasActual: pilas.quemadas?.cards.size ?? 0
    };
  }

  /**
   * Lee los 7 valores de dificultad rápida del ajuste `presetsDificultad`,
   * completando con los valores por defecto si el ajuste está incompleto o corrupto.
   * @returns {number[]} Siempre 7 enteros >= 0.
   */
  static #leerPresetsDificultad() {
    let guardados = [];
    try {
      guardados = game.settings.get("cartas-y-dados", "presetsDificultad") ?? [];
    } catch (err) {
      guardados = [];
    }
    return PRESETS_DIFICULTAD_POR_DEFECTO.map((porDefecto, i) => {
      const valor = Number(guardados?.[i]);
      return Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : porDefecto;
    });
  }

  /**
   * Clic derecho sobre un botón de dificultad rápida: abre un `DialogV2` para
   * cambiar su valor y lo guarda en el ajuste de mundo `presetsDificultad`.
   * @param {HTMLElement} boton - Botón `.cyd-gm-preset` con `data-indice`.
   */
  async _editarPresetDificultad(boton) {
    const indice = Number(boton.dataset.indice);
    const presets = PanelMasterApp.#leerPresetsDificultad();
    if (!Number.isInteger(indice) || indice < 0 || indice >= presets.length) return;

    const nuevoValor = await DialogV2.prompt({
      ...opcionesDialogoSistema({ width: 320 }),
      window: { title: `Editar Dificultad Rápida ${indice + 1}`, icon: "fa-solid fa-bullseye" },
      content: `<div class="form-group"><label>Valor de dificultad:</label><input type="number" name="valorPreset" value="${presets[indice]}" min="0" step="1" autofocus /></div>`,
      ok: {
        label: "Guardar",
        icon: "fa-solid fa-floppy-disk",
        callback: (event, button) => button.form.elements.valorPreset.value
      },
      rejectClose: false
    });

    if (nuevoValor === null || nuevoValor === undefined || nuevoValor === "") return;
    const valor = Math.max(0, Math.floor(Number(nuevoValor) || 0));
    presets[indice] = valor;
    await game.settings.set("cartas-y-dados", "presetsDificultad", presets);
    this.render();
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const boton of this.element.querySelectorAll(".cyd-gm-preset")) {
      boton.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        this._editarPresetDificultad(boton);
      });
    }
    const inputDif = this.element.querySelector(".cyd-gm-input-dificultad");
    if (inputDif) {
      inputDif.addEventListener("change", async ev => {
        const nuevoValor = Math.max(0, Number(ev.target.value) || 0);
        await game.settings.set("cartas-y-dados", "dificultadMaster", nuevoValor);
        this.render();
      });
    }
    // (v0.20.0) Nivel de peligro escrito a mano.
    const inputPeligro = this.element.querySelector(".cyd-gm-input-peligro");
    if (inputPeligro) {
      inputPeligro.addEventListener("change", async ev => {
        await game.settings.set("cartas-y-dados", "nivelPeligro", Math.max(0, Math.floor(Number(ev.target.value) || 0)));
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

  /**
   * (v0.20.0) Sube o baja el Nivel de peligro del encuentro (`data-delta`), mínimo 0. Lo usa el
   * abalorio «Ritual de espíritu» (Brujo) para multiplicar las tiradas de su portador.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onAjustarPeligro(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    const actual = game.settings.get("cartas-y-dados", "nivelPeligro") || 0;
    await game.settings.set("cartas-y-dados", "nivelPeligro", Math.max(0, actual + delta));
    this.render();
  }

  static async #onFijarDificultad(event, target) {
    const valor = Math.max(0, Number(target.dataset.valor) || 0);
    await game.settings.set("cartas-y-dados", "dificultadMaster", valor);
    this.render();
  }

  /**
   * Abre la ficha individual del Actor seleccionado (PJ o PNJ).
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
    await actor.cambiarAgotamiento(delta);
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
    const opciones = await preguntarTipoDescanso("el grupo");
    if (!opciones) return;
    for (const actor of game.actors.filter(a => a.type === "personaje")) {
      if (actor.system.pilasDocumentos?.mazo) await actor.realizarDescanso(opciones);
    }
    this.render();
  }
}