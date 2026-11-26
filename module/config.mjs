/**
 * @file config.mjs
 * @description Configuración central del sistema Cartas y Dados para Foundry VTT v14.
 * Define la relación entre Palos -> Características (cantidad de dados)
 * y Número de Carta -> Tipo de Dado (caras del dado).
 */

export const SISTEMA_CONFIG = {
  /**
   * Características del personaje.
   * La clave debe coincidir con las propiedades de `actor.system.caracteristicas`.
   */
  caracteristicas: {
    fisico: "CARTASYDADOS.Caracteristicas.Fisico",
    consciencia: "CARTASYDADOS.Caracteristicas.Consciencia",
    social: "CARTASYDADOS.Caracteristicas.Social",
    misticismo: "CARTASYDADOS.Caracteristicas.Misticismo"
  },

  /**
   * Palos de las cartas y a qué característica del personaje están vinculados.
   * Cuando se juega una carta de un palo, se lanzan tantos dados como el valor
   * de la característica asociada (`caracteristicaAsociada`).
   */
  palosCartas: {
    espadas: {
      etiqueta: "CARTASYDADOS.Palos.Espadas",
      abreviado: "FISC",
      caracteristicaAsociada: "fisico",
      acciones: "Combate, proezas de fuerza, agilidad, movimiento y sigilo"
    },
    copas: {
      etiqueta: "CARTASYDADOS.Palos.Copas",
      abreviado: "MIST",
      caracteristicaAsociada: "misticismo",
      acciones: "Habilidades, magia, rituales y canalización mística"
    },
    oros: {
      etiqueta: "CARTASYDADOS.Palos.Oros",
      abreviado: "SOC",
      caracteristicaAsociada: "social",
      acciones: "Interacción social, persuasión, engaño y liderazgo"
    },
    bastos: {
      etiqueta: "CARTASYDADOS.Palos.Bastos",
      abreviado: "CONS",
      caracteristicaAsociada: "consciencia",
      acciones: "Percepción, conocimientos, táctica e investigación"
    }
  },

  /**
   * Mapa del número/valor de la carta (1 al 5) al tipo de dado que se lanza.
   * Puedes ampliar o modificar esta tabla en cualquier momento.
   * @type {Object<number, string>}
   */
  dadoPorNumeroCarta: {
    1: "d4",
    2: "d6",
    3: "d8",
    4: "d10",
    5: "d12"
  },

  /**
   * Mano máxima base de cualquier personaje antes de aplicar nivel de clase u objetos.
   */
  manoBasePorDefecto: 4,

  /**
   * Movimiento base en metros por turno (por defecto: ajuste world "movimientoBase").
   * Fórmula: movimiento.max = movimiento.base + (caracteristicasTotales.fisico * 5)
   */
  movimientoBase: 10,

  /**
   * Categoría de tamaño por defecto para nuevos actores (ajuste world "tamanoBase").
   * Opciones: Diminuto, Pequeño, Mediano, Grande, Enorme.
   */
  tamanoBase: "Mediano",

  /**
   * Niveles de Agotamiento (v0.12.0). Se guardan en `system.cansancio.value` (clave
   * histórica, no cambiar). Son acumulativos: el nivel N sufre todas las consecuencias
   * de 1..N. Se gana 1 punto al agotar el Mazo y barajar el Descarte; se recupera 1 punto
   * por descanso cómodo en un lugar seguro (máx. 1 por día). Nivel 8 = muerte.
   * Cada entrada: `{ nivel, clave, icono, texto }`; `clave` nombra el flag derivado
   * en `system.agotamiento.efectos`.
   */
  AGOTAMIENTO_NIVELES: [
    { nivel: 1, clave: "manoMitad", icono: "fa-hand", texto: "Tu mano máxima se reduce a la mitad, redondeando hacia arriba." },
    { nivel: 2, clave: "velocidadMitad", icono: "fa-person-running", texto: "Tu velocidad se reduce a la mitad." },
    { nivel: 3, clave: "saludMitad", icono: "fa-heart-pulse", texto: "Tu salud máxima se reduce a la mitad, redondeando hacia arriba." },
    { nivel: 4, clave: "sinReacciones", icono: "fa-ban", texto: "No puedes realizar reacciones." },
    { nivel: 5, clave: "unTrinket", icono: "fa-gem", texto: "Solo puedes tener un Trinket (abalorio) activo; si tienes más, quema los de tu elección hasta tener uno." },
    { nivel: 6, clave: "tiradasMitad", icono: "fa-dice-d20", texto: "El resultado de todas tus tiradas se reduce a la mitad, redondeando hacia arriba." },
    { nivel: 7, clave: "quemarAlUsar", icono: "fa-fire", texto: "Cada vez que uses una carta, quémala en vez de descartarla." },
    { nivel: 8, clave: "muerte", icono: "fa-skull", texto: "Mueres." }
  ],

  /** Nivel de Agotamiento que provoca la muerte (y máximo de la escala). */
  AGOTAMIENTO_MAXIMO: 8,

  /**
   * Razas Base del sistema (v0.10.1; rasgos desde v0.13.0).
   * El Asistente de Creación de Personaje ofrece estas razas en su primer paso y crea
   * con la elegida el Item `raza` del Actor (`system.claveRaza` guarda la clave).
   * Cada raza define:
   * - `nombre`: texto plano.
   * - `beneficios` / `desventajas`: lista de rasgos `{clave, nombre, icono, texto, auto?}`;
   *   `auto` (opcional) describe en texto plano lo que el sistema automatiza del rasgo.
   *   Los rasgos sin `auto` son narrativos: los aplica el Master.
   * - `bonificadores` (opcional): bonos fijos que `prepareDerivedData` suma por la clave de raza
   *   (no se guardan en el Item, así también afectan a personajes creados antes).
   * - `visionOscuridad` (opcional): metros de visión en la oscuridad que se aplican al Token.
   * - `aMano` (opcional, en un rasgo, v0.13.1): el rasgo tiene control o estado en juego y
   *   se muestra también en la pestaña Principal de la ficha (el resto solo en la pestaña Raza).
   * Las claves de rasgo con mecánica propia: `esperaUnMomento` (repetir tirada, 1/descanso),
   * `queMeDaAlgo` (indicador con Salud ≤ mitad), `tradicionAlquimica` (curación = nivel, 1/día),
   * `sangreFria` (Mano Máx. a la mitad mientras `system.rasgosRaza.expuestoElementos`).
   */
  RAZAS_BASE: {
    humanos: {
      nombre: "Humanos",
      beneficios: [
        {
          clave: "prolificoProfecias", nombre: "Prolífico en las profecías", icono: "fa-scroll",
          texto: "Los humanos tienen, la buena o mala suerte, de cumplir profecías y epopeyas: cuando estés entre la vida y la muerte y hayas quemado todas las cartas, aguantas 2 turnos más tras quemar la última carta. Si no eres ayudado en ese tiempo, el personaje muere."
        },
        {
          clave: "esperaUnMomento", aMano: true, nombre: "Espera un momento", icono: "fa-rotate-left",
          texto: "Tras realizar una tirada y ver el resultado, puedes elegir repetirla y usar el nuevo resultado. Puedes usar esto una vez por descanso.",
          auto: "Botón «Espera un momento» en tus tiradas del chat; se recarga al descansar."
        }
      ],
      desventajas: [],
      sinDesventajas: "Los humanos disfrutan de no tener ninguna desventaja inherente."
    },
    mairu: {
      nombre: "Mairu",
      beneficios: [
        {
          clave: "complexionAgil", nombre: "Complexión ágil", icono: "fa-person-running",
          texto: "Los Mairu poseen cuerpos delgados, ágiles y flexibles. Tu capacidad de salto aumenta 3 metros."
        },
        {
          clave: "cuerpoLigero", nombre: "Cuerpo ligero", icono: "fa-feather",
          texto: "Para su tamaño, los Mairu pesan menos de lo que aparentan; recibes menos daño por caída."
        }
      ],
      desventajas: [
        {
          clave: "figuraMisteriosa", nombre: "Figura misteriosa", icono: "fa-user-secret",
          texto: "La presencia de un Mairu es imponente y extraña; cuando llegues a una zona poblada, ya sea una villa, una ciudad o un fuerte, el rumor de tu llegada se extenderá rápidamente. Además, tu presencia es incómoda y hace a las demás razas desconfiar de ti."
        }
      ]
    },
    mandragora: {
      nombre: "Mandrágora",
      visionOscuridad: 20,
      beneficios: [
        {
          clave: "visionOscuridad", nombre: "Visión en la oscuridad", icono: "fa-eye",
          texto: "Los mandrágora poseen visión en la oscuridad hasta 20 metros.",
          auto: "Se configura en el Token del personaje al elegir la raza."
        },
        {
          clave: "vocesDelYo", nombre: "Voces del Yo", icono: "fa-comments",
          texto: "Puedes comunicarte sin usar la boca, reproducir sonidos o voces usando los cuernos. Con otros de tu raza, puedes usarlo para entablar conversaciones telepáticas."
        }
      ],
      desventajas: [
        {
          clave: "ecosDelPasado", nombre: "Ecos del pasado", icono: "fa-ghost",
          texto: "Eres propenso a ser contactado por antiguas deidades, probablemente para vengarse de tu raza por expulsarlas, ya sea en sueños, pesadillas o enviando a sus cultistas a por ti."
        }
      ]
    },
    trastolillos: {
      nombre: "Trastolillos",
      beneficios: [
        {
          clave: "comunionNaturaleza", nombre: "En comunión con la naturaleza", icono: "fa-leaf",
          texto: "Tienes facilidad para obtener información en espacios naturales, como los recursos de la zona, los peligros que pueden habitar o si ha ocurrido algo inusual."
        },
        {
          clave: "queMeDaAlgo", aMano: true, nombre: "Que me da algo", icono: "fa-person-running",
          texto: "En el momento en que te quedes a la mitad de tus puntos de vida o menos, puedes moverte hasta la mitad de tu movimiento sin generar reacciones.",
          auto: "La ficha indica cuándo está activo (Salud actual ≤ mitad de la Salud Máx.)."
        }
      ],
      desventajas: [
        {
          clave: "necesitoUnMapa", nombre: "Necesito un mapa", icono: "fa-map",
          texto: "Los trastolillos son propensos a perderse: sin las herramientas adecuadas, como mapas, una brújula o indicaciones, se pierden."
        }
      ]
    },
    sierpes: {
      nombre: "Sierpes",
      bonificadores: { defensa: 1 },
      beneficios: [
        {
          clave: "tradicionAlquimica", aMano: true, nombre: "Tradición alquímica", icono: "fa-flask",
          texto: "Una vez al día las sierpes son capaces de confeccionar un ungüento o poción con los materiales que encuentren cerca, que deberán usar inmediatamente en sí mismas o en una criatura voluntaria. Este curará tantos puntos de vida como el nivel de la sierpe.",
          auto: "Botón en la ficha: cura tantos puntos como tu nivel a ti o al objetivo marcado; se recarga con un descanso cómodo."
        },
        {
          clave: "armaduraNatural", nombre: "Armadura natural", icono: "fa-shield-halved",
          texto: "Las sierpes tienen una piel dura reforzada con escamas: obtienen +1 a la defensa base.",
          auto: "+1 a la Defensa (ya incluido en la Defensa Total)."
        }
      ],
      desventajas: [
        {
          clave: "sangreFria", aMano: true, nombre: "Sangre fría", icono: "fa-temperature-half",
          texto: "El cuerpo de las sierpes es especialmente sensible a los cambios de temperatura. En entornos muy fríos o muy cálidos tienen problemas si no se protegen adecuadamente. Siempre que la sierpe esté sufriendo por la exposición a los elementos, verá su mano máxima reducida a la mitad.",
          auto: "Interruptor «Expuesta a los elementos» en la ficha: Mano Máx. a la mitad mientras esté activo."
        }
      ]
    }
  },

  /**
   * Clases Base del sistema (v0.8.4).
   * El Asistente de Creación de Personaje usa esta configuración para ofrecer
   * la elección de Clase y Trinket inicial, y para generar el Mazo de Juego:
   * - `atributo`: característica asociada a la clase (null en Tabula Rasa).
   * - `paloPrincipal`: palo que recibe +3 cartas d4 extra y 1 carta d8 (null en Tabula Rasa,
   *   en cuyo caso el Mazo de Acción queda vacío para personalización manual).
   * - `avanzada`: si es true, requiere confirmación explícita (no recomendada a novatos).
   * - `trinkets`: nombres de Trinkets ofrecidos al crear el personaje.
   * - `progresion` (v0.10.0): recompensas por nivel alcanzado, `{ <nivelDestino>: { habilidades, packs } }`.
   *   · `habilidades`: lista de `{ nombre, esAtaque }`; el jugador elige UNA y se crea como
   *     Item `habilidad` (origen "clase") en el Actor.
   *   · `packs`: lista de packs de cartas; el jugador elige UNO y sus cartas `{ palo, numero }`
   *     (numero 1 = d4, 2 = d6...) se añaden al Mazo de Juego con nombre místico.
   *   Sin entrada para el nivel siguiente → la subida de nivel no está disponible.
   */
  CLASES_BASE: {
    fortisCorpore: {
      nombre: "Fortis Corpore",
      atributo: "fisico",
      paloPrincipal: "espadas",
      trinkets: ["Espada", "Escudo", "Daga"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Potenciación", esAtaque: false },
            { nombre: "Baluarte", esAtaque: false },
            { nombre: "Paso de las sombras", esAtaque: false }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "espadas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "espadas", numero: 2 }]
          ]
        }
      }
    },
    mendaciumCharisma: {
      nombre: "Mendacium Charisma",
      atributo: "social",
      paloPrincipal: "oros",
      trinkets: ["Empatía", "Compañero Eterno", "Amistad"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Sanación", esAtaque: false },
            { nombre: "Promesa", esAtaque: false },
            { nombre: "Limpieza", esAtaque: false }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "oros", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "oros", numero: 2 }]
          ]
        }
      }
    },
    altaScentia: {
      nombre: "Alta Scentia",
      atributo: "consciencia",
      paloPrincipal: "bastos",
      trinkets: ["Elementalismo", "Visión del futuro", "Artilugio de primera"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Manifestar arma", esAtaque: false },
            { nombre: "Tiempo embotellado", esAtaque: false },
            { nombre: "Descarga elemental (hielo)", esAtaque: true },
            { nombre: "Descarga elemental (rayo)", esAtaque: true },
            { nombre: "Descarga elemental (fuego)", esAtaque: true }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "bastos", numero: 2 }],
            [{ palo: "espadas", numero: 1 }, { palo: "bastos", numero: 2 }]
          ]
        }
      }
    },
    potensMystica: {
      nombre: "Potens Mystica",
      atributo: "misticismo",
      paloPrincipal: "copas",
      trinkets: ["Ojo por ojo", "Preservación espiritual", "Barrera espiritual"],
      progresion: {
        2: {
          habilidades: [
            { nombre: "Mal de ojo", esAtaque: true },
            { nombre: "Sellar destino", esAtaque: false },
            { nombre: "Flagelar esencia", esAtaque: true }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "oros", numero: 1 }, { palo: "copas", numero: 2 }]
          ]
        }
      }
    },
    tabulaRasa: {
      nombre: "Tabula Rasa",
      atributo: null,
      paloPrincipal: null,
      avanzada: true,
      trinkets: ["Vasija vacía"]
    }
  }
};

