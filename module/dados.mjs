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
 * - **Crítico y Pifia a la vez (v0.22.1):** una tirada no puede ser ambas cosas; si se cumplen las
 *   dos condiciones, ninguna se aplica y la tirada es normal (el desglose lo indica).
 * - **Resultado negativo:** en tiradas normales es un fallo automático; en tiradas
 *   enfrentadas el oponente suma el valor absoluto a su propia tirada.
 *
 * Todas las tiradas del sistema (Cartas de Acción, Habilidades, Acciones rápidas y tiradas
 * de Atributo de PNJ) pasan por `tirarDadosSistema()` y se publican con `publicarTirada()`.
 *
 * - **Modo de Crítico y Pifia (v0.14.1, ajuste `modoCriticosPifias`):** en "automatico" las
 *   repeticiones se lanzan solas; en "manual" se publica la tarjeta de la tirada con los dados
 *   base y botones «Tirar Crítico»/«Tirar Pifia» (solo los pulsa quien lanzó la tirada); al
 *   pulsarlos todos, `publicarTirada()` convierte esa misma tarjeta en el resultado final.
 */

import { leerAjuste } from "./settings.mjs";
import { efectosPeligro } from "./peligro.mjs";

/**
 * @typedef {Object} ResultadoTiradaSistema
 * @property {number} total - Resultado final (puede ser negativo por una Pifia).
 * @property {Roll[]} rolls - Tiradas de Foundry en orden: base, crítico (opcional), pifia (opcional).
 * @property {number[]} resultadosBase - Valores de los dados de la tirada base.
 * @property {number[]} resultadosCritico - Valores de las repeticiones por Crítico.
 * @property {number[]} resultadosPifia - Valores de las repeticiones por Pifia.
 * @property {boolean} esCritico - Al menos un dado base salió máximo.
 * @property {boolean} esPifia - Al menos la mitad de los dados base salieron 1.
 * @property {boolean} criticoYPifia - (v0.22.1) Se cumplían Crítico y Pifia a la vez: se anulan y la
 *   tirada es normal (`esCritico` y `esPifia` quedan en false).
 * @property {boolean} esNegativo - El total es menor que 0 (fallo automático).
 * @property {boolean} mitadPorAgotamiento - Se aplicó la mitad por Agotamiento 6+ (nunca a un resultado negativo).
 * @property {number} totalSinAgotamiento - Total antes de la reducción por Agotamiento.
 * @property {number} multiplicador - (v0.20.0, Ritual de espíritu) Factor aplicado al resultado (1 = ninguno).
 * @property {string} formula - Fórmula base legible ("3d6 + 2").
 * @property {number} cantidadDados - Nº de dados pedidos, SIN los del Nivel de peligro (para repetir
 *   la tirada, v0.13.0: la repetición vuelve a sumar los dados del peligro vigente).
 * @property {number} dadosPeligro - (v0.21.0) Dados añadidos por el Nivel de peligro (Nv. 1 y 4).
 * @property {number} nivelPeligro - (v0.21.0) Nivel de peligro con el que se lanzó la tirada.
 * @property {number} umbralCritico - (v0.21.0) Valor mínimo de un dado para ser Crítico.
 * @property {number[]} resultadosCritico2 - (v0.21.0, peligro 8) Segunda repetición de los dados de
 *   Crítico que volvieron a ser críticos (ya incluidos en `resultadosCritico`).
 * @property {string} tipoDado - Dado lanzado ("d6").
 * @property {number} bono - Bonificador plano aplicado.
 * @property {string[]} mensajesPendientes - (v0.14.1) Ids de las tarjetas de tirada pendiente
 *   (modo manual de Crítico/Pifia); `publicarTirada()` reutiliza la primera y borra el resto.
 * @property {SustitucionDado[]} sustituciones - (v0.16.0) Dados sustituidos con «Tiempo embotellado».
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
 * @param {Object|null} [opciones.speaker=null] - (v0.14.1) Hablante de la tarjeta pendiente en modo
 *   manual de Crítico/Pifia (por defecto, `ChatMessage.getSpeaker()`).
 * @param {string} [opciones.titulo=""] - (v0.14.1) Título de la tarjeta pendiente en modo manual.
 * @param {number|null} [opciones.resultadoFijo=null] - (v0.17.0, Mal de ojo) Si se indica, no se lanzan
 *   dados: el resultado es automáticamente este valor (sin bono, Crítico, Pifia ni Agotamiento).
 * @param {string} [opciones.motivoFijo=""] - (v0.17.0) Texto del desglose para el resultado fijo.
 * @param {number} [opciones.multiplicador=1] - (v0.20.0, Brujo · Ritual de espíritu) El resultado final
 *   (tras la mitad por Agotamiento) se multiplica por este valor, también si es negativo. 0 o 1 = sin efecto.
 * @param {boolean} [opciones.dadosPeligro=true] - (v0.21.0) Sumar los dados extra del Nivel de peligro
 *   (Nv. 1 y 4). En una tirada combinada solo los recibe la parte principal: pasar `false` en las
 *   demás (Ataque apuntado, Potenciar, cartas de Descarga elemental...). El resto de efectos del
 *   peligro (umbral de Crítico, Pifia de un dado, doble Crítico) se aplican siempre.
 * @returns {Promise<ResultadoTiradaSistema>} En modo manual, no se resuelve hasta que se pulsan
 *   los botones de Crítico/Pifia de la tarjeta.
 */
