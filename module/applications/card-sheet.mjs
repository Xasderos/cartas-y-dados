/**
 * @file card-sheet.mjs
 * @description Editor visual ApplicationV2 para documentos Card ('accion' y 'trinket') en Foundry VTT v14.
 */

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { limpiarNombreCarta, nombreVisibleCarta } from "../config.mjs";

export class HojaCartaSistema extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cartas-y-dados", "sheet", "card"],
    position: {
      width: 480,
      height: 500
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true,
      title: "Configuración de Carta"
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/card/hoja-carta.hbs",
      scrollable: [".cyd-hoja-contenedor"]
    }
  };

  /** @override */
  get title() {
    const tipo = this.document.type === "trinket" ? "Trinket" : "Carta de Acción";
    return `${tipo}: ${nombreVisibleCarta(this.document)}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const card = this.document;
    const nombreActual = nombreVisibleCarta(card);
    return {
      ...context,
      card,
      document: card,
      name: nombreActual,
      system: card.system,
      esTrinket: card.type === "trinket",
      esAccion: card.type === "accion",
      editable: this.isEditable
    };
  }

  /** @override */
  async _processSubmitData(event, formData, submitData) {
    const expanded = foundry.utils.expandObject(submitData);

    // Limpiar y persistir el nombre de la carta/trinket
    if (expanded.name !== undefined) {
      const nuevoNombre = limpiarNombreCarta(expanded.name) || nombreVisibleCarta(this.document);
      expanded.name = nuevoNombre;

      // Sincronizar faces y back para evitar que Foundry ponga "Unknown"
      const imgCarta = this.document.img || this.document.faces?.[0]?.img || "icons/svg/card-hand.svg";
      const caraActual = this.document.faces?.[0] ? foundry.utils.deepClone(this.document.faces[0]) : {};
      caraActual.name = nuevoNombre;
      caraActual.img = caraActual.img || imgCarta;
      expanded.faces = [caraActual];
      expanded.face = 0;
      expanded.back = {
        ...(this.document.back ?? {}),
        name: nuevoNombre
      };
    }

    // Llamar al proceso estándar de DocumentSheetV2
    const resultado = await super._processSubmitData(event, formData, expanded);

    // Sincronización bidireccional con el mazo original (sourceCardId)
    const cartaEditada = this.document;
    const sourceId = cartaEditada.getFlag("cartas-y-dados", "sourceCardId");

    if (sourceId) {
      // La carta editada es una copia; buscar y actualizar la original en el mazo
      const actor = game.actors.find(a => {
        const pilas = a.system.pilasDocumentos ?? {};
        return Boolean(pilas.mazo?.cards.get(sourceId) || pilas.trinkets?.cards.get(sourceId));
      });
      if (actor) {
        const pilas = actor.system.pilasDocumentos ?? {};
        const cartaOriginal = pilas.mazo?.cards.get(sourceId) || pilas.trinkets?.cards.get(sourceId);
        if (cartaOriginal) {
          const payload = {
            name: nuevoNombre,
            face: 0,
            faces: [{ ...(cartaOriginal.faces?.[0] ?? {}), name: nuevoNombre, img: cartaEditada.img || "icons/svg/card-hand.svg" }],
            back: { ...(cartaOriginal.back ?? {}), name: nuevoNombre }
          };
          const pilaOriginal = cartaOriginal.parent;
          if (pilaOriginal) {
            await pilaOriginal.updateEmbeddedDocuments("Card", [payload]);
          }
          actor.prepareData();
          if (actor.sheet?.rendered) actor.sheet.render();
        }
      }
    } else {
      // La carta editada está en un mazo; buscar y actualizar copias en otras pilas del actor
      const actor = game.actors.find(a => {
        const pilas = a.system.pilasDocumentos ?? {};
        return [pilas.mazo, pilas.trinkets, pilas.mano, pilas.enJuego, pilas.descarte, pilas.quemadas]
          .some(p => p && p.cards.has(cartaEditada.id));
      });
      if (actor) {
        const pilas = actor.system.pilasDocumentos ?? {};
        const nombre = nombreVisibleCarta(cartaEditada);
        const imgCarta = cartaEditada.img || cartaEditada.faces?.[0]?.img || "icons/svg/card-hand.svg";
        const payload = {
          name: nombre,
          face: 0,
          faces: [{ ...(cartaEditada.faces?.[0] ?? {}), name: nombre, img: imgCarta }],
          back: { ...(cartaEditada.back ?? {}), name: nombre }
        };
        for (const clave of ["mano", "enJuego", "descarte", "quemadas", "mazo", "trinkets"]) {
          const pila = pilas[clave];
          if (!pila) continue;
          const copias = pila.cards.filter(c => c.getFlag("cartas-y-dados", "sourceCardId") === cartaEditada.id);
          if (copias.size > 0) {
            const updates = [...copias].map(c => ({ ...payload, _id: c.id }));
            await pila.updateEmbeddedDocuments("Card", updates);
          }
        }
        actor.prepareData();
        if (actor.sheet?.rendered) actor.sheet.render();
      }
    }

    return resultado;
  }
}