/**
 * @file retrato-ficha.mjs
 * @description Retrato de cabecera común a las fichas del sistema (v0.9.6):
 * - Clic izquierdo sobre la imagen: la muestra a tamaño completo (`ImagePopout`).
 * - Botón "Editar" bajo la imagen: abre el `FilePicker` para cambiarla.
 * - Botón "Token" bajo la imagen (solo Actores): abre la configuración del token
 *   (el del Token si la ficha es de un Token sintético; si no, el Token Prototipo).
 *
 * Plantilla esperada (ver `hoja-personaje.hbs`):
 * ```hbs
 * <div class="cyd-retrato">
 *   <img class="cyd-avatar" src="..." data-action="verImagen" />
 *   <div class="cyd-retrato-botones"> ... editarImagen / configurarToken ... </div>
 * </div>
 * ```
 * El contexto recibe `retrato.puedeEditar` y `retrato.tieneToken`.
 */

/**
 * Mixin que añade las acciones del retrato a una DocumentSheetV2 del sistema.
 * Las fichas cuyo documento no guarda la imagen en `img` (p. ej. Cartas, que la guardan
 * en `faces`) sobrescriben `_actualizarImagen(ruta)`.
 * @template {typeof foundry.applications.api.DocumentSheetV2} T
 * @param {T} Base - Clase base de la ficha.
 * @returns {T} Subclase con las acciones `verImagen`, `editarImagen` y `configurarToken`.
 */
export function RetratoFichaMixin(Base) {
  return class extends Base {

    /** @override */
    static DEFAULT_OPTIONS = {
      actions: {
        verImagen: this.#onVerImagen,
        editarImagen: this.#onEditarImagen,
        configurarToken: this.#onConfigurarToken
      }
    };

    /**
     * Añade al contexto los permisos del retrato.
     * @override
     */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const doc = this.document;
      context.retrato = {
        puedeEditar: this.isEditable,
        tieneToken: doc.documentName === "Actor" && doc.isOwner
      };
      return context;
    }

    /**
     * Guarda la nueva imagen del documento. Por defecto actualiza `img`.
     * @param {string} ruta - Ruta elegida en el FilePicker.
     * @returns {Promise<void>}
     */
    async _actualizarImagen(ruta) {
      await this.document.update({ img: ruta });
    }

    /**
     * Clic izquierdo en el retrato: muestra la imagen a tamaño completo.
     * @this {DocumentSheetV2}
     */
    static #onVerImagen() {
      const doc = this.document;
      if (!doc.img) return;
      new foundry.applications.apps.ImagePopout({
        src: doc.img,
        uuid: doc.uuid,
        window: { title: doc.name }
      }).render({ force: true });
    }

    /**
     * Botón "Editar": abre el selector de archivos de imagen.
     * @this {DocumentSheetV2}
     */
    static async #onEditarImagen(event, target) {
      if (!this.isEditable) return;
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      const picker = new FilePicker({
        type: "image",
        current: this.document.img,
        callback: ruta => this._actualizarImagen(ruta),
        position: {
          top: this.position.top + 40,
          left: this.position.left + 10
        }
      });
      await picker.browse();
    }

    /**
     * Botón "Token": configuración del Token de este Actor.
     * Si la ficha es de un Token colocado en escena (Actor sintético) abre la de ese
     * Token; si no, la del Token Prototipo del Actor.
     * @this {DocumentSheetV2}
     */
    static #onConfigurarToken() {
      const actor = this.document;
      if (actor.documentName !== "Actor" || !actor.isOwner) return;
      if (actor.isToken && actor.token) {
        actor.token.sheet.render({ force: true });
        return;
      }
      const ClaseConfig = CONFIG.Token.prototypeSheetClass ?? foundry.applications.sheets.PrototypeTokenConfig;
      new ClaseConfig({
        prototype: actor.prototypeToken,
        position: {
          left: Math.max(this.position.left - 560 - 10, 10),
          top: this.position.top
        }
      }).render({ force: true });
    }
  };
}