export async function tirarDadosSistema({
  cantidadDados, tipoDado, bono = 0, rollData = {}, mitadPorAgotamiento = false, parcial = false,
  speaker = null, titulo = "", resultadoFijo = null, motivoFijo = "", multiplicador = 1, dadosPeligro = true
}) {
  const nPedidos = Math.max(1, Math.floor(Number(cantidadDados) || 1));
  const caras = Math.max(2, Number(String(tipoDado ?? "d6").replace(/^d/i, "")) || 6);
  const bonoNum = Number(bono) || 0;
  if (resultadoFijo !== null && resultadoFijo !== undefined) {
    return tiradaResultadoFijo(Number(resultadoFijo) || 0, { n: nPedidos, caras, motivo: motivoFijo });
  }
  // (v0.21.0) Nivel de peligro: dados extra, umbral de Crítico, Pifia de un dado y doble Crítico.
  const peligro = efectosPeligro();
  const extraPeligro = dadosPeligro ? peligro.dadosExtra : 0;
  const n = nPedidos + extraPeligro;
  const umbralCritico = Math.max(2, caras - peligro.margenCritico);
  const esCriticoValor = v => v >= umbralCritico;

  const tiradaBase = await new Roll(`${n}d${caras}`, rollData).evaluate();
  const rolls = [tiradaBase];
  const resultadosBase = valoresDados(tiradaBase);
  // (v0.16.0) Tiempo embotellado: antes de evaluar Crítico y Pifia, quien tira puede sustituir dados
  // por los valores embotellados de su Actor. Los dados de la `Roll` conservan el valor original
  // (tooltip); el desglose del chat indica cada sustitución.
  const sustituciones = await pedirSustitucionesDados({ speaker, resultadosBase, caras, titulo });
  for (const s of sustituciones) resultadosBase[s.indice] = s.despues;
  const sumaBase = resultadosBase.reduce((a, b) => a + b, 0);

  // Crítico: una única repetición por cada dado máximo (sin encadenar). (v0.21.0) Con peligro 5,
  // también desde uno menos del máximo; con peligro 8, la repetición crítica se repite una vez más.
  const maximosBase = resultadosBase.filter(esCriticoValor).length;
  // Pifia: al menos la mitad de los dados base en 1 → se repiten esos dados y se restan.
  // (v0.21.0) Con peligro 6 basta un solo dado en 1.
  const minimos = resultadosBase.filter(v => v === 1).length;
  const condicionPifia = minimos > 0 && (peligro.pifiaUnDado || minimos * 2 >= n);
  // (v0.22.1) Una tirada no puede ser Crítico y Pifia a la vez: si se cumplen ambas, es una tirada normal.
  const criticoYPifia = maximosBase > 0 && condicionPifia;
  const maximos = criticoYPifia ? 0 : maximosBase;
  const esPifia = criticoYPifia ? false : condicionPifia;

  // Modo manual (ajuste `modoCriticosPifias`): la tarjeta se publica con los dados base y
  // botones para lanzar el Crítico y/o la Pifia; la tirada continúa al pulsarlos.
  /** @type {TarjetaPendiente|null} */
  const pendiente = (maximos > 0 || esPifia) && leerAjuste("modoCriticosPifias", "automatico") === "manual"
    ? await crearTarjetaPendiente({
      speaker: speaker ?? ChatMessage.getSpeaker(), titulo, tiradaBase, resultadosBase,
      formula: `${n}d${caras}`, caras, maximos, minimos, n, esPifia, umbralCritico
    })
    : null;

  /**
   * Lanza las repeticiones de Crítico o Pifia (esperando antes al clic en modo manual).
   * @param {"critico"|"critico2"|"pifia"} tipo
   * @param {number} cantidad
   * @param {Function|null} [siguiente=null] - (v0.21.0) Recibe la `Roll` y devuelve cuántos dados
   *   necesitan otra ronda (`critico2`); en modo manual la tarjeta muestra su botón.
   * @returns {Promise<Roll|null>}
   */
  const repetir = async (tipo, cantidad, siguiente = null) => {
    if (cantidad <= 0) return null;
    if (pendiente) await pendiente.esperar(tipo);
    const roll = await new Roll(`${cantidad}d${caras}`).evaluate();
    if (pendiente) await pendiente.mostrar(tipo, roll, siguiente ? siguiente(roll) : 0);
    return roll;
  };
  /** (v0.21.0, peligro 8) Dados de la primera repetición de Crítico que vuelven a ser críticos. */
  const criticosEncadenados = roll => peligro.rondasCritico > 1 ? valoresDados(roll).filter(esCriticoValor).length : 0;
  /** Crítico completo: primera repetición y, con peligro 8, la segunda. */
  const repetirCriticos = async () => {
    const primera = await repetir("critico", maximos, criticosEncadenados);
    const segunda = primera ? await repetir("critico2", criticosEncadenados(primera)) : null;
    return [primera, segunda];
  };
  // En modo manual ambos botones pueden pulsarse en cualquier orden.
  const [[tiradaCritico, tiradaCritico2], tiradaPifia] = await Promise.all([
    repetirCriticos(),
    repetir("pifia", esPifia ? minimos : 0)
  ]);
  if (tiradaCritico) rolls.push(tiradaCritico);
  if (tiradaCritico2) rolls.push(tiradaCritico2);
  if (tiradaPifia) rolls.push(tiradaPifia);
  const resultadosCritico2 = valoresDados(tiradaCritico2);
  const resultadosCritico = [...valoresDados(tiradaCritico), ...resultadosCritico2];
  const resultadosPifia = valoresDados(tiradaPifia);
  const sumaCritico = resultadosCritico.reduce((a, b) => a + b, 0);
  const sumaPifia = resultadosPifia.reduce((a, b) => a + b, 0);

  const apuntado = sumaBase + sumaCritico + bonoNum;
  const totalSinAgotamiento = apuntado - sumaPifia;
  // Agotamiento 6+ (v0.14.0): un resultado negativo NO se divide (conserva toda su penalización).
  const aplicaMitad = Boolean(mitadPorAgotamiento) && totalSinAgotamiento > 0;
  const totalTrasMitad = aplicaMitad ? Math.ceil(totalSinAgotamiento / 2) : totalSinAgotamiento;
  // (v0.20.0) Ritual de espíritu: × Nivel de peligro (un factor 0 o 1 no cambia nada).
  const factor = Math.floor(Number(multiplicador) || 1) || 1;
  const total = totalTrasMitad * factor;
  const formula = bonoNum !== 0 ? `${n}d${caras} ${bonoNum > 0 ? "+" : "-"} ${Math.abs(bonoNum)}` : `${n}d${caras}`;

  const resultado = {
    total,
    rolls,
    resultadosBase,
    resultadosCritico,
    resultadosPifia,
    esCritico: maximos > 0,
    esPifia,
    criticoYPifia,
    esNegativo: total < 0,
    mitadPorAgotamiento: aplicaMitad,
    totalSinAgotamiento,
    multiplicador: factor,
    totalTrasMitad,
    formula,
    cantidadDados: nPedidos,
    dadosPeligro: extraPeligro,
    nivelPeligro: peligro.nivel,
    umbralCritico,
    resultadosCritico2,
    tipoDado: `d${caras}`,
    bono: bonoNum,
    mensajesPendientes: pendiente ? [pendiente.mensajeId] : [],
    sustituciones,
    html: ""
  };
  resultado.html = htmlDetalleTirada(resultado, {
    n, caras, maximos, minimos, bonoNum, apuntado, sumaCritico, sumaPifia, parcial, pifiaUnDado: peligro.pifiaUnDado
  });
  return resultado;
}

