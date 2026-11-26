/**
 * @file game-pause.mjs
 * @description Banner temático de "Partida en Pausa" para Cartas y Dados (Foundry VTT v14).
 *
 * Foundry v14 dibuja el banner con `foundry.applications.ui.GamePause` (ApplicationV2,
 * `<figure id="pause">`). Su `_replaceHTML` reemplaza los hijos en cada render, así que el
 * sistema engancha `renderGamePause` (se dispara justo después) y sustituye el contenido por
 * un abanico de cuatro cartas, una por palo, más un título y un lema localizados.
 * No se toca la clase `paused` que Foundry alterna para mostrar u ocultar el banner.
 */

import { SISTEMA_CONFIG, abreviadoPalo } from "../config.mjs";

/**
 * Icono canónico de cada palo (ver context.md §9) en el orden en que se abren en abanico.
 * @type {Array<{palo: string, icono: string}>}
 */
const CARTAS_ABANICO = [
  { palo: "espadas", icono: "fa-hand-fist" },
  { palo: "bastos", icono: "fa-eye" },
  { palo: "oros", icono: "fa-masks-theater" },
  { palo: "copas", icono: "fa-moon" }
];

/**
 * Localiza una clave con respaldo si la traducción no existe en el idioma activo.
 * @param {string} clave - Clave i18n del sistema.
 * @param {string} respaldo - Clave o texto a usar si `clave` no está traducida.
 * @returns {string}
 */
function localizarConRespaldo(clave, respaldo) {
  return game.i18n.has(clave) ? game.i18n.localize(clave) : game.i18n.localize(respaldo);
}

/**
 * Sustituye el contenido del banner de pausa por la versión temática del sistema.
 * Se registra en `Hooks.on("renderGamePause", personalizarBannerPausa)`.
 * @param {foundry.applications.ui.GamePause} _app - Aplicación del banner (no se usa).
 * @param {HTMLElement} elemento - `<figure id="pause">`.
 */
export function personalizarBannerPausa(_app, elemento) {
  if (!(elemento instanceof HTMLElement)) return;
  elemento.classList.add("cyd-pausa");

  // Abanico de cartas: cada una muestra el icono y la abreviatura de su palo.
  const abanico = document.createElement("div");
  abanico.className = "cyd-pausa-abanico";
  abanico.setAttribute("aria-hidden", "true");
  CARTAS_ABANICO.forEach(({ palo, icono }, indice) => {
    if (!SISTEMA_CONFIG.palosCartas[palo]) return;
    const carta = document.createElement("div");
    carta.className = `cyd-pausa-carta cyd-pausa-carta-${indice + 1}`;
    const simbolo = document.createElement("i");
    simbolo.className = `fa-solid ${icono}`;
    const abreviatura = document.createElement("span");
    abreviatura.textContent = abreviadoPalo(palo);
    carta.append(simbolo, abreviatura);
    abanico.append(carta);
  });

  // Título y lema localizados (texto plano, sin HTML).
  const pie = document.createElement("figcaption");
  const titulo = document.createElement("span");
  titulo.className = "cyd-pausa-titulo";
  titulo.textContent = localizarConRespaldo("CARTASYDADOS.Pausa.Titulo", "GAME.Paused");
  const lema = document.createElement("span");
  lema.className = "cyd-pausa-lema";
  lema.textContent = game.i18n.has("CARTASYDADOS.Pausa.Lema")
    ? game.i18n.localize("CARTASYDADOS.Pausa.Lema")
    : "";
  pie.append(titulo);
  if (lema.textContent) pie.append(lema);

  elemento.replaceChildren(abanico, pie);
}
