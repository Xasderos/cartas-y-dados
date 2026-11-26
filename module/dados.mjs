/**
 * @file dados.mjs
 * @description Motor de tiradas `XdY` del sistema con las reglas de Crítico y Pifia (v0.11.0).
 *
 * - **Crítico:** cada dado de la tirada base que saca su valor máximo se vuelve a tirar
 *   UNA sola vez (si la repetición vuelve a ser máxima no se repite de nuevo) y los nuevos
 *   resultados se suman al primer resultado.
 * - **Pifia:** si al menos la mitad de los dados base sacan el mínimo (1), se apunta el
 *   resultado (base + crítico + bono) y se vuelven a tirar todos los dados que salieron 1;
 *   su suma se RESTA del resultado apuntado.
 * - **Resultado negativo:** en tiradas normales es un fallo automático; en tiradas
 *   enfrentadas el oponente suma el valor absoluto a su propia tirada.
 *
 * Todas las tiradas del sistema (Cartas de Acción, Habilidades, Acciones rápidas y tiradas
 * de Atributo de PNJ) pasan por `tirarDadosSistema()` y se publican con `publicarTirada()`.
 */

/**
 * @typedef {Object} ResultadoTiradaSistema
 * @property {number} total - Resultado final (puede ser negativo por una Pifia).
 * @property {Roll[]} rolls - Tiradas de Foundry en orden: base, crítico (opcional), pifia (opcional).
 * @property {number[]} resultadosBase - Valores de los dados de la tirada base.
 * @property {number[]} resultadosCritico - Valores de las repeticiones por Crítico.
 * @property {number[]} resultadosPifia - Valores de las repeticiones por Pifia.
 * @property {boolean} esCritico - Al menos un dado base salió máximo.
 * @property {boolean} esPifia - Al menos la mitad de los dados base salieron 1.
 * @property {boolean} esNegativo - El total es menor que 0 (fallo automático).
 * @property {boolean} mitadPorAgotamiento - Se aplicó la mitad por Agotamiento 6+ (nunca a un resultado negativo).
 * @property {number} totalSinAgotamiento - Total antes de la reducción por Agotamiento.
 * @property {string} formula - Fórmula base legible ("3d6 + 2").
 * @property {number} cantidadDados - Nº de dados lanzados (para repetir la tirada, v0.13.0).
 * @property {string} tipoDado - Dado lanzado ("d6").
 * @property {number} bono - Bonificador plano aplicado.
 * @property {string} html - Bloque HTML `.cyd-tirada-detalle` con el desglose para el chat.
 */

/**
 * Devuelve los valores activos del primer término de dados de una tirada evaluada.
 * @param {Roll} roll - Tirada ya evaluada.
 * @returns {number[]}
 */
function valoresDados(roll) {
  return (roll?.dice?.[0]?.results ?? []).filter(r => r.active !== false).map(r => r.result);
}

/**
 * Lanza `cantidadDados` dados `tipoDado` aplicando Crítico y Pifia.
 * @param {Object} opciones
 * @param {number} opciones.cantidadDados - Nº de dados (mínimo 1).
 * @param {string} opciones.tipoDado - Dado ("d4".."d12").
 * @param {number} [opciones.bono=0] - Bonificador plano sumado al resultado apuntado.
 * @param {Object} [opciones.rollData={}] - Datos de tirada del Actor (`getRollData()`).
 * @param {boolean} [opciones.mitadPorAgotamiento=false] - Agotamiento 6+ (v0.12.0): el resultado
 *   final se reduce a la mitad redondeando hacia arriba. (v0.14.0) Un resultado negativo no se
 *   divide: se mantiene entero (y sigue siendo fallo automático).
 * @param {boolean} [opciones.parcial=false] - (v0.14.0) La tirada es parte de otra mayor
 *   (`combinarTiradas`): su desglose no anuncia el fallo automático por negativo, que se
 *   decide con el total combinado.
 * @returns {Promise<ResultadoTiradaSistema>}
 */