/**
 * Devuelve la abreviatura corta de un palo para mostrarla en chat, fichas y diálogos.
 * @param {string} clavePalo - Clave interna del palo ("espadas", "bastos", "oros", "copas").
 * @returns {string} "FISC", "CONS", "SOC" o "MIST" (o la clave en mayúsculas si es desconocida).
 */
/**
 * Resuelve la clave de `SISTEMA_CONFIG.CLASES_BASE` de un Item de Clase (v0.10.0).
 * Usa `system.claveClase`; para personajes anteriores a v0.10.0 (sin clave guardada)
 * la deduce comparando el nombre del Item con `CLASES_BASE.<clave>.nombre`.
 * @param {Item|null} itemClase - Item de tipo "clase" del Actor.
 * @returns {string|null} Clave de la clase base o null si no corresponde a ninguna.
 */
export function claveClaseDeItem(itemClase) {
  if (!itemClase) return null;
  const clases = SISTEMA_CONFIG.CLASES_BASE;
  const guardada = itemClase.system?.claveClase;
  if (guardada && clases[guardada]) return guardada;
  const nombre = String(itemClase.name ?? "").trim().toLowerCase();
  return Object.keys(clases).find(k => clases[k].nombre.toLowerCase() === nombre) ?? null;
}

/**
 * Describe un pack de cartas de progresión en texto plano (v0.10.0),
 * p. ej. "1× SOC d4 + 1× FISC d6". Apto para labels de `DialogV2` y chat.
 * @param {Array<{palo: string, numero: number}>} pack - Cartas del pack.
 * @returns {string} Descripción legible del pack.
 */
