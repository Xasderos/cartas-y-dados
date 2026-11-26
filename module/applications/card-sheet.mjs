/**
 * @file card-sheet.mjs
 * @description Editor visual ApplicationV2 para documentos Card ('accion' y 'trinket') en Foundry VTT v14.
 */

import { VentanaDinamicaMixin } from "./ventana-dinamica.mjs";
import { RetratoFichaMixin } from "./retrato-ficha.mjs";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

import {
  abalorioDeTrinket, catalogoAbalorios, claveClaseDeItem, esAbalorioEterno, limpiarNombreCarta, nombreVisibleCarta
} from "../config.mjs";

/** Claves de `flags.cartas-y-dados` editables en la ficha y sincronizadas entre copias (v0.15.1). */
const FLAGS_REGLAS_CARTA = ["abalorio", "eterno"];

export class HojaCartaSistema extends VentanaDinamicaMixin(RetratoFichaMixin(HandlebarsApplicationMixin(DocumentSheetV2))) {

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
    // (v0.15.1) Comportamiento de reglas del Trinket: efecto de abalorio y «Eterno», editables.
    let reglasTrinket = null;
    if (card.type === "trinket") {
      const claveClase = claveClaseDeItem(this._actorDueno()?.items.find(i => i.type === "clase"));
      const abalorio = abalorioDeTrinket(card, claveClase) ?? "";
      const catalogo = catalogoAbalorios();
      reglasTrinket = {
        abalorio,
        eterno: esAbalorioEterno(card, claveClase),
        opciones: catalogo.map(o => ({ ...o, seleccionado: o.clave === abalorio })),
        auto: catalogo.find(o => o.clave === abalorio)?.auto ?? ""
      };
    }
    return {
      ...context,
      card,
      document: card,
      name: nombreActual,
      system: card.system,
      esTrinket: card.type === "trinket",
      esAccion: card.type === "accion",
      reglasTrinket,
      editable: this.isEditable
    };
  }

  /**
   * Actor dueño de la carta (v0.15.1): el que tiene entre sus 6 pilas la pila que la contiene.
   * @returns {Actor|null}
   */
  _actorDueno() {
    const pilaId = this.document.parent?.id;
    if (!pilaId) return null;
    return game.actors.find(a => Object.values(a.system.pilas ?? {}).includes(pilaId)) ?? null;
  }

  /**
   * Datos de reglas que se copian a la original o a las copias de una carta (v0.15.1): `system`
   * completo y las claves de `FLAGS_REGLAS_CARTA` (sin tocar `sourceCardId`).
   * @param {Card} carta - Carta editada.
   * @returns {object} Fragmento de actualización.
   */
  static _datosReglasCarta(carta) {
    const datos = { system: carta.toObject().system };
    const flags = carta.flags?.["cartas-y-dados"] ?? {};
    for (const clave of FLAGS_REGLAS_CARTA) {
      if (clave in flags) datos[`flags.cartas-y-dados.${clave}`] = flags[clave];
    }
    return datos;
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
    await this._sincronizarCopiasYOriginal();
    return resultado;
  }

  /**
   * Retrato (v0.9.6): las Cartas guardan su imagen en `faces[0].img`, no en `img`.
   * Actualiza la cara visible y propaga la imagen a la original o a sus copias.
   * @override
   * @param {string} ruta - Ruta elegida en el FilePicker.
   */
  async _actualizarImagen(ruta) {
    const card = this.document;
    const cara = foundry.utils.deepClone(card._source.faces?.[0] ?? {});
    cara.name = nombreVisibleCarta(card);
    cara.img = ruta;
    await card.update({ face: 0, faces: [cara] });
    await this._sincronizarCopiasYOriginal();
  }

  /**
   * Sincronización bidireccional (nombre, imagen y, desde v0.15.1, `system` y flags de reglas) entre una carta y su original
   * del mazo (`sourceCardId`) o, si es la original, sus copias en otras pilas.
   * v0.9.6: usa `nombreVisibleCarta()` (antes leía `nuevoNombre` fuera de su ámbito
   * y fallaba con ReferenceError al editar una copia).
   * @returns {Promise<void>}
   */
  async _sincronizarCopiasYOriginal() {
    const cartaEditada = this.document;
    const nuevoNombre = nombreVisibleCarta(cartaEditada);
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
            back: { ...(cartaOriginal.back ?? {}), name: nuevoNombre },
            ...HojaCartaSistema._datosReglasCarta(cartaEditada),
            _id: cartaOriginal.id
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
          back: { ...(cartaEditada.back ?? {}), name: nombre },
          ...HojaCartaSistema._datosReglasCarta(cartaEditada)
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
  }
}