export async function tirarDadosSistema({ cantidadDados, tipoDado, bono = 0, rollData = {}, mitadPorAgotamiento = false, parcial = false }) {
  const n = Math.max(1, Math.floor(Number(cantidadDados) || 1));
  const caras = Math.max(2, Number(String(tipoDado ?? "d6").replace(/^d/i, "")) || 6);
  const bonoNum = Number(bono) || 0;

  const tiradaBase = await new Roll(`${n}d${caras}`, rollData).evaluate();
  const rolls = [tiradaBase];
  const resultadosBase = valoresDados(tiradaBase);
  const sumaBase = resultadosBase.reduce((a, b) => a + b, 0);

  // Crítico: una única repetición por cada dado máximo (sin encadenar).
  const maximos = resultadosBase.filter(v => v === caras).length;
  let resultadosCritico = [];
  if (maximos > 0) {
    const tiradaCritico = await new Roll(`${maximos}d${caras}`).evaluate();
    rolls.push(tiradaCritico);
    resultadosCritico = valoresDados(tiradaCritico);
  }
  const sumaCritico = resultadosCritico.reduce((a, b) => a + b, 0);

  // Pifia: al menos la mitad de los dados base en 1 → se repiten esos dados y se restan.
  const minimos = resultadosBase.filter(v => v === 1).length;
  const esPifia = minimos > 0 && minimos * 2 >= n;
  let resultadosPifia = [];
  if (esPifia) {
    const tiradaPifia = await new Roll(`${minimos}d${caras}`).evaluate();
    rolls.push(tiradaPifia);
    resultadosPifia = valoresDados(tiradaPifia);
  }
  const sumaPifia = resultadosPifia.reduce((a, b) => a + b, 0);

  const apuntado = sumaBase + sumaCritico + bonoNum;
  const totalSinAgotamiento = apuntado - sumaPifia;
  // Agotamiento 6+ (v0.14.0): un resultado negativo NO se divide (conserva toda su penalización).
  const aplicaMitad = Boolean(mitadPorAgotamiento) && totalSinAgotamiento > 0;
  const total = aplicaMitad ? Math.ceil(totalSinAgotamiento / 2) : totalSinAgotamiento;
  const formula = bonoNum !== 0 ? `${n}d${caras} ${bonoNum > 0 ? "+" : "-"} ${Math.abs(bonoNum)}` : `${n}d${caras}`;

  const resultado = {
    total,
    rolls,
    resultadosBase,
    resultadosCritico,
    resultadosPifia,
    esCritico: maximos > 0,
    esPifia,
    esNegativo: total < 0,
    mitadPorAgotamiento: aplicaMitad,
    totalSinAgotamiento,
    formula,
    cantidadDados: n,
    tipoDado: `d${caras}`,
    bono: bonoNum,
    html: ""
  };
  resultado.html = htmlDetalleTirada(resultado, { n, caras, maximos, minimos, bonoNum, apuntado, sumaCritico, sumaPifia, parcial });
  return resultado;
}

/**
 * Construye el desglose HTML de la tirada (solo muestra Crítico/Pifia si ocurren).
 * @param {ResultadoTiradaSistema} t
 * @param {Object} d - Datos intermedios del cálculo.
 * @returns {string}
 */
function htmlDetalleTirada(t, { n, caras, maximos, minimos, bonoNum, apuntado, sumaCritico, sumaPifia, parcial = false }) {
  const lista = valores => `[${valores.join(", ")}]`;
  const lineas = [];

  if (t.esCritico) {
    lineas.push(`<p class="cyd-tirada-critico"><i class="fa-solid fa-star"></i> <strong>CRÍTICO</strong> · ${maximos} dado(s) al máximo (${caras}) se repiten: ${lista(t.resultadosCritico)} <strong>+${sumaCritico}</strong></p>`);
  }
  if (t.esPifia) {
    lineas.push(`<p class="cyd-tirada-pifia"><i class="fa-solid fa-skull-crossbones"></i> <strong>PIFIA</strong> · ${minimos} de ${n} dado(s) en 1; resultado apuntado ${apuntado}, se repiten: ${lista(t.resultadosPifia)} <strong>−${sumaPifia}</strong></p>`);
  }
  if (t.mitadPorAgotamiento) {
    lineas.push(`<p class="cyd-tirada-agotamiento"><i class="fa-solid fa-hourglass-half"></i> <strong>AGOTAMIENTO</strong> · resultado a la mitad: ${t.totalSinAgotamiento} → <strong>${t.total}</strong></p>`);
  }
  if (t.esNegativo && !parcial) {
    lineas.push(`<p class="cyd-tirada-negativa"><i class="fa-solid fa-circle-exclamation"></i> <strong>Resultado negativo (${t.total}):</strong> fallo automático. En una tirada enfrentada, el oponente suma <strong>+${Math.abs(t.total)}</strong> a su tirada.</p>`);
  }

  const partes = [`${lista(t.resultadosBase)}`];
  if (t.esCritico) partes.push(`+ ${sumaCritico}`);
  if (bonoNum !== 0) partes.push(`${bonoNum > 0 ? "+" : "−"} ${Math.abs(bonoNum)}`);
  if (t.esPifia) partes.push(`− ${sumaPifia}`);
  if (t.mitadPorAgotamiento) partes.push(`(${t.totalSinAgotamiento}) ÷ 2`);

  return `
    <div class="cyd-tirada-detalle">
      <p><i class="fa-solid fa-dice-d20"></i> <strong>${t.formula}:</strong> ${partes.join(" ")} = <strong>${t.total}</strong></p>
      ${lineas.join("")}
    </div>
  `;
}