export function describirPackCartas(pack) {
  const conteo = new Map();
  for (const { palo, numero } of pack ?? []) {
    const etiqueta = `${abreviadoPalo(palo)} ${SISTEMA_CONFIG.dadoPorNumeroCarta[numero] ?? "?"}`;
    conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1);
  }
  return [...conteo].map(([etiqueta, n]) => `${n}× ${etiqueta}`).join(" + ");
}

/**
 * Calcula el estado de Agotamiento de un nivel dado (v0.12.0).
 * @param {number} valor - Puntos de Agotamiento (`system.cansancio.value`).
 * @returns {{nivel: number, maximo: number, efectos: Object<string, boolean>, activos: Object[], muerto: boolean}}
 *   `efectos.<clave>` es true si el nivel de esa consecuencia está alcanzado; `activos` lista
 *   las entradas de `AGOTAMIENTO_NIVELES` en vigor.
 */
export function estadoAgotamiento(valor) {
  const maximo = SISTEMA_CONFIG.AGOTAMIENTO_MAXIMO;
  const nivel = Math.max(0, Math.min(maximo, Math.floor(Number(valor) || 0)));
  const efectos = {};
  const activos = [];
  for (const entrada of SISTEMA_CONFIG.AGOTAMIENTO_NIVELES) {
    efectos[entrada.clave] = nivel >= entrada.nivel;
    if (efectos[entrada.clave]) activos.push(entrada);
  }
  return { nivel, maximo, efectos, activos, muerto: efectos.muerte };
}

