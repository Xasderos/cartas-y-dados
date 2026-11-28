/**
 * @file peligro.mjs
 * @description (v0.21.0) Mecánica global del Nivel de peligro (0–15), que sube a lo largo de una
 * escena. Los efectos se acumulan con los niveles anteriores y afectan a todas las criaturas:
 *
 * | Nv. | Efecto                                                                   | Dónde se aplica |
 * |-----|--------------------------------------------------------------------------|-----------------|
 * | 1   | +1 dado en todas las tiradas                                             | `tirarDadosSistema` |
 * | 2   | −1 Defensa Total (mínimo 0)                                              | `prepareDerivedData` |
 * | 3   | +5 m de Movimiento                                                       | `prepareDerivedData` |
 * | 4   | +1 dado en todas las tiradas                                             | `tirarDadosSistema` |
 * | 5   | Crítico desde uno menos del máximo                                       | `tirarDadosSistema` |
 * | 6   | Pifia con que un solo dado salga 1                                       | `tirarDadosSistema` |
 * | 7   | −1 Defensa Total (mínimo 0)                                              | `prepareDerivedData` |
 * | 8   | Los dados de Crítico se repiten dos veces (la repetición crítica se repite una vez más) | `tirarDadosSistema` |
 * | 9   | Alucinaciones y distorsiones (narrativo)                                 | — |
 * | 10  | Caer a 0 de Salud es muerte permanente                                   | hook `updateActor` (sistema.mjs) |
 * | 15  | Punto de inflexión: termina la escena (narrativo)                        | — |
 *
 * Subidas automáticas: cada 3 abalorios (Trinkets) jugados En Juego (contador global, ajuste
 * oculto `abaloriosPeligro`) y cada vez que un PNJ (el Master) baraja su Mazo de Jefe. El Master
 * lo cambia además a mano en su Panel y lo reinicia con «Fin Escena».
 *
 * Los ajustes son de mundo: solo el Master puede escribirlos. Los jugadores piden los cambios por
 * el socket del sistema y los atiende el Master activo (`game.users.activeGM`).
 */

import { leerAjuste } from "./settings.mjs";

/** Nivel máximo del peligro (Punto de inflexión). */
export const NIVEL_PELIGRO_MAXIMO = 15;

/** Abalorios jugados En Juego que suben 1 el Nivel de peligro. */
export const ABALORIOS_POR_NIVEL_PELIGRO = 3;

/** Canal de socket del sistema (requiere `"socket": true` en `system.json`). */
const CANAL_SOCKET = "system.cartas-y-dados";

/**
 * Texto e icono de cada nivel de peligro con efecto (los niveles 11–14 no añaden nada).
 * @type {Object<number, {icono: string, texto: string}>}
 */
export const NIVELES_PELIGRO = {
  1: { icono: "fa-dice", texto: "Todas las criaturas obtienen un dado adicional en todas sus tiradas." },
  2: { icono: "fa-shield-halved", texto: "Todas las criaturas restan 1 a su Defensa Total (mínimo 0)." },
  3: { icono: "fa-person-running", texto: "Todas las criaturas obtienen 5 m más de movimiento." },
  4: { icono: "fa-dice", texto: "Todas las criaturas obtienen otro dado adicional en todas sus tiradas." },
  5: { icono: "fa-star", texto: "El caos prevalece: en todas las tiradas es Crítico a partir de uno menos del máximo (en un d6, 5 y 6)." },
  6: { icono: "fa-skull-crossbones", texto: "Aumenta el caos: en todas las tiradas es Pifia con que un solo dado saque 1." },
  7: { icono: "fa-shield-halved", texto: "Todas las criaturas restan otro punto a su Defensa Total (mínimo 0)." },
  8: { icono: "fa-star", texto: "Los dados de Crítico se repiten dos veces en vez de una." },
  9: { icono: "fa-eye", texto: "La realidad se fractura alrededor de los presentes: se manifiestan alucinaciones y distorsiones." },
  10: { icono: "fa-skull", texto: "Una criatura que cae a 0 de Salud muere al instante: su esencia se pierde y no puede volver a la vida por ningún medio." },
  15: { icono: "fa-hurricane", texto: "Punto de inflexión: la escena termina y los involucrados quedan marcados de por vida." }
};