/**
 * Tirada sin dados con un resultado fijo (v0.17.0, «Mal de ojo» sobre una carta d4: el resultado es
 * automáticamente 1). Lleva una `Roll` constante para que el mensaje de chat tenga su tirada.
 * @param {number} valor - Resultado fijo.
 * @param {{n: number, caras: number, motivo: string}} datos
 * @returns {Promise<ResultadoTiradaSistema>}
 */
async function tiradaResultadoFijo(valor, { n, caras, motivo }) {
  const roll = await new Roll(String(valor)).evaluate();
  return {
    total: valor,
    rolls: [roll],
    resultadosBase: [],
    resultadosCritico: [],
    resultadosPifia: [],
    esCritico: false,
    esPifia: false,
    criticoYPifia: false,
    esNegativo: valor < 0,
    mitadPorAgotamiento: false,
    totalSinAgotamiento: valor,
    multiplicador: 1,
    totalTrasMitad: valor,
    formula: String(valor),
    cantidadDados: n,
    dadosPeligro: 0,
    nivelPeligro: 0,
    umbralCritico: caras,
    resultadosCritico2: [],
    tipoDado: `d${caras}`,
    bono: 0,
    mensajesPendientes: [],
    sustituciones: [],
    html: `
      <div class="cyd-tirada-detalle">
        <p><i class="fa-solid fa-eye-slash"></i> <strong>${motivo || "Resultado automático"}:</strong> no se lanzan dados (${n}d${caras}) = <strong>${valor}</strong></p>
      </div>`
  };
}