/**
 * Lista de niveles de Agotamiento lista para plantillas, marcando los activos.
 * @param {number} valor - Puntos de Agotamiento actuales.
 * @returns {Array<{nivel: number, icono: string, texto: string, activo: boolean}>}
 */
export function tablaAgotamiento(valor) {
  const { nivel } = estadoAgotamiento(valor);
  return SISTEMA_CONFIG.AGOTAMIENTO_NIVELES.map(e => ({ ...e, activo: nivel >= e.nivel }));
}

/**
 * Contexto de la barra de Salud de las fichas de PJ y PNJ (v0.13.1).
 * Se pinta con un `<meter>` (sin estilos en línea); el color lo da la clase `estado`:
 * - `cyd-salud-alta`: más del 50 % de la Salud Máx.
 * - `cyd-salud-media` (naranja): 50 % o menos.
 * - `cyd-salud-baja` (rojo): menos del 25 %.
 * @param {number} valor - Salud actual (`system.salud.value`).
 * @param {number} maximo - Salud Máx. total (`system.salud.maxTotal`).
 * @returns {{valor: number, maximo: number, porcentaje: number, estado: string}}
 */
export function contextoBarraSalud(valor, maximo) {
  const max = Math.max(1, Number(maximo) || 1);
  const actual = Math.clamp(Number(valor) || 0, 0, max);
  const porcentaje = Math.round((actual / max) * 100);
  let estado = "cyd-salud-alta";
  if (porcentaje < 25) estado = "cyd-salud-baja";
  else if (porcentaje <= 50) estado = "cyd-salud-media";
  return { valor: actual, maximo: max, porcentaje, estado };
}

