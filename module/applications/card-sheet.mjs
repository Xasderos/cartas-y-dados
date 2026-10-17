/**
 * @file card-sheet.mjs
 * @description Editor visual ApplicationV2 para documentos Card ('accion' y 'trinket') en Foundry VTT v14.
 */

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      template: "systems/cartas-y-dados/templates/card/hoja-carta.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const card = this.document;
    return {
      ...context,
      card,
      system: card.system,
      esTrinket: card.type === "trinket",
      esAccion: card.type === "accion"
    };
  }
}