/**
 * @typedef {Object} SustitucionDado
 * @property {number} indice - Posición del dado en la tirada base (0..n-1).
 * @property {number} antes - Valor que salió.
 * @property {number} despues - Valor embotellado que lo sustituye.
 */

/**
 * Pide al Actor que tira (resuelto desde `speaker`) las sustituciones de dados de «Tiempo
 * embotellado» (v0.16.0). El Actor decide si tiene valores guardados y pregunta al usuario
 * (`SistemaActor#elegirSustitucionesTiempoEmbotellado`); sin Actor o sin valores no hace nada.
 * @param {Object} datos
 * @param {Object|null} datos.speaker - Hablante de la tirada.
 * @param {number[]} datos.resultadosBase - Dados base (no se modifican aquí).
 * @param {number} datos.caras - Caras del dado.
 * @param {string} datos.titulo - Título de la tirada (para el diálogo).
 * @returns {Promise<SustitucionDado[]>}
 */
async function pedirSustitucionesDados({ speaker, resultadosBase, caras, titulo }) {
  const actor = speaker ? ChatMessage.getSpeakerActor(speaker) : null;
  if (typeof actor?.elegirSustitucionesTiempoEmbotellado !== "function") return [];
  try {
    return await actor.elegirSustitucionesTiempoEmbotellado({ resultados: [...resultadosBase], caras, titulo }) ?? [];
  } catch (err) {
    console.error("Cartas y Dados | Error en Tiempo embotellado:", err);
    return [];
  }
}

/**
 * Construye el desglose HTML de la tirada (solo muestra Crítico/Pifia si ocurren).
 * @param {ResultadoTiradaSistema} t
 * @param {Object} d - Datos intermedios del cálculo.
 * @returns {string}
 */