/**
 * Nivel de peligro actual (ajuste de mundo `nivelPeligro`), entero entre 0 y 15.
 * Seguro durante el arranque (`leerAjuste`).
 * @returns {number}
 */
export function leerNivelPeligro() {
  const valor = Math.floor(Number(leerAjuste("nivelPeligro", 0)) || 0);
  return Math.min(NIVEL_PELIGRO_MAXIMO, Math.max(0, valor));
}

/**
 * @typedef {Object} EfectosPeligro
 * @property {number} nivel - Nivel de peligro.
 * @property {number} dadosExtra - Dados que se añaden a cada tirada (Nv. 1 y 4).
 * @property {number} reduccionDefensa - Puntos que se restan a la Defensa Total (Nv. 2 y 7).
 * @property {number} movimientoExtra - Metros de movimiento adicionales (Nv. 3).
 * @property {number} margenCritico - Crítico desde `caras − margenCritico` (Nv. 5: 1).
 * @property {boolean} pifiaUnDado - Pifia con un solo dado en 1 (Nv. 6).
 * @property {number} rondasCritico - Veces que se repiten los dados de Crítico (Nv. 8: 2).
 * @property {boolean} muertePermanente - Caer a 0 de Salud es muerte permanente (Nv. 10).
 */

/**
 * Efectos mecánicos acumulados de un nivel de peligro.
 * @param {number} [nivel=leerNivelPeligro()]
 * @returns {EfectosPeligro}
 */
export function efectosPeligro(nivel = leerNivelPeligro()) {
  const n = Math.max(0, Math.floor(Number(nivel) || 0));
  return {
    nivel: n,
    dadosExtra: (n >= 1 ? 1 : 0) + (n >= 4 ? 1 : 0),
    reduccionDefensa: (n >= 2 ? 1 : 0) + (n >= 7 ? 1 : 0),
    movimientoExtra: n >= 3 ? 5 : 0,
    margenCritico: n >= 5 ? 1 : 0,
    pifiaUnDado: n >= 6,
    rondasCritico: n >= 8 ? 2 : 1,
    muertePermanente: n >= 10
  };
}

/**
 * Lista de los efectos activos hasta `nivel` (para el Panel del Master y el chat).
 * @param {number} [nivel=leerNivelPeligro()]
 * @returns {Array<{nivel: number, icono: string, texto: string}>}
 */
export function listaEfectosPeligro(nivel = leerNivelPeligro()) {
  return Object.entries(NIVELES_PELIGRO)
    .map(([n, datos]) => ({ nivel: Number(n), ...datos }))
    .filter(e => e.nivel <= nivel);
}

/**
 * Fija el Nivel de peligro (solo Master) y anuncia en el chat los efectos de los niveles nuevos.
 * Un jugador no puede llamarla directamente: usa `subirNivelPeligro` / `registrarAbalorioJugado`.
 * @param {number} nuevo - Nivel deseado (se limita a 0–15).
 * @param {Object} [opciones]
 * @param {string} [opciones.motivo=""] - Causa del cambio (se muestra en el chat).
 * @param {boolean} [opciones.anunciar=true] - Publicar el aviso en el chat.
 * @returns {Promise<number>} Nivel resultante.
 */
export async function fijarNivelPeligro(nuevo, { motivo = "", anunciar = true } = {}) {
  if (!game.user.isGM) return leerNivelPeligro();
  const anterior = leerNivelPeligro();
  const nivel = Math.min(NIVEL_PELIGRO_MAXIMO, Math.max(0, Math.floor(Number(nuevo) || 0)));
  if (nivel === anterior) return nivel;
  await game.settings.set("cartas-y-dados", "nivelPeligro", nivel);
  if (anunciar) await anunciarCambioPeligro(anterior, nivel, motivo);
  return nivel;
}

/**
 * Publica el aviso público del cambio de Nivel de peligro: al subir, los efectos de cada nivel
 * alcanzado; al bajar, solo el nuevo valor.
 * @param {number} anterior
 * @param {number} nivel
 * @param {string} motivo
 * @returns {Promise<ChatMessage>}
 */
