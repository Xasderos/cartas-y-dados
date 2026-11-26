/**
 * @file dialogo-accion.mjs
 * @description Diálogo «Realizar acción» (v0.14.0). Al usar una Carta de Acción de la mano se elige
 * qué acción se realiza con ella (catálogo `SISTEMA_CONFIG.ACCIONES` según su característica, o una
 * Habilidad si es MIST) y sus modificadores: Ataque apuntado (2ª carta del mismo palo), Potenciar
 * (quemar otra carta MIST y sumar su tirada) y Reacción. Como las reglas admiten excepciones, el
 * diálogo permite forzar la resolución y si la carta se quema o se descarta.
 * Lo ejecuta `SistemaActor#jugarCarta` (o `#usarHabilidad` para las Habilidades).
 * (v0.15.0) Abalorios de clase En Juego (`SistemaActor#abaloriosActivos`): Espada añade a las cartas
 * CONS un grupo «Como FISC (Espada)» (valor `fisc:<accion>` → `comoFisico`); Espada y Daga permiten un
 * Ataque apuntado FISC + CONS; Escudo añade la reacción adicional «Defender a un aliado».
 */

import {
  SISTEMA_CONFIG, abreviadoPalo, accionesDeCaracteristica, nombreCaracteristica, nombreVisibleCarta
} from "../config.mjs";
import { opcionesDialogoSistema } from "./ventana-dinamica.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Texto plano de una carta para las opciones de un `<select>`.
 * @param {Card} carta
 * @param {Actor} actor
 * @returns {string}
 */
function etiquetaCarta(carta, actor) {
  const dados = actor._dadosDeCaracteristica(carta.system.caracteristicaAsociada);
  return `${nombreVisibleCarta(carta)} (${abreviadoPalo(carta.system.palo)} · ${dados}${carta.system.tipoDado})`;
}

/** Palos que pueden combinarse en un Ataque apuntado con los abalorios Espada o Daga (v0.15.0). */
const PALOS_APUNTADO_MIXTO = ["espadas", "bastos"];

/**
 * Abre el diálogo de acción para una carta de la mano y ejecuta la elección.
 * Los Trinkets no pasan por aquí: se juegan directamente.
 * @param {Actor} actor - `SistemaActor` dueño de la carta.
 * @param {string} cartaId - ID de la carta en la mano.
 * @param {Object} [opciones]
 * @param {boolean} [opciones.quemar=false] - Llega desde «Usar y Quemar»: casilla Quemar marcada.
 * @returns {Promise<boolean>} true si se realizó la acción.
 */