/**
 * Datos de Agotamiento para las fichas de Actor (v0.12.0).
 * @param {number} valor - Puntos de Agotamiento actuales (`system.cansancio.value`).
 * @returns {{nivel: number, maximo: number, muerto: boolean, activos: Object[], segmentos: Object[], tooltipHtml: string}}
 *   `segmentos` alimenta la barra de la ficha; `activos` son las consecuencias en vigor; `tooltipHtml` es la tabla completa con las activas marcadas.
 */
export function contextoAgotamiento(valor) {
  const { nivel, maximo, muerto } = estadoAgotamiento(valor);
  const tabla = tablaAgotamiento(nivel);
  const filas = tabla
    .map(e => `<p class='${e.activo ? "cyd-agot-activo" : "cyd-agot-inactivo"}'><strong>${e.nivel}.</strong> ${e.texto}</p>`)
    .join("");
  const tooltipHtml = `<div class='cyd-tooltip-contenido'><strong>Agotamiento ${nivel}/${maximo}</strong> <em>(acumulativo)</em><hr/>${filas}<hr/><p>+1 al agotar el Mazo y barajar el Descarte. −1 por descanso cómodo y seguro (máx. 1 por día).</p></div>`;
  // Segmentos de la barra (uno por nivel, 1..maximo); `activo` = nivel alcanzado.
  const segmentos = tabla.map(e => ({ nivel: e.nivel, texto: e.texto, activo: e.activo, esMuerte: e.nivel === maximo }));
  return { nivel, maximo, muerto, activos: tabla.filter(e => e.activo), segmentos, tooltipHtml };
}