async function anunciarCambioPeligro(anterior, nivel, motivo) {
  const escapar = foundry.utils.escapeHTML;
  const sube = nivel > anterior;
  const nuevos = sube
    ? Object.entries(NIVELES_PELIGRO).filter(([n]) => Number(n) > anterior && Number(n) <= nivel)
    : [];
  const lista = nuevos.length
    ? `<ul>${nuevos.map(([n, e]) => `<li><i class="fa-solid ${e.icono}"></i> <strong>Nv. ${n}:</strong> ${e.texto}</li>`).join("")}</ul>`
    : "";
  return ChatMessage.create({
    speaker: { alias: "Nivel de peligro" },
    content: `
      <div class="cyd-alerta-cansancio cyd-alerta-peligro">
        <h4><i class="fa-solid fa-skull"></i> Nivel de peligro ${anterior} → ${nivel}</h4>
        ${motivo ? `<p>${escapar(motivo)}</p>` : ""}
        ${lista}
        ${!sube && nivel === 0 ? "<p>El peligro se disipa: ya no hay efectos activos.</p>" : ""}
      </div>`
  });
}

/**
 * Sube (o baja) el Nivel de peligro. Si quien la llama es un jugador, se lo pide al Master por socket.
 * @param {number} [delta=1]
 * @param {string} [motivo=""]
 * @returns {Promise<void>}
 */
export async function subirNivelPeligro(delta = 1, motivo = "") {
  if (game.user.isGM) {
    await fijarNivelPeligro(leerNivelPeligro() + delta, { motivo });
    return;
  }
  if (!game.users.activeGM) return;
  game.socket.emit(CANAL_SOCKET, { tipo: "peligro", accion: "subir", delta, motivo });
}

/**
 * Cuenta un abalorio jugado En Juego; cada 3 sube 1 el Nivel de peligro (contador global oculto
 * `abaloriosPeligro`). Los jugadores lo piden por socket al Master.
 * @param {string} [nombre=""] - Quién lo ha jugado (para el chat).
 * @returns {Promise<void>}
 */
export async function registrarAbalorioJugado(nombre = "") {
  if (!game.user.isGM) {
    if (game.users.activeGM) game.socket.emit(CANAL_SOCKET, { tipo: "peligro", accion: "abalorio", nombre });
    return;
  }
  const cuenta = (Math.floor(Number(leerAjuste("abaloriosPeligro", 0)) || 0)) + 1;
  if (cuenta >= ABALORIOS_POR_NIVEL_PELIGRO) {
    await game.settings.set("cartas-y-dados", "abaloriosPeligro", 0);
    if (leerNivelPeligro() < NIVEL_PELIGRO_MAXIMO) {
      await subirNivelPeligro(1, `Se han jugado ${ABALORIOS_POR_NIVEL_PELIGRO} abalorios en la mesa${nombre ? ` (el último, ${nombre})` : ""}.`);
    }
  } else {
    await game.settings.set("cartas-y-dados", "abaloriosPeligro", cuenta);
  }
}

/**
 * Reinicia el Nivel de peligro y el contador de abalorios (fin de escena). Solo Master.
 * @returns {Promise<void>}
 */
export async function reiniciarPeligro() {
  if (!game.user.isGM) return;
  await game.settings.set("cartas-y-dados", "abaloriosPeligro", 0);
  await fijarNivelPeligro(0, { motivo: "Fin de la escena." });
}

/**
 * Escucha las peticiones de los jugadores sobre el Nivel de peligro. Solo las atiende el Master
 * activo, para no duplicarlas. Llamar en `ready`.
 */
export function registrarSocketPeligro() {
  game.socket.on(CANAL_SOCKET, async mensaje => {
    if (mensaje?.tipo !== "peligro" || game.user !== game.users.activeGM) return;
    if (mensaje.accion === "abalorio") await registrarAbalorioJugado(String(mensaje.nombre ?? ""));
    else if (mensaje.accion === "subir") await subirNivelPeligro(Number(mensaje.delta) || 1, String(mensaje.motivo ?? ""));
  });
}
