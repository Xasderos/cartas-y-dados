/**
 * @file ventana-dinamica.mjs
 * @description Utilidades de "ventana dinámica" (v0.9.6) compartidas por todas las
 * ApplicationV2 del sistema (fichas de PJ/PNJ, Item, Carta, Panel del Master y diálogos).
 *
 * Filosofía de desarrollo: ninguna ventana del sistema puede ser más grande que la
 * pantalla ni dejar contenido inaccesible. Los tamaños por defecto siguen siendo
 * NUMÉRICOS (regla del Bug 1: nunca `height: "auto"` en fichas), pero se recortan al
 * área visible al abrirse y cada vez que cambia el tamaño del navegador. El reparto
 * interno (columnas, rejillas, scroll) lo resuelve el CSS con container queries.
 */

/** Margen libre (px) que se deja alrededor de una ventana respecto al viewport. */
const MARGEN_VIEWPORT = 16;

/** Tamaño mínimo razonable de una ventana del sistema (coincide con el CSS). */
export const TAMANO_MINIMO_VENTANA = Object.freeze({ width: 340, height: 300 });

/**
 * Recorta un objeto de posición de ApplicationV2 para que quepa en el viewport.
 * Solo toca `width`/`height` numéricos y `left`/`top` si la ventana se saldría.
 * @param {object} position - `options.position` o el resultado de `app.position`.
 * @param {object} [config]
 * @param {number} [config.margen=MARGEN_VIEWPORT] - Margen libre (px) respecto a los bordes.
 *   Al abrir se deja `MARGEN_VIEWPORT`; al redimensionar el navegador se usa 0 para no
 *   encoger una ventana que el usuario ha llevado a toda la altura (v0.13.1).
 * @returns {object} El mismo objeto `position`, modificado in situ.
 */
export function ajustarPosicionAPantalla(position, { margen = MARGEN_VIEWPORT } = {}) {
  if (!position) return position;
  const anchoDisponible = Math.max(TAMANO_MINIMO_VENTANA.width, window.innerWidth - margen * 2);
  const altoDisponible = Math.max(TAMANO_MINIMO_VENTANA.height, window.innerHeight - margen * 2);

  if (Number.isFinite(position.width)) position.width = Math.min(position.width, anchoDisponible);
  if (Number.isFinite(position.height)) position.height = Math.min(position.height, altoDisponible);

  // Si la ventana ya tiene coordenadas, se reubica para que no quede fuera de pantalla.
  if (Number.isFinite(position.left) && Number.isFinite(position.width)) {
    const maxLeft = window.innerWidth - position.width - margen;
    position.left = Math.max(margen, Math.min(position.left, maxLeft));
  }
  if (Number.isFinite(position.top) && Number.isFinite(position.height)) {
    const maxTop = window.innerHeight - position.height - margen;
    position.top = Math.max(margen, Math.min(position.top, maxTop));
  }
  return position;
}

/**
 * Mixin para ApplicationV2 del sistema: recorta la posición inicial al viewport.
 * Uso: `class X extends VentanaDinamicaMixin(HandlebarsApplicationMixin(ActorSheetV2))`.
 * @template {typeof foundry.applications.api.ApplicationV2} T
 * @param {T} Base - Clase base ApplicationV2 (ya mezclada con Handlebars).
 * @returns {T} Subclase con posición inicial adaptada a la pantalla.
 */
export function VentanaDinamicaMixin(Base) {
  return class extends Base {
    /**
     * (v0.13.1) Acción del menú de la ventana para ocupar toda la altura de la pantalla.
     * Se fusiona con las `actions` de cada subclase (ApplicationV2 combina los
     * `DEFAULT_OPTIONS` de toda la cadena de herencia).
     */
    static DEFAULT_OPTIONS = {
      actions: {
        cydAlturaPantalla: VentanaDinamicaMixinAcciones.alternarAlturaPantalla
      }
    };

    /** @override */
    _initializeApplicationOptions(options) {
      const opciones = super._initializeApplicationOptions(options);
      ajustarPosicionAPantalla(opciones.position);
      return opciones;
    }

    /**
     * Añade «Ajustar a la altura de la pantalla» al menú de controles (⋮) de las
     * ventanas redimensionables del sistema (v0.13.1).
     * @override
     */
    _getHeaderControls() {
      const controles = super._getHeaderControls();
      if (this.options.window?.resizable) {
        controles.push({
          icon: "fa-solid fa-up-down",
          label: "Ajustar a la altura de la pantalla",
          action: "cydAlturaPantalla"
        });
      }
      return controles;
    }
  };
}

/**
 * Manejadores de acciones compartidos por `VentanaDinamicaMixin` (`this` = la aplicación).
 */
const VentanaDinamicaMixinAcciones = {
  /**
   * Alterna entre la altura completa del área visible del navegador (top 0) y la
   * posición/altura que tenía la ventana antes de maximizarla. Foundry nunca deja
   * que una ventana sea más alta que el área visible, así que este es el máximo real.
   * @this {foundry.applications.api.ApplicationV2}
   */
  alternarAlturaPantalla() {
    const altoPantalla = document.documentElement.clientHeight;
    const { top, height } = this.position;
    const yaMaximizada = this._cydAlturaPrevia && (top === 0) && (Math.abs(height - altoPantalla) < 2);
    if (yaMaximizada) {
      this.setPosition(this._cydAlturaPrevia);
      this._cydAlturaPrevia = null;
      return;
    }
    this._cydAlturaPrevia = { top, height };
    this.setPosition({ top: 0, height: altoPantalla });
  }
};

/**
 * Reajusta todas las ventanas abiertas del sistema (`.cartas-y-dados`) al viewport.
 * Se registra una sola vez (en `ready`) contra el evento `resize` del navegador.
 */
export function registrarReajusteEnResize() {
  const reajustar = foundry.utils.debounce(() => {
    for (const app of foundry.applications.instances.values()) {
      if (!app.rendered || !app.options?.classes?.includes("cartas-y-dados")) continue;
      if (app.minimized) continue;
      const { width, height, left, top } = app.position;
      const nueva = ajustarPosicionAPantalla({ width, height, left, top }, { margen: 0 });
      if (nueva.width !== width || nueva.height !== height || nueva.left !== left || nueva.top !== top) {
        app.setPosition(nueva);
      }
    }
  }, 150);
  window.addEventListener("resize", reajustar);
}

/**
 * Opciones comunes para los `DialogV2` del sistema: tokens visuales, ancho acotado
 * a la pantalla y contenido con scroll. Con `lista: true` los botones se apilan en
 * una sola columna (un botón por fila, texto con wrap) (diálogos con muchas opciones: clases, cartas MIST...).
 * @param {object} [config]
 * @param {number} [config.width=420] - Ancho preferido en px (se recorta al viewport).
 * @param {boolean} [config.lista=false] - Si los botones deben apilarse.
 * @returns {{classes: string[], position: {width: number}}}
 */
export function opcionesDialogoSistema({ width = 420, lista = false } = {}) {
  const classes = ["cartas-y-dados", "cyd-dialogo"];
  if (lista) classes.push("cyd-dialogo-lista");
  return { classes, position: ajustarPosicionAPantalla({ width }) };
}
