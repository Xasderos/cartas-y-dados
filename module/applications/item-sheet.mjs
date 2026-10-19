/**
 * @file item-sheet.mjs
 * @description Hoja de Item (ApplicationV2) para editar Razas, Orígenes, Clases,
 * Objetos y Habilidades en Foundry VTT v14.
 */

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class HojaItemSistema extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cartas-y-dados", "sheet", "item"],
    position: {
      width: 520,
      height: 540
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/item/hoja-item.hbs",
      scrollable: [".cyd-hoja-contenedor"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    return {
      ...context,
      item,
      system: item.system,
      tipoEtiqueta: game.i18n.localize(`TYPES.Item.${item.type}`),
      esRaza: item.type === "raza",
      esOrigen: item.type === "origen",
      esClase: item.type === "clase",
      esObjeto: item.type === "objeto",
      esHabilidad: item.type === "habilidad"
    };
  }
}