/**
 * @file actor-sheet.mjs
 * @description Hoja de Personaje ApplicationV2 con soporte integrado para Raza, Origen,
 * Clase, Objetos equipables y creador visual de Cartas/Trinkets.
 */

import { abreviadoPalo } from "../config.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class HojaPersonajeActor extends HandlebarsApplicationMixin(ActorSheetV2) {

  dificultadActual = 7;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cartas-y-dados", "sheet", "actor"],
    position: {
      width: 860,
      height: 820
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true,
      title: "Hoja de Personaje"
    },
    actions: {
      inicializarPilas: HojaPersonajeActor.#onInicializarPilas,
      robarTurno: HojaPersonajeActor.#onRobarTurno,
      jugarCarta: HojaPersonajeActor.#onJugarCarta,
      descartarCarta: HojaPersonajeActor.#onDescartarCarta,
      quemarCarta: HojaPersonajeActor.#onQuemarCarta,
      robarTrinket: HojaPersonajeActor.#onRobarTrinket,
      retirarTrinket: HojaPersonajeActor.#onRetirarTrinket,
      finCombate: HojaPersonajeActor.#onFinCombate,
      descansar: HojaPersonajeActor.#onDescansar,
      abrirPila: HojaPersonajeActor.#onAbrirPila,
      crearCartaEnMazo: HojaPersonajeActor.#onCrearCartaEnMazo,
      crearItem: HojaPersonajeActor.#onCrearItem,
      editarItem: HojaPersonajeActor.#onEditarItem,
      eliminarItem: HojaPersonajeActor.#onEliminarItem,
      generarMazoBase: HojaPersonajeActor.#onGenerarMazoBase,
      alternarEquipado: HojaPersonajeActor.#onAlternarEquipado,
      usarHabilidad: HojaPersonajeActor.#onUsarHabilidad
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/actor/hoja-personaje.hbs",
      scrollable: [".cyd-cuerpo-hoja"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const pilas = system.pilasDocumentos ?? {};

    const pilasInicializadas = Boolean(
      pilas.mazo && pilas.mano && pilas.enJuego && pilas.descarte && pilas.quemadas && pilas.trinkets
    );

    // Cartas en la mano usando caracteristicasTotales (Base + Raza + Origen + Clase + Equipo)
    const cartasEnMano = pilas.mano
      ? pilas.mano.cards.contents.map(c => ({
          id: c.id,
          nombre: c.name,
          tipo: c.type,
          esTrinket: c.type === "trinket",
          palo: c.system.palo,
          paloAbrev: abreviadoPalo(c.system.palo),
          numero: c.system.numero,
          tipoDado: c.system.tipoDado,
          caracteristica: c.system.caracteristicaAsociada,
          cantidadDados: system.caracteristicasTotales[c.system.caracteristicaAsociada] ?? 1,
          seQuema: c.system.seQuema,
          efecto: c.type === "trinket" ? c.system.efectoAlJugar : c.system.efecto
        }))
      : [];

    const todosLosTrinkets = actor.obtenerResumenTrinkets().map(t => {
      const tooltipHtml = `
        <div style='text-align:left; max-width:260px;'>
          <strong>${t.nombre}</strong> <em>(${t.etiquetaEstado})</em><hr/>
          <p><strong>Palo:</strong> ${abreviadoPalo(t.palo)} | <strong>Dado:</strong> ${t.tipoDado}</p>
          ${t.efectoPermanente ? `<p><strong>Pasivo:</strong> ${t.efectoPermanente}</p>` : ""}
          ${t.efectoAlJugar ? `<p><strong>Al Jugar:</strong> ${t.efectoAlJugar}</p>` : ""}
        </div>
      `;
      return {
        ...t,
        estaEnJuego: t.estado === "enJuego",
        estaDisponible: t.estado === "disponible",
        tooltipHtml
      };
    });

    const contadoresPilas = pilasInicializadas
      ? {
          mazoDisponibles: pilas.mazo.availableCards.length,
          mazoTotal: pilas.mazo.cards.size,
          manoActual: pilas.mano.cards.size,
          enJuegoActual: pilas.enJuego.cards.size,
          descarteActual: pilas.descarte.cards.size,
          quemadasActual: pilas.quemadas.cards.size,
          trinketsDisponibles: pilas.trinkets.availableCards.length,
          trinketsTotal: pilas.trinkets.cards.size
        }
      : null;

    // Clasificar los Items del Actor (Raza, Origen, Clase, Objetos y Habilidades)
    const objetos = actor.items.filter(i => i.type === "objeto");
    const habilidades = actor.items.filter(i => i.type === "habilidad");

    return {
      ...context,
      actor,
      system,
      esPropietario: actor.isOwner,
      dificultadActual: this.dificultadActual,
      pilasInicializadas,
      contadoresPilas,
      cartasEnMano,
      todosLosTrinkets,
      trinketsEnJuego: todosLosTrinkets.filter(t => t.estaEnJuego),
      itemRaza: system.itemRaza,
      itemOrigen: system.itemOrigen,
      itemClase: system.itemClase,
      objetos,
      habilidades
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const inputDificultad = this.element.querySelector(".cyd-input-dificultad");
    if (inputDificultad) {
      inputDificultad.addEventListener("change", ev => {
        this.dificultadActual = Number(ev.target.value) || 0;
      });
    }
  }

  /* ======================================================================== */
  /*  ACCIONES DE CARTAS Y TURNO                                              */
  /* ======================================================================== */

  static async #onInicializarPilas() {
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
    const dificultad = this.dificultadActual > 0 ? this.dificultadActual : null;
    await this.document.jugarCarta(cartaId, { dificultad, modo });
    this.render();
  }

  static async #onRobarTrinket(event, target) {
    const actor = this.document;
    const { mano } = actor.system.pilasDocumentos;
    const trinketsDisponibles = actor.obtenerResumenTrinkets().filter(t => t.estado === "disponible");

    if (!mano || mano.cards.size === 0) {
      ui.notifications.warn("Necesitas al menos 1 carta en tu mano para descartarla y robar un Trinket.");
      return;
    }
    if (trinketsDisponibles.length === 0) {
      ui.notifications.warn("No tienes Trinkets disponibles en reserva.");
      return;
    }

    const preId = target.dataset.trinketId || "";
    const opcionesMano = mano.cards.contents
      .map(c => `<option value="${c.id}">${c.name} (${abreviadoPalo(c.system.palo)} - ${c.system.tipoDado})</option>`)
      .join("");
    const opcionesTrinkets = trinketsDisponibles
      .map(t => `<option value="${t.idOriginal}" ${t.idOriginal === preId ? "selected" : ""}>${t.nombre} (${abreviadoPalo(t.palo)} - ${t.tipoDado})</option>`)
      .join("");

    const seleccion = await DialogV2.prompt({
      window: { title: "Robar Trinket por Descarte" },
      content: `
        <div class="form-group"><label>1. Carta de tu mano a descartar:</label><select name="cartaManoId">${opcionesMano}</select></div>
        <div class="form-group" style="margin-top:10px;"><label>2. Trinket a tomar:</label><select name="trinketId">${opcionesTrinkets}</select></div>
      `,
      ok: {
        label: "Descartar y Robar",
        callback: (event, button) => ({
          cartaManoId: button.form.elements.cartaManoId.value,
          trinketId: button.form.elements.trinketId.value
        })
      },
      rejectClose: false
    });

    if (seleccion?.cartaManoId && seleccion?.trinketId) {
      await actor.robarTrinketPorDescarte(seleccion.cartaManoId, seleccion.trinketId);
      this.render();
    }
  }

  static async #onRetirarTrinket(event, target) {
    await this.document.retirarTrinketEnJuego(target.dataset.trinketId, {
      quemar: target.dataset.quemar === "true"
    });
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

  /**
   * Crea una nueva Carta de Acción (en el Mazo) o un nuevo Trinket (en el Mazo de Trinkets)
   * y abre inmediatamente su editor visual ApplicationV2.
   */
  static async #onCrearCartaEnMazo(event, target) {
    const tipoCarta = target.dataset.tipoCarta || "accion";
    const pilas = this.document.system.pilasDocumentos;
    const pilaDestino = tipoCarta === "trinket" ? pilas?.trinkets : pilas?.mazo;

    if (!pilaDestino) return;

    const [nuevaCarta] = await pilaDestino.createEmbeddedDocuments("Card", [{
      name: tipoCarta === "trinket" ? "Nuevo Trinket" : "Nueva Carta de Acción",
      type: tipoCarta
    }]);

    if (nuevaCarta) {
      nuevaCarta.sheet.render(true);
    }
  }

  /* ======================================================================== */
  /*  ACCIONES DE RAZA, ORIGEN, CLASE Y EQUIPO (ITEMS)                        */
  /* ======================================================================== */

  /**
   * Crea un Item de tipo 'raza', 'origen', 'clase', 'objeto' o 'habilidad' dentro del Actor.
   * Si es Raza, Origen o Clase y ya tenía uno, abre el existente para editarlo.
   */
  static async #onCrearItem(event, target) {
    const tipo = target.dataset.tipo;
    const actor = this.document;

    if (["raza", "origen", "clase"].includes(tipo)) {
      const existente = actor.items.find(i => i.type === tipo);
      if (existente) {
        existente.sheet.render(true);
        return;
      }
    }

    const nombresPorDefecto = {
      raza: "Nueva Raza",
      origen: "Nuevo Origen",
      clase: "Nueva Clase",
      objeto: "Nuevo Objeto",
      habilidad: "Nueva Habilidad"
    };

    const [nuevoItem] = await actor.createEmbeddedDocuments("Item", [{
      name: nombresPorDefecto[tipo] ?? "Nuevo Elemento",
      type: tipo
    }]);

    if (nuevoItem) nuevoItem.sheet.render(true);
  }

  static async #onEditarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static async #onEliminarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) await item.delete();
  }

  static async #onAlternarEquipado(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item && item.type === "objeto") {
      await item.update({ "system.equipado": !item.system.equipado });
    }
  }

  static async #onGenerarMazoBase() {
    await this.document.generarMazoInicialDePrueba();
    this.render();
  }

  static async #onUsarHabilidad(event, target) {
    const itemId = target.dataset.itemId;
    await this.document.usarHabilidadItem(itemId);
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