/**
 * Une varias tiradas del sistema en un único resultado (v0.14.0): Ataque apuntado (dos cartas,
 * resultado a la mitad) y Potenciar (se suma una tirada de Misticismo). Las tiradas deben
 * hacerse con `parcial: true`; el aviso de resultado negativo se decide con el total combinado.
 * @param {Array<{tirada: ResultadoTiradaSistema, etiqueta: string}>} partes - Tiradas y su rótulo.
 * @param {Object} [opciones]
 * @param {boolean} [opciones.mitad=false] - Divide el total entre 2 redondeando hacia arriba; como el
 *   Agotamiento, un total negativo (o 0) no se divide.
 * @param {string} [opciones.motivoMitad=""] - Texto del motivo de la mitad ("Ataque apuntado").
 * @returns {ResultadoTiradaSistema} Con `combinada: true`; `cantidadDados`/`tipoDado`/`bono` son los de la primera parte.
 */
export function combinarTiradas(partes, { mitad = false, motivoMitad = "" } = {}) {
  const primera = partes[0].tirada;
  if (partes.length === 1 && !mitad) return primera;

  const suma = partes.reduce((acc, p) => acc + p.tirada.total, 0);
  // Igual que el Agotamiento: un resultado negativo (o 0) no se divide.
  const aplicaMitad = mitad && suma > 0;
  const total = aplicaMitad ? Math.ceil(suma / 2) : suma;
  const esNegativo = total < 0;

  const bloques = partes.map(p => `
    <div class="cyd-tirada-parte">
      <p class="cyd-tirada-parte-titulo"><strong>${p.etiqueta}:</strong> ${p.tirada.total}</p>
      ${p.tirada.html}
    </div>`).join("");
  const desglose = partes.map(p => p.tirada.total).join(" + ").replace(/\+ -/g, "− ");
  const lineaMitad = aplicaMitad
    ? `<p class="cyd-tirada-mitad"><i class="fa-solid fa-bullseye"></i> <strong>${motivoMitad || "Mitad"}</strong> · resultado a la mitad: ${suma} → <strong>${total}</strong></p>`
    : "";
  const lineaNegativa = esNegativo
    ? `<p class="cyd-tirada-negativa"><i class="fa-solid fa-circle-exclamation"></i> <strong>Resultado negativo (${total}):</strong> fallo automático. En una tirada enfrentada, el oponente suma <strong>+${Math.abs(total)}</strong> a su tirada.</p>`
    : "";

  return {
    ...primera,
    total,
    rolls: partes.flatMap(p => p.tirada.rolls),
    esCritico: partes.some(p => p.tirada.esCritico),
    esPifia: partes.some(p => p.tirada.esPifia),
    esNegativo,
    totalSinAgotamiento: suma,
    formula: partes.map(p => p.tirada.formula).join(" + "),
    combinada: true,
    html: `
      <div class="cyd-tirada-combinada">
        ${bloques}
        <div class="cyd-tirada-detalle">
          <p><i class="fa-solid fa-dice-d20"></i> <strong>Total:</strong> ${desglose}${aplicaMitad ? " ÷ 2" : ""} = <strong>${total}</strong></p>
          ${lineaMitad}
          ${lineaNegativa}
        </div>
      </div>
    `
  };
}

/** Canal de socket del sistema (requiere `"socket": true` en `system.json`). */
const CANAL_SOCKET = "system.cartas-y-dados";