function htmlDetalleTirada(t, { n, caras, maximos, minimos, bonoNum, apuntado, sumaCritico, sumaPifia, parcial = false, pifiaUnDado = false }) {
  const lista = valores => `[${valores.join(", ")}]`;
  const lineas = [];

  if (t.dadosPeligro > 0) {
    // (v0.21.0) Nivel de peligro 1 y 4.
    lineas.push(`<p class="cyd-tirada-peligro"><i class="fa-solid fa-skull"></i> <strong>PELIGRO ${t.nivelPeligro}</strong> · +${t.dadosPeligro} dado(s) por el Nivel de peligro</p>`);
  }

  if (t.sustituciones?.length) {
    const cambios = t.sustituciones.map(s => `dado ${s.indice + 1}: ${s.antes} → ${s.despues}`).join(" · ");
    lineas.push(`<p class="cyd-tirada-embotellado"><i class="fa-solid fa-hourglass-start"></i> <strong>TIEMPO EMBOTELLADO</strong> · ${cambios}</p>`);
  }
  if (t.criticoYPifia) {
    // (v0.22.1) Crítico y Pifia a la vez se anulan: tirada normal.
    lineas.push(`<p class="cyd-tirada-anulada"><i class="fa-solid fa-scale-balanced"></i> <strong>CRÍTICO Y PIFIA</strong> · hay dados al máximo y dados en 1 a la vez: se anulan y la tirada es normal (no se repite ningún dado)</p>`);
  }
  if (t.esCritico) {
    // (v0.21.0) Peligro 5: umbral de Crítico uno menos; peligro 8: segunda repetición.
    const textoUmbral = t.umbralCritico < caras ? `${t.umbralCritico} o más, Nivel de peligro` : caras;
    const primera = t.resultadosCritico.slice(0, t.resultadosCritico.length - (t.resultadosCritico2?.length ?? 0));
    const segunda = t.resultadosCritico2?.length ? ` · vuelven a ser críticos y se repiten otra vez: ${lista(t.resultadosCritico2)}` : "";
    lineas.push(`<p class="cyd-tirada-critico"><i class="fa-solid fa-star"></i> <strong>CRÍTICO</strong> · ${maximos} dado(s) al máximo (${textoUmbral}) se repiten: ${lista(primera)}${segunda} <strong>+${sumaCritico}</strong></p>`);
  }
  if (t.esPifia) {
    lineas.push(`<p class="cyd-tirada-pifia"><i class="fa-solid fa-skull-crossbones"></i> <strong>PIFIA</strong> · ${minimos} de ${n} dado(s) en 1${pifiaUnDado && minimos * 2 < n ? " (basta uno por el Nivel de peligro)" : ""}; resultado apuntado ${apuntado}, se repiten: ${lista(t.resultadosPifia)} <strong>−${sumaPifia}</strong></p>`);
  }
  if (t.mitadPorAgotamiento) {
    lineas.push(`<p class="cyd-tirada-agotamiento"><i class="fa-solid fa-hourglass-half"></i> <strong>AGOTAMIENTO</strong> · resultado a la mitad: ${t.totalSinAgotamiento} → <strong>${t.totalTrasMitad}</strong></p>`);
  }
  if (t.multiplicador !== 1) {
    // (v0.20.0) Brujo · Ritual de espíritu.
    lineas.push(`<p class="cyd-tirada-agotamiento"><i class="fa-solid fa-skull"></i> <strong>RITUAL DE ESPÍRITU</strong> · resultado × Nivel de peligro ${t.multiplicador}: ${t.totalTrasMitad} → <strong>${t.total}</strong></p>`);
  }
  if (t.esNegativo && !parcial) {
    lineas.push(`<p class="cyd-tirada-negativa"><i class="fa-solid fa-circle-exclamation"></i> <strong>Resultado negativo (${t.total}):</strong> fallo automático. En una tirada enfrentada, el oponente suma <strong>+${Math.abs(t.total)}</strong> a su tirada.</p>`);
  }

  const partes = [`${lista(t.resultadosBase)}`];
  if (t.esCritico) partes.push(`+ ${sumaCritico}`);
  if (bonoNum !== 0) partes.push(`${bonoNum > 0 ? "+" : "−"} ${Math.abs(bonoNum)}`);
  if (t.esPifia) partes.push(`− ${sumaPifia}`);
  if (t.mitadPorAgotamiento) partes.push(`(${t.totalSinAgotamiento}) ÷ 2`);
  if (t.multiplicador !== 1) partes.push(`× ${t.multiplicador}`);

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
    criticoYPifia: partes.some(p => p.tirada.criticoYPifia),
    esNegativo,
    totalSinAgotamiento: suma,
    formula: partes.map(p => p.tirada.formula).join(" + "),
    mensajesPendientes: partes.flatMap(p => p.tirada.mensajesPendientes ?? []),
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

/* -------------------------------------------------------------------------- */
/*  Crítico y Pifia en modo manual (v0.14.1)                                    */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} TarjetaPendiente
 * @property {string} mensajeId - Id del `ChatMessage` de la tirada pendiente.
 * @property {(tipo: "critico"|"pifia") => Promise<void>} esperar - Se resuelve al pulsar el botón.
 * @property {(tipo: "critico"|"critico2"|"pifia", roll: Roll, siguientes?: number) => Promise<void>} mostrar -
 *   Muestra los dados lanzados (Dice So Nice o sonido) y actualiza la tarjeta. `siguientes` (v0.21.0):
 *   dados que necesitan la segunda repetición de Crítico (activa su botón).
 */