/**
 * Devuelve la configuración de la raza base de un Actor (v0.13.0) a partir de su Item `raza`
 * (`system.claveRaza`; respaldo por nombre para razas creadas sin clave).
 * @param {Actor|null} actor - Actor (PJ o PNJ).
 * @returns {{clave: string, config: object}|null} null si no tiene raza base reconocida.
 */
export function razaBaseDeActor(actor) {
  return razaBaseDeItem(actor?.items?.find?.(i => i.type === "raza") ?? null);
}

/**
 * Devuelve la configuración de raza base de un Item `raza` (v0.13.0): por `system.claveRaza`
 * o, si falta, por nombre (razas creadas a mano con el nombre de una raza base).
 * @param {Item|null} itemRaza
 * @returns {{clave: string, config: object}|null}
 */
export function razaBaseDeItem(itemRaza) {
  if (!itemRaza || itemRaza.type !== "raza") return null;
  const razas = SISTEMA_CONFIG.RAZAS_BASE;
  let clave = itemRaza.system?.claveRaza || "";
  if (!razas[clave]) {
    const nombre = String(itemRaza.name ?? "").trim().toLowerCase();
    clave = Object.keys(razas).find(k => razas[k].nombre.toLowerCase() === nombre) ?? "";
  }
  return razas[clave] ? { clave, config: razas[clave] } : null;
}