/**
 * Publica una tirada del sistema en el chat incluyendo todas sus `Roll`
 * (base, crítico y pifia) para que se vean en el tooltip y en Dice So Nice.
 * Si se indica `htmlMaster` (Defensa y daño de un objetivo), se envía después como
 * mensaje solo para el Master (`enviarMensajeSoloMaster`).
 * @param {ResultadoTiradaSistema} tirada
 * @param {Object} datos
 * @param {Object} datos.speaker - `ChatMessage.getSpeaker(...)`.
 * @param {string} datos.flavor - HTML de cabecera del mensaje.
 * @param {string} [datos.htmlMaster=""] - HTML privado del Master.
 * @param {Object|null} [datos.repeticion=null] - (v0.13.0) Datos para repetir la tirada con el rasgo
 *   «Espera un momento» (`SistemaActor#_datosRepeticionTirada`); se guardan en
 *   `flags.cartas-y-dados.repeticion` y el chat muestra el botón al propietario.
 * @returns {Promise<ChatMessage>}
 */
export async function publicarTirada(tirada, { speaker, flavor, htmlMaster = "", repeticion = null }) {
  const datosMensaje = {
    speaker,
    flavor,
    content: String(tirada.total),
    rolls: tirada.rolls,
    sound: CONFIG.sounds.dice
  };
  if (repeticion) datosMensaje.flags = { "cartas-y-dados": { repeticion } };
  const mensaje = await ChatMessage.create(datosMensaje);
  if (htmlMaster) await enviarMensajeSoloMaster({ speaker, content: htmlMaster });
  return mensaje;
}

/**
 * Crea un mensaje susurrado SOLO a los Masters (v0.11.0). Si quien lo pide es un jugador,
 * no lo crea él (el autor de un susurro siempre lo ve): lo pide por socket al Master activo,
 * de modo que la información nunca llega al cliente del jugador.
 * @param {{speaker: Object, content: string}} datos
 * @returns {Promise<void>}
 */
export async function enviarMensajeSoloMaster(datos) {
  if (game.user.isGM) {
    await crearMensajeSoloMaster(datos);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn("No hay ningún Master conectado: la Defensa y el daño del objetivo no se han enviado.");
    return;
  }
  game.socket.emit(CANAL_SOCKET, { tipo: "mensajeSoloMaster", datos });
}

/**
 * Crea (como Master) el mensaje susurrado a todos los Masters.
 * @param {{speaker: Object, content: string}} datos
 * @returns {Promise<ChatMessage>}
 */
async function crearMensajeSoloMaster({ speaker, content }) {
  return ChatMessage.create({
    speaker,
    content,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    flags: { "cartas-y-dados": { soloMaster: true } }
  });
}

/**
 * Escucha las peticiones de los jugadores en el socket del sistema. Solo el Master
 * activo (`game.users.activeGM`) las atiende, para no duplicar mensajes. Llamar en `ready`.
 */
export function registrarSocketDados() {
  game.socket.on(CANAL_SOCKET, async mensaje => {
    if (mensaje?.tipo !== "mensajeSoloMaster") return;
    if (game.user !== game.users.activeGM) return;
    await crearMensajeSoloMaster(mensaje.datos ?? {});
  });
}

/**
 * Bloque HTML de resolución contra la Dificultad del Master. Un total negativo
 * siempre es fallo automático.
 * @param {ResultadoTiradaSistema} tirada
 * @param {string} [etiqueta="Dificultad del Master"]
 * @returns {string} HTML vacío si no hay dificultad fijada (0).
 */
export function htmlResolucionDificultad(tirada, etiqueta = "Dificultad del Master") {
  const dificultad = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;
  if (dificultad <= 0) return "";
  const exito = !tirada.esNegativo && tirada.total >= dificultad;
  const textoExito = exito
    ? '<span class="cyd-resultado-exito">ÉXITO</span>'
    : `<span class="cyd-resultado-fallo">${tirada.esNegativo ? "FALLO AUTOMÁTICO" : "FALLO"}</span>`;
  return `
    <div class="cyd-resolucion-caja ${exito ? "cyd-exito" : "cyd-fallo"}">
      <p><i class="fa-solid fa-bullseye"></i> <strong>${etiqueta} (${dificultad}):</strong> ${textoExito} (Total: ${tirada.total})</p>
    </div>
  `;
}