/**
 * Tiradas pendientes de este cliente: id del mensaje → resolutores de cada botón. Solo vive en
 * el cliente que lanzó la tirada; tras recargar la página la tarjeta deja de estar activa.
 * @type {Map<string, {resolutores: Object<string, Function>}>}
 */
const TIRADAS_PENDIENTES = new Map();

/**
 * Publica la tarjeta de una tirada con Crítico y/o Pifia pendientes de lanzar (modo manual).
 * El estado se guarda en `flags.cartas-y-dados.pendiente` (`{critico, pifia}`: `true` mientras
 * falta pulsar el botón, `number[]` con los dados ya lanzados) y el botón lo añade
 * `activarBotonesTiradaPendiente()` al renderizar el mensaje.
 * @param {Object} datos
 * @returns {Promise<TarjetaPendiente>}
 */
async function crearTarjetaPendiente({ speaker, titulo, tiradaBase, resultadosBase, formula, caras, maximos, minimos, n, esPifia, umbralCritico }) {
  const info = { titulo, formula, resultadosBase, caras, maximos, minimos, n, umbralCritico, maximos2: 0 };
  // (v0.21.0) `critico2`: segunda repetición de Crítico (Nivel de peligro 8), se activa tras la primera.
  const estado = { critico: maximos > 0 ? true : null, critico2: null, pifia: esPifia ? true : null };
  const mensaje = await ChatMessage.create({
    speaker,
    content: htmlTarjetaPendiente(info, estado),
    rolls: [tiradaBase],
    sound: CONFIG.sounds.dice,
    flags: { "cartas-y-dados": { pendiente: { ...estado, info } } }
  });
  const registro = { resolutores: {} };
  TIRADAS_PENDIENTES.set(mensaje.id, registro);

  return {
    mensajeId: mensaje.id,
    esperar: tipo => new Promise(resolve => { registro.resolutores[tipo] = resolve; }),
    mostrar: async (tipo, roll, siguientes = 0) => {
      if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
      else foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice }, false);
      estado[tipo] = valoresDados(roll);
      if (tipo === "critico" && siguientes > 0) {
        estado.critico2 = true;
        info.maximos2 = siguientes;
      }
      if (![estado.critico, estado.critico2, estado.pifia].includes(true)) TIRADAS_PENDIENTES.delete(mensaje.id);
      const actual = game.messages.get(mensaje.id);
      if (!actual?.getFlag("cartas-y-dados", "pendiente")) return;
      await actual.update({
        content: htmlTarjetaPendiente(info, estado),
        "flags.cartas-y-dados.pendiente": { ...estado, info }
      });
    }
  };
}

/**
 * HTML de la tarjeta de tirada pendiente: dados base y, por cada repetición, su resultado o el
 * hueco donde `activarBotonesTiradaPendiente()` coloca el botón (`[data-cyd-pendiente]`).
 * @param {Object} info - Datos fijos de la tirada (título, fórmula, dados base...).
 * @param {{critico: (true|number[]|null), pifia: (true|number[]|null)}} estado
 * @returns {string}
 */