/**
 * Indica si un Actor tiene un rasgo racial concreto (v0.13.0).
 * @param {Actor|null} actor
 * @param {string} claveRasgo - Clave del rasgo (p. ej. "esperaUnMomento").
 * @returns {boolean}
 */
export function tieneRasgoRacial(actor, claveRasgo) {
  const raza = razaBaseDeActor(actor);
  if (!raza) return false;
  return [...(raza.config.beneficios ?? []), ...(raza.config.desventajas ?? [])].some(r => r.clave === claveRasgo);
}

/**
 * Contexto de plantilla de los rasgos raciales de un Actor (v0.13.0), para el panel
 * «Rasgos Raciales» de la ficha y la ficha del Item de Raza.
 * @param {string|null} claveRaza - Clave de `SISTEMA_CONFIG.RAZAS_BASE`.
 * @returns {{clave: string, nombre: string, beneficios: object[], desventajas: object[], sinDesventajas: string, aMano: object[]}|null}
 */
export function contextoRasgosRaza(claveRaza) {
  const config = claveRaza ? SISTEMA_CONFIG.RAZAS_BASE[claveRaza] : null;
  if (!config) return null;
  return {
    clave: claveRaza,
    nombre: config.nombre,
    beneficios: config.beneficios ?? [],
    desventajas: config.desventajas ?? [],
    sinDesventajas: config.sinDesventajas ?? "",
    // (v0.13.1) Rasgos con control o estado en juego, para la pestaña Principal de la ficha.
    aMano: [
      ...(config.beneficios ?? []).filter(r => r.aMano).map(r => ({ ...r, esDesventaja: false })),
      ...(config.desventajas ?? []).filter(r => r.aMano).map(r => ({ ...r, esDesventaja: true }))
    ]
  };
}

export function abreviadoPalo(clavePalo) {
  return SISTEMA_CONFIG.palosCartas[clavePalo]?.abreviado
    ?? String(clavePalo ?? "").toUpperCase();
}

/**
 * Limpia un nombre de carta eliminando cualquier prefijo o aparición residual de
 * "Unknown" (case-insensitive). Devuelve string vacío si no hay nombre válido.
 * @param {string} nombreRaw - Nombre crudo de la carta (puede ser undefined).
 * @returns {string} Nombre limpio sin "Unknown", o string vacío si no hay nombre.
 */
export function limpiarNombreCarta(nombreRaw) {
  if (typeof nombreRaw !== "string") return "";
  return String(nombreRaw)
    .replace(/^unknown\s*[:\-–—]?\s*/i, "")
    .replace(/^unknown$/i, "")
    .replace(/\s*unknown\s*/gi, " ")
    .trim();
}

/**
 * Genera un nombre único que no colisione con ninguno de los nombres existentes.
 * Si `base` ya está en uso, añade un sufijo numérico incremental ("Base 2", "Base 3"...).
 * Se usa al crear Trinkets y Cartas para que cada uno nazca con un nombre
 * personalizado y diferenciable (v0.8.4).
 * @param {Iterable<string>} nombresExistentes - Nombres ya presentes en la pila destino.
 * @param {string} base - Nombre base deseado (ej. "Nuevo Trinket").
 * @returns {string} Nombre garantizado como único dentro de la colección.
 */
