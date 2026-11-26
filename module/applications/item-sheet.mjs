/**
 * @file item-sheet.mjs
 * @description Hoja de Item (ApplicationV2) para editar Razas, Orígenes, Clases,
 * Objetos y Habilidades en Foundry VTT v14.
 */

import { VentanaDinamicaMixin } from "./ventana-dinamica.mjs";
import { RetratoFichaMixin } from "./retrato-ficha.mjs";
import {
  CLAVE_PERSONALIZADA, EFECTOS_VALOR_X, SISTEMA_CONFIG, claveClaseDeItem, contextoProgresionClase, contextoRasgosRaza, razaBaseDeItem
} from "../config.mjs";

/** Etiquetas del origen de una Habilidad (`system.origenHabilidad`, v0.15.1). */
const ORIGENES_HABILIDAD = {
  general: "General", raza: "Raza", origen: "Origen", clase: "Clase", criatura: "Criatura"
};

/**
 * Convierte un objeto `{clave: etiqueta}` en opciones para un `<select>` (v0.15.1).
 * @param {Object<string, string>} mapa
 * @param {string} actual - Clave seleccionada.
 * @returns {Array<{valor: string, etiqueta: string, seleccionado: boolean}>}
 */
function opcionesSelect(mapa, actual) {
  return Object.entries(mapa).map(([valor, etiqueta]) => ({ valor, etiqueta, seleccionado: valor === (actual ?? "") }));
}

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class HojaItemSistema extends VentanaDinamicaMixin(RetratoFichaMixin(HandlebarsApplicationMixin(ItemSheetV2))) {

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
    // (v0.15.1) Selectores de comportamiento de reglas: Raza/Clase base y automatización de Habilidades.
    const claveRaza = item.type === "raza" ? razaBaseDeItem(item)?.clave ?? CLAVE_PERSONALIZADA : "";
    const claveClase = item.type === "clase" ? claveClaseDeItem(item) ?? CLAVE_PERSONALIZADA : "";
    const mapaNombres = cfg => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v.nombre]));
    return {
      ...context,
      item,
      system: item.system,
      tipoEtiqueta: game.i18n.localize(`TYPES.Item.${item.type}`),
      esRaza: item.type === "raza",
      // Rasgos de la raza base (v0.13.0), solo lectura; null en razas personalizadas
      rasgosRaza: contextoRasgosRaza(razaBaseDeItem(item)?.clave ?? null),
      esOrigen: item.type === "origen",
      esClase: item.type === "clase",
      esObjeto: item.type === "objeto",
      esHabilidad: item.type === "habilidad",
      opcionesRazaBase: opcionesSelect({ [CLAVE_PERSONALIZADA]: "Personalizada (sin automatización)", ...mapaNombres(SISTEMA_CONFIG.RAZAS_BASE) }, claveRaza),
      opcionesClaseBase: opcionesSelect({ [CLAVE_PERSONALIZADA]: "Personalizada (sin progresión automática)", ...mapaNombres(SISTEMA_CONFIG.CLASES_BASE) }, claveClase),
      opcionesOrigenHabilidad: opcionesSelect(ORIGENES_HABILIDAD, item.system.origenHabilidad),
      opcionesEfectoX: opcionesSelect(EFECTOS_VALOR_X, item.type === "habilidad" ? item.getFlag("cartas-y-dados", "efectoX") : ""),
      // (v0.16.0) Descarga elemental: elemento (potenciar con cartas CONS y estado alterado)
      opcionesElemento: opcionesSelect(
        { "": "Ninguno", ...Object.fromEntries(Object.entries(SISTEMA_CONFIG.ELEMENTOS).map(([k, e]) => [k, `Descarga elemental: ${e.nombre}`])) },
        item.type === "habilidad" ? item.getFlag("cartas-y-dados", "elemento") ?? "" : ""
      ),
      // Tabla de elecciones de la Clase base (v0.15.0), solo lectura; null en clases personalizadas
      progresionClase: item.type === "clase" ? contextoProgresionClase(claveClaseDeItem(item)) : null,
      // Nombre de la Clase Base asociada (v0.10.0), vacío en clases personalizadas
      nombreClaseBase: item.type === "clase"
        ? SISTEMA_CONFIG.CLASES_BASE[claveClaseDeItem(item)]?.nombre ?? ""
        : ""
    };
  }
}