function htmlTarjetaPendiente({ titulo, formula, resultadosBase, caras, maximos, minimos, n, umbralCritico = caras, maximos2 = 0 }, estado) {
  const lista = valores => `[${valores.join(", ")}]`;
  const suma = valores => valores.reduce((a, b) => a + b, 0);
  const lineas = [];
  const textoUmbral = umbralCritico < caras ? `${umbralCritico} o más` : caras;
  if (estado.critico === true) {
    lineas.push(`<p class="cyd-tirada-critico" data-cyd-pendiente="critico"><i class="fa-solid fa-star"></i> <strong>CRÍTICO</strong> · ${maximos} dado(s) al máximo (${textoUmbral}): falta lanzar ${maximos}d${caras}.</p>`);
  } else if (Array.isArray(estado.critico)) {
    lineas.push(`<p class="cyd-tirada-critico"><i class="fa-solid fa-star"></i> <strong>CRÍTICO</strong> · se repiten: ${lista(estado.critico)} <strong>+${suma(estado.critico)}</strong></p>`);
  }
  // (v0.21.0) Nivel de peligro 8: segunda repetición de los dados de Crítico que vuelven a ser críticos.
  if (estado.critico2 === true) {
    lineas.push(`<p class="cyd-tirada-critico" data-cyd-pendiente="critico2"><i class="fa-solid fa-star"></i> <strong>CRÍTICO (2.ª repetición, Nivel de peligro)</strong> · ${maximos2} dado(s) vuelven a ser críticos: falta lanzar ${maximos2}d${caras}.</p>`);
  } else if (Array.isArray(estado.critico2)) {
    lineas.push(`<p class="cyd-tirada-critico"><i class="fa-solid fa-star"></i> <strong>CRÍTICO (2.ª repetición)</strong> · se repiten: ${lista(estado.critico2)} <strong>+${suma(estado.critico2)}</strong></p>`);
  }
  if (estado.pifia === true) {
    lineas.push(`<p class="cyd-tirada-pifia" data-cyd-pendiente="pifia"><i class="fa-solid fa-skull-crossbones"></i> <strong>PIFIA</strong> · ${minimos} de ${n} dado(s) en 1: falta lanzar ${minimos}d${caras}.</p>`);
  } else if (Array.isArray(estado.pifia)) {
    lineas.push(`<p class="cyd-tirada-pifia"><i class="fa-solid fa-skull-crossbones"></i> <strong>PIFIA</strong> · se repiten: ${lista(estado.pifia)} <strong>−${suma(estado.pifia)}</strong></p>`);
  }
  return `
    <div class="cyd-carta-jugada cyd-tirada-pendiente">
      <h3><i class="fa-solid fa-hourglass-half"></i> ${titulo || "Tirada"} · pendiente</h3>
      <div class="cyd-tirada-detalle">
        <p><i class="fa-solid fa-dice-d20"></i> <strong>${formula}:</strong> ${lista(resultadosBase)}</p>
        ${lineas.join("")}
      </div>
    </div>
  `;
}

/**
 * Añade los botones «Tirar Crítico»/«Tirar Pifia» a una tarjeta de tirada pendiente
 * (llamar desde `renderChatMessageHTML`). Solo quien lanzó la tirada puede pulsarlos (la tirada
 * espera en su cliente); el resto ve un aviso de espera.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function activarBotonesTiradaPendiente(message, html) {
  if (!message.getFlag("cartas-y-dados", "pendiente")) return;
  for (const linea of html.querySelectorAll("[data-cyd-pendiente]")) {
    const tipo = linea.dataset.cydPendiente;
    if (message.author?.id !== game.user.id) {
      const aviso = document.createElement("small");
      aviso.className = "cyd-tirada-pendiente-aviso";
      aviso.textContent = `Esperando a que ${message.author?.name ?? "quien tira"} lance los dados.`;
      linea.after(aviso);
      continue;
    }
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "cyd-btn-tirada-pendiente";
    boton.innerHTML = tipo === "critico"
      ? '<i class="fa-solid fa-star"></i> Tirar Crítico'
      : tipo === "critico2"
        ? '<i class="fa-solid fa-star"></i> Tirar Crítico (2.ª)'
        : '<i class="fa-solid fa-skull-crossbones"></i> Tirar Pifia';
    boton.addEventListener("click", ev => {
      ev.preventDefault();
      const resolver = TIRADAS_PENDIENTES.get(message.id)?.resolutores?.[tipo];
      if (!resolver) {
        ui.notifications.warn("Esta tirada ya no está activa (se ha recargado la página). Vuelve a lanzarla.");
        return;
      }
      boton.disabled = true;
      delete TIRADAS_PENDIENTES.get(message.id).resolutores[tipo];
      resolver();
    });
    linea.after(boton);
  }
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
 *
 * (v0.14.1) Si la tirada dejó tarjetas pendientes (modo manual de Crítico/Pifia), la primera se
 * convierte en el mensaje final (misma tarjeta) y las demás se borran.
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

  const [idTarjeta, ...idsSobrantes] = tirada.mensajesPendientes ?? [];
  const tarjeta = idTarjeta ? game.messages.get(idTarjeta) : null;
  let mensaje;
  if (tarjeta) {
    delete datosMensaje.sound;
    datosMensaje.flags = { "cartas-y-dados": { ...(datosMensaje.flags?.["cartas-y-dados"] ?? {}), pendiente: null } };
    mensaje = await tarjeta.update(datosMensaje) ?? tarjeta;
  } else {
    mensaje = await ChatMessage.create(datosMensaje);
  }
  const sobrantes = idsSobrantes.filter(id => game.messages.has(id));
  if (sobrantes.length) await ChatMessage.deleteDocuments(sobrantes);

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