export async function abrirDialogoAccion(actor, cartaId, { quemar = false } = {}) {
  const escapar = foundry.utils.escapeHTML;
  const mano = actor.system.pilasDocumentos?.mano;
  const carta = mano?.cards.get(cartaId);
  if (!carta) {
    ui.notifications.error("La carta seleccionada no está en tu mano.");
    return false;
  }
  if (carta.type === "trinket") {
    await actor.jugarCarta(cartaId, { quemar });
    return true;
  }

  const caract = carta.system.caracteristicaAsociada;
  const esMist = carta.system.palo === "copas";
  const abalorios = actor.abaloriosActivos();
  const acciones = accionesDeCaracteristica(caract, { abalorios });
  // (v0.15.0) Amistad: +1 dado si el aliado enlazado jugó esta característica en su última acción.
  const amistad = actor._bonoDadoAmistad(caract, abalorios);
  // (v0.15.0) Espada: una carta CONS puede realizar las acciones de FISC tirando con Físico.
  const espadaCons = abalorios.has("espada") && carta.system.palo === "bastos";
  const accionesFisc = espadaCons ? accionesDeCaracteristica("fisico", { abalorios }).filter(a => a.clave !== "libre") : [];
  const habilidades = esMist ? actor.items.filter(i => i.type === "habilidad" && i.system.esActivable) : [];
  const otrasCartas = mano.cards.contents.filter(c => c.id !== carta.id && c.type === "accion");
  // (v0.15.0) Espada o Daga: el Ataque apuntado admite FISC + CONS.
  const apuntadoMixto = (abalorios.has("espada") || abalorios.has("daga"))
    && PALOS_APUNTADO_MIXTO.includes(carta.system.palo);
  const mismoPalo = otrasCartas.filter(c => c.system.palo === carta.system.palo
    || (apuntadoMixto && PALOS_APUNTADO_MIXTO.includes(c.system.palo)));
  const nombreApuntado = apuntadoMixto ? "FISC o CONS" : abreviadoPalo(carta.system.palo);
  const cartasMist = otrasCartas.filter(c => c.system.palo === "copas");

  // Acción por defecto: la primera del catálogo; si la carta está marcada como ataque y hay
  // una acción de ataque para su característica, esa.
  const accionPorDefecto = (carta.system.esAtaque && acciones.find(a => a.resolucion === "ataque")?.clave)
    || acciones[0]?.clave || "libre";

  const opcionAccion = (a, prefijo = "") => `<option value="${prefijo}${a.clave}" data-reaccion="${a.reaccion}" data-texto="${escapar(prefijo ? `Espada: tiras con Físico. ${a.texto}` : a.texto)}" ${!prefijo && a.clave === accionPorDefecto ? "selected" : ""}>${escapar(a.nombre)}${a.adicional ? " (adicional)" : ""}</option>`;
  const grupoEspada = accionesFisc.length
    ? `<optgroup label="Como FISC (abalorio Espada)">${accionesFisc.map(a => opcionAccion(a, "fisc:")).join("")}</optgroup>`
    : "";
  const grupoHabilidades = habilidades.length
    ? `<optgroup label="Habilidades (quema la carta)">${habilidades.map(h =>
        `<option value="habilidad:${h.id}" data-reaccion="false" data-texto="${escapar(`Usas la habilidad ${h.name}${h.system.requiereTirada === false ? " (sin tirada)" : ""}.`)}">${escapar(h.name)}</option>`).join("")}</optgroup>`
    : "";
  const textoInicial = acciones.find(a => a.clave === accionPorDefecto)?.texto ?? "";

  const estado = actor.contextoAcciones();
  const avisoReaccion = estado.sinReacciones
    ? "Agotamiento 4+: no puede reaccionar (solo como excepción)."
    : estado.enCombate && estado.reaccionUsada ? "Ya usó su reacción este turno (solo como excepción)." : "";

  const quemaPorReglas = esMist || carta.system.seQuema || Boolean(actor.system.agotamiento?.efectos?.quemarAlUsar);
  const motivoQuema = esMist ? "las cartas MIST siempre se queman"
    : carta.system.seQuema ? "la carta está marcada «Se quema»"
      : actor.system.agotamiento?.efectos?.quemarAlUsar ? `Agotamiento ${actor.system.agotamiento.nivel}` : "";

  const opcionesResolucion = Object.entries(SISTEMA_CONFIG.RESOLUCIONES_ACCION)
    .map(([clave, texto]) => `<option value="${clave}">${escapar(texto)}</option>`).join("");

  const guia = [...acciones, ...(esMist ? [{ nombre: "Potenciar", texto: "Con cualquier otra acción, quema una carta MIST y suma su tirada." }] : []),
    { nombre: "Ataque apuntado", texto: "Usa dos cartas del mismo palo; el resultado se reduce a la mitad (redondeo hacia arriba). Al punto débil, explota su debilidad." },
    ...(espadaCons ? [{ nombre: "Espada", texto: "Puedes usar esta carta de consciencia como si fuera de físico." }] : [])]
    .map(a => `<li><strong>${escapar(a.nombre)}:</strong> ${escapar(a.texto)}</li>`).join("");

  const content = `
    <div class="cyd-dialogo-accion">
      <p class="cyd-dialogo-accion-carta">
        <i class="fa-solid ${SISTEMA_CONFIG.ICONOS_CARACTERISTICA[caract] ?? "fa-diamond"}"></i>
        <strong>${escapar(nombreVisibleCarta(carta))}</strong> · ${abreviadoPalo(carta.system.palo)} (${escapar(nombreCaracteristica(caract))}) · ${actor._dadosDeCaracteristica(caract)}${carta.system.tipoDado}
      </p>
      ${amistad ? `<p class="hint"><i class="fa-solid fa-handshake"></i> Amistad: ${escapar(amistad.aliado)} jugó ${escapar(nombreCaracteristica(caract))} en su última acción: tiras 1 dado más (salvo en la Acción del compañero).</p>` : ""}

      <div class="form-group">
        <label>Acción</label>
        <select name="accion">
          <optgroup label="Acciones de ${abreviadoPalo(carta.system.palo)}">${acciones.map(a => opcionAccion(a)).join("")}</optgroup>
          ${grupoEspada}
          ${grupoHabilidades}
        </select>
      </div>
      <p class="cyd-dialogo-accion-texto hint">${escapar(textoInicial)}</p>

      <fieldset>
        <legend><i class="fa-solid fa-bullseye"></i> Ataque apuntado</legend>
        ${mismoPalo.length
          ? `<div class="form-group">
              <label>Segunda carta (${nombreApuntado})</label>
              <select name="cartaApuntado"><option value="">No es un ataque apuntado</option>${mismoPalo.map(c => `<option value="${c.id}">${escapar(etiquetaCarta(c, actor))}</option>`).join("")}</select>
            </div>
            <label class="cyd-opcion-radio"><input type="checkbox" name="puntoDebil" /> Al punto débil identificado (explotar su debilidad)</label>`
          : `<p class="hint">Necesitas otra carta de ${nombreApuntado} en la mano.</p>`}
        ${apuntadoMixto ? `<p class="hint"><i class="fa-solid fa-gem"></i> ${abalorios.has("espada") ? "Espada: FISC + CONS, ambas tiran con Físico." : "Daga: FISC + CONS, cada una tira con su característica."}</p>` : ""}
      </fieldset>

      <fieldset>
        <legend><i class="fa-solid fa-moon"></i> Potenciar</legend>
        ${cartasMist.length
          ? `<div class="form-group">
              <label>Quemar carta MIST y sumar</label>
              <select name="cartaPotenciar"><option value="">Sin potenciar</option>${cartasMist.map(c => `<option value="${c.id}">${escapar(etiquetaCarta(c, actor))}</option>`).join("")}</select>
            </div>`
          : '<p class="hint">Necesitas otra carta MIST en la mano.</p>'}
      </fieldset>

      <fieldset>
        <legend><i class="fa-solid fa-sliders"></i> Opciones y excepciones</legend>
        <label class="cyd-opcion-radio"><input type="checkbox" name="reaccion" /> <span><i class="fa-solid fa-bolt"></i> Es una reacción (fuera de tu turno)</span></label>
        ${avisoReaccion ? `<p class="hint cyd-aviso-reaccion"><i class="fa-solid fa-triangle-exclamation"></i> ${escapar(avisoReaccion)}</p>` : ""}
        <label class="cyd-opcion-radio"><input type="checkbox" name="quemar" ${quemar || quemaPorReglas ? "checked" : ""} /> <span><i class="fa-solid fa-fire"></i> Quemar la carta usada${motivoQuema ? ` (${escapar(motivoQuema)})` : ""}</span></label>
        <div class="form-group">
          <label>Resolución</label>
          <select name="resolucion">${opcionesResolucion}</select>
        </div>
      </fieldset>

      <details class="cyd-dialogo-accion-guia">
        <summary><i class="fa-solid fa-book-open"></i> Guía de acciones</summary>
        <ul>${guia}</ul>
        <p class="hint">No es una lista cerrada: acordad con la mesa cualquier otra acción y usad «Otra acción».</p>
      </details>
    </div>`;

  /**
   * Al cambiar de acción: actualiza la descripción y marca «Reacción» si la acción lo es (Defensa).
   * @param {Event} evento
   * @param {DialogV2} dialogo
   */
  const alRenderizar = (evento, dialogo) => {
    const raiz = dialogo?.element ?? evento?.target?.element;
    const select = raiz?.querySelector("select[name='accion']");
    if (!select) return;
    const actualizar = () => {
      const opcion = select.selectedOptions[0];
      const texto = raiz.querySelector(".cyd-dialogo-accion-texto");
      if (texto) texto.textContent = opcion?.dataset.texto ?? "";
      const reaccion = raiz.querySelector("input[name='reaccion']");
      if (reaccion) reaccion.checked = opcion?.dataset.reaccion === "true";
    };
    select.addEventListener("change", actualizar);
    actualizar();
  };

  const eleccion = await DialogV2.wait({
    ...opcionesDialogoSistema({ width: 480 }),
    window: { title: `Realizar acción: ${nombreVisibleCarta(carta)}`, icon: "fa-solid fa-dice-d20" },
    content,
    render: alRenderizar,
    buttons: [
      {
        action: "realizar",
        label: "Realizar acción",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            accion: f.accion.value,
            cartaApuntadoId: f.cartaApuntado?.value || null,
            puntoDebil: Boolean(f.puntoDebil?.checked),
            cartaPotenciarId: f.cartaPotenciar?.value || null,
            reaccion: f.reaccion.checked,
            quemar: f.quemar.checked,
            resolucion: f.resolucion.value
          };
        }
      },
      { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false
  });
  if (!eleccion || typeof eleccion !== "object") return false;

  // (v0.15.0) Espada: acción de FISC con una carta CONS.
  if (eleccion.accion.startsWith("fisc:")) {
    eleccion.accion = eleccion.accion.slice("fisc:".length);
    eleccion.comoFisico = true;
  }

  if (eleccion.accion.startsWith("habilidad:")) {
    await actor.usarHabilidad(eleccion.accion.slice("habilidad:".length), { cartaId, reaccion: eleccion.reaccion });
    return true;
  }

  // La casilla Quemar solo se pasa como excepción cuando difiere de lo que dicen las reglas
  // (así la carta de Ataque apuntado aplica sus propias reglas de quema).
  const quemarExplicito = eleccion.quemar !== quemaPorReglas ? eleccion.quemar : undefined;
  await actor.jugarCarta(cartaId, { ...eleccion, quemar: quemarExplicito });
  return true;
}