export function generarNombreUnico(nombresExistentes, base) {
  const raizLimpia = limpiarNombreCarta(base) || "Carta";
  const usados = new Set(
    // Comparación case-insensitive: se normaliza todo a minúsculas
    [...(nombresExistentes ?? [])].map(n => limpiarNombreCarta(n).toLowerCase())
  );
  if (!usados.has(raizLimpia.toLowerCase())) return raizLimpia;
  let i = 2;
  while (usados.has(`${raizLimpia} ${i}`.toLowerCase())) i++;
  return `${raizLimpia} ${i}`;
}

/**
 * Sílabas iniciales y finales combinables para generar vocablos arcanos/místicos
 * sin significado real, usadas por el generador de nombres de cartas iniciales (v0.8.4).
 * @type {string[]}
 */
const SILABAS_INICIALES_MISTICAS = ["Ael", "Vyr", "Kael", "Zor", "Nyx", "Thal", "Orym", "Syr", "Vael", "Lir", "Drak", "Morn"];
const SILABAS_FINALES_MISTICAS = ["ith", "os", "ar", "en", "ul", "ia", "on", "is", "um", "esh"];

/**
 * Genera un nombre místico único y sin significado real (ej. "Kaelith", "VyrOS")
 * combinando sílabas arcanas, garantizando que no colisione con ninguno de los
 * nombres ya usados. Se emplea para bautizar las 12 Cartas de Acción iniciales
 * que el Asistente de Clase genera en el Mazo de Juego (v0.8.4).
 * @param {Iterable<string>} usados - Nombres ya empleados (se comparan en minúsculas).
 * @returns {string} Nombre místico garantizado como único.
 */
export function generarNombreMisticoUnico(usados) {
  const conjuntoUsados = new Set([...(usados ?? [])].map(n => String(n).toLowerCase()));

  let nombre = "";
  for (let intento = 0; intento < 500; intento++) {
    const inicial = SILABAS_INICIALES_MISTICAS[Math.floor(Math.random() * SILABAS_INICIALES_MISTICAS.length)];
    const final = SILABAS_FINALES_MISTICAS[Math.floor(Math.random() * SILABAS_FINALES_MISTICAS.length)];
    nombre = `${inicial}${final}`;
    if (!conjuntoUsados.has(nombre.toLowerCase())) return nombre;
  }

  // Fallback por improbable agotamiento aleatorio: sufijo numérico incremental
  let i = 2;
  while (conjuntoUsados.has(`${nombre} ${i}`.toLowerCase())) i++;
  return `${nombre} ${i}`;
}

/**
 * Devuelve siempre un nombre visible, identificativo y reconocible para una carta.
 * Si la carta tiene nombre propio lo devuelve limpio; en caso contrario (nombre
 * vacío, ausente o que contenga "Unknown") construye un identificador descriptivo:
 * "Trinket Nv. X" para Trinkets (v0.8.4, sin palo ni dado) o tipo + palo + dado
 * para Cartas de Acción, para que jamás se muestre un genérico tipo "Unknown".
 * @param {object} carta - Documento Card o datos con `name`, `type` y `system`.
 * @returns {string} Nombre garantizado no vacío y reconocible.
 */
export function nombreVisibleCarta(carta) {
  if (!carta) return "Carta (?)";
  const nombreLimpio = limpiarNombreCarta(carta?.name)
    || limpiarNombreCarta(carta?._source?.name)
    || limpiarNombreCarta(carta?.faces?.[0]?.name);
  if (nombreLimpio) return nombreLimpio;
  // Fallback de Trinkets sin nombre válido: identificador por Nivel (sin palo ni dado, v0.8.4)
  if (carta.type === "trinket") {
    const nivel = Number(carta?.system?.nivel) || 1;
    return `Trinket Nv. ${nivel}`;
  }
  const palo = abreviadoPalo(carta?.system?.palo) || "?";
  const numero = Number(carta?.system?.numero) || "?";
  const dado = SISTEMA_CONFIG.dadoPorNumeroCarta?.[numero] ?? "?";
  return `Carta ${palo}${numero} (${dado})`;
}
