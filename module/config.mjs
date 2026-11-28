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
    { nivel: 6, clave: "tiradasMitad", icono: "fa-dice-d20", texto: "El resultado de todas tus tiradas se reduce a la mitad, redondeando hacia arriba (un resultado negativo no se reduce)." },
    { nivel: 7, clave: "quemarAlUsar", icono: "fa-fire", texto: "Cada vez que uses una carta, quémala en vez de descartarla." },
    { nivel: 8, clave: "muerte", icono: "fa-skull", texto: "Mueres." }
  ],

  /** Nivel de Agotamiento que provoca la muerte (y máximo de la escala). */
  AGOTAMIENTO_MAXIMO: 8,

  /**
   * Catálogo de acciones (v0.14.0). Es una guía, no una lista cerrada: la acción `libre`
   * («Otra acción») cubre todo lo que acuerde la mesa con cualquier carta.
   * Cada entrada:
   * - `nombre`, `icono` (Font Awesome), `texto` (guía en texto plano).
   * - `caracteristicas`: claves de característica cuyas cartas pueden realizarla.
   * - `resolucion`: cómo se resuelve por defecto (el diálogo permite cambiarla):
   *   `ataque` (contra la Defensa del objetivo), `dificultad` (contra la Dificultad del Master),
   *   `enfrentada` (el Master la compara con la tirada rival), `puntoDebil` (contra la Defensa
   *   del objetivo, sin daño), `ayuda` (suma a la tirada de un aliado), `segunCarta` (ataque si
   *   la carta está marcada como ataque; si no, Dificultad) o `sinTirada` (efecto fijo).
   * - `reaccion` (opcional): se marca como reacción por defecto.
   * - `adicional` (opcional): puede realizarse además del resto de acciones.
   * - `abalorio` (opcional, v0.15.0): solo se ofrece si ese abalorio está En Juego
   *   (`SistemaActor#abaloriosActivos`).
   * - `reaccionAdicional` (opcional, v0.15.0): reacción que no gasta ni exige la reacción del turno
   *   (el Agotamiento 4 la sigue bloqueando).
   * - `mitadAtributos` (opcional, v0.15.0): tira con la mitad de los dados de la característica
   *   (redondeo hacia arriba), p. ej. el compañero del abalorio Compañero eterno.
   * - `sinReaccion` (opcional, v0.15.0): no puede realizarse como reacción (salvo excepción).
   * Las Habilidades (MIST) no están aquí: el diálogo las lista desde los Items del Actor.
   */
  ACCIONES: {
    ataqueArma: {
      nombre: "Ataque con arma", icono: "fa-khanda", caracteristicas: ["fisico"], resolucion: "ataque",
      texto: "Usas el arma que tengas disponible para atacar a un enemigo."
    },
    defensa: {
      nombre: "Defensa", icono: "fa-shield-halved", caracteristicas: ["fisico"], resolucion: "enfrentada", reaccion: true,
      texto: "Esquivas, paras o desvías un ataque para reducir o negar su daño (reacción)."
    },
    agarre: {
      nombre: "Agarre", icono: "fa-hands-holding", caracteristicas: ["fisico"], resolucion: "dificultad",
      texto: "Agarras a tu objetivo: le cuesta moverse y actuar físicamente; debes mantener el agarre."
    },
    desarmar: {
      nombre: "Desarmar", icono: "fa-hand-back-fist", caracteristicas: ["fisico"], resolucion: "dificultad",
      texto: "Intentas dejar a tu oponente sin su arma."
    },
    correr: {
      nombre: "Correr", icono: "fa-person-running", caracteristicas: ["fisico"], resolucion: "sinTirada",
      texto: "Te esfuerzas para moverte más lejos en el mismo tiempo: duplicas tu movimiento."
    },
    magiaComun: {
      nombre: "Magia común", icono: "fa-hat-wizard", caracteristicas: ["consciencia"], resolucion: "segunCarta",
      texto: "Usas tu magia para producir un efecto (ataque, defensa...) dentro de tus limitaciones."
    },
    activarArtefacto: {
      nombre: "Activar artefacto", icono: "fa-ring", caracteristicas: ["consciencia"], resolucion: "dificultad",
      texto: "Activas un artilugio mágico de poder usando tu entendimiento de su funcionamiento."
    },
    identificarPuntoDebil: {
      nombre: "Identificar punto débil", icono: "fa-magnifying-glass", caracteristicas: ["consciencia", "social"],
      resolucion: "puntoDebil", adicional: true,
      texto: "Lo descubres si tu resultado supera la Defensa del objetivo. Es una acción adicional."
    },
    ayudar: {
      nombre: "Ayudar", icono: "fa-handshake-angle", caracteristicas: ["social"], resolucion: "ayuda",
      texto: "Sumas tu resultado a la tirada de un aliado. Solo una ayuda por acción."
    },
    levantar: {
      nombre: "Levantar", icono: "fa-hand-holding-heart", caracteristicas: ["social"], resolucion: "dificultad",
      texto: "Ayudas a un compañero que sufre un estado alterado (levantarlo, socorrerlo...)."
    },
    defenderAliado: {
      nombre: "Defender a un aliado (Escudo)", icono: "fa-shield-halved", caracteristicas: ["consciencia"],
      resolucion: "enfrentada", reaccion: true, reaccionAdicional: true, abalorio: "escudo",
      texto: "Abalorio Escudo: como reacción adicional (no gasta tu reacción) defiendes a un aliado que se encuentre dentro de tu rango."
    },
    accionCompanero: {
      nombre: "Acción del compañero", icono: "fa-paw", caracteristicas: ["fisico", "consciencia", "social", "misticismo"],
      resolucion: "segunCarta", abalorio: "companero", mitadAtributos: true, sinReaccion: true,
      texto: "Abalorio Compañero eterno: tu compañero realiza una tarea sencilla con esta carta. Tira con la mitad de tus dados (redondeo hacia arriba) y no puede reaccionar."
    },
    libre: {
      nombre: "Otra acción", icono: "fa-comments", caracteristicas: ["fisico", "consciencia", "social", "misticismo"],
      resolucion: "segunCarta",
      texto: "Cualquier otra acción acordada con la mesa y aprobada por el Master."
    }
  },

  /**
   * Resoluciones que el diálogo de acción permite forzar (excepciones acordadas en la mesa).
   * `auto` usa la resolución de la acción elegida.
   */
  RESOLUCIONES_ACCION: {
    auto: "Según la acción",
    ataque: "Ataque contra la Defensa del objetivo",
    dificultad: "Contra la Dificultad del Master",
    enfrentada: "Tirada enfrentada (la compara el Master)",
    puntoDebil: "Contra la Defensa, sin daño (punto débil)",
    ayuda: "Ayuda: sumar a la tirada de un aliado",
    sinResolucion: "Solo tirar, sin resolución",
    sinTirada: "Sin tirada (efecto directo)"
  },

  /** Icono canónico de cada característica (ver `docs-ia/estilos.md`). */
  ICONOS_CARACTERISTICA: {
    fisico: "fa-hand-fist",
    consciencia: "fa-eye",
    social: "fa-masks-theater",
    misticismo: "fa-moon"
  },

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
   * - `trinkets`: Trinkets (abalorios) ofrecidos al crear el personaje. Cada entrada es un nombre
   *   (texto) o, desde v0.15.0, un abalorio `{ clave, nombre, icono, texto, auto? }`: `clave` se guarda
   *   en `flags.cartas-y-dados.abalorio` del Trinket y activa su efecto mientras está En Juego
   *   (`SistemaActor#abaloriosActivos`); `texto` se copia a `efectoPermanente`. Normalizar con
   *   `opcionesTrinketsClase()`. `eterno: true` (v0.15.0, Abalorio Eterno): solo puede estar En Juego
   *   o Quemado (ver `SistemaActor#_destinoAbalorioEterno`). `artilugios` (v0.16.0, Artilugio de primera):
   *   claves de `ARTILUGIOS` entre las que se elige el objeto mágico asociado (cambiable al subir de nivel).
   * - `tablaElecciones` (opcional, v0.15.0): resumen por nivel en texto plano `{ nivel, beneficios }`
   *   (se muestra en la ficha del Item de Clase).
   * - `progresion` (v0.10.0): recompensas por nivel alcanzado,
   *   `{ <nivelDestino>: { habilidades?, packs?, especializaciones? } }`. Cada lista es opcional; si
   *   existe, el jugador elige UNA opción de ella al subir.
   *   · `habilidades`: `{ nombre, esAtaque, texto?, valorX?, sinAccion? }`; se crea como Item
   *     `habilidad` (origen "clase"). `texto` → descripción; `valorX` → la tirada MIST fija el valor X
   *     (sin Dificultad); `sinAccion` → usarla no gasta acción (v0.15.0); `efectoX` (v0.15.0) →
   *     automatización del valor X sobre el Token objetivo (`curacion` o `promesa`), guardada en
   *     `flags.cartas-y-dados.efectoX` del Item (v0.16.0: también `manifestarArma` y `tiempoEmbotellado`);
   *     `elemento` (v0.16.0, Descarga elemental) → clave de `ELEMENTOS`, guardada en
   *     `flags.cartas-y-dados.elemento`: potenciar con cartas CONS y aplicar el estado alterado.
   *   · `packs`: lista de packs de cartas; sus cartas `{ palo, numero }` (numero 1 = d4, 2 = d6...)
   *     se añaden al Mazo de Juego con nombre místico.
   *   · `especializaciones` (v0.15.0): `{ clave, nombre, texto, tablaElecciones?, progresion? }`; se guarda
   *     en `system.especializacion` del Item de Clase y se crea como Habilidad pasiva. (v0.18.0) Su
   *     `progresion` (mismo formato, desde el nivel en que se elige) se suma a la de la clase.
   *   · (v0.18.0) `caracteristica: true` → +1 a la característica base elegida; `manoMaxima: N` → +N
   *     al bonificador `limiteMano` del Item de Clase; `abalorios` (formato de `trinkets`) → se elige
   *     uno y se crea como Trinket en el Mazo de Trinkets; `pasivas: [{clave, nombre, texto}]` → se
   *     crean como Habilidades pasivas; `pendientes: [texto]` → beneficios aún sin definir (los aplica el Master).
   *   Sin entrada para el nivel siguiente → la subida de nivel no está disponible.
   */
  /**
   * Elementos de las Descargas elementales y del abalorio Elementalismo (v0.16.0). `estado` es el id
   * del estado alterado de Foundry (`CONFIG.statusEffects`) que la Descarga aplica siempre al objetivo;
   * `nombreEstado` es el texto de respaldo si el estado no existe en el mundo.
   */
  ELEMENTOS: {
    fuego: { nombre: "Fuego", icono: "fa-fire", estado: "burning", nombreEstado: "Ardiendo" },
    hielo: { nombre: "Hielo", icono: "fa-snowflake", estado: "frozen", nombreEstado: "Congelado" },
    rayo: { nombre: "Rayo", icono: "fa-bolt-lightning", estado: "shock", nombreEstado: "Electrocutado" }
  },

  /**
   * Objetos mágicos del abalorio «Artilugio de primera» de Alta Scentia (v0.16.0). La clave elegida se
   * guarda en `flags.cartas-y-dados.artilugio` del Trinket; `auto` describe lo automatizado.
   */
  ARTILUGIOS: {
    monoculo: {
      nombre: "Monóculo indiscreto", icono: "fa-magnifying-glass",
      texto: "Un artilugio perfecto para los más cotillas, permite revelar cosas de los demás que quizás no están dispuestos a revelar: con este puedes mirar dentro de los bolsillos y bolsas de los que te rodean. Además puedes ver la carta superior (sin revelarla) de tus aliados y enemigos.",
      auto: "Botón «Monóculo» en la ficha: te muestra en privado la carta superior del Mazo del Token objetivo (T)."
    },
    botas: {
      nombre: "Botas de gato", icono: "fa-shoe-prints",
      texto: "Tan cómodas como útiles, las botas de gato reducen a la mitad el daño que recibes al caer y no haces ruido al caminar.",
      auto: ""
    },
    agujero: {
      nombre: "Agujero portátil", icono: "fa-circle-dot",
      texto: "La bolsa que nunca se acaba, un bolsillo que realmente puede guardar todo lo que quieras meter. (ADVERTENCIA: No guardar criaturas vivas u otros agujeros portátiles. Ningún proveedor de artilugios mágicos o baratijas se hace responsable de un uso indebido; para más información consulte los «Términos y Condiciones de Uso» proporcionados por AdTifacto S.A.)",
      auto: ""
    }
  },

  CLASES_BASE: {
    fortisCorpore: {
      nombre: "Fortis Corpore",
      atributo: "fisico",
      paloPrincipal: "espadas",
      tablaElecciones: [
        { nivel: 1, beneficios: "Mazo Inicial (Físico) · Elección de abalorio" },
        { nivel: 2, beneficios: "Elección de habilidad · Elección de cartas" },
        { nivel: 3, beneficios: "Elección de especialización (Custodio) · beneficios de la especialización" }
      ],
      trinkets: [
        {
          clave: "espada", nombre: "Espada", icono: "fa-khanda",
          texto: "Puedes usar las cartas de consciencia como si fueran cartas de físico.",
          auto: "En Juego: el diálogo de acción de una carta CONS ofrece las acciones de FISC y tira con Físico; en el Ataque apuntado combina FISC y CONS (ambas tiran con Físico)."
        },
        {
          clave: "escudo", nombre: "Escudo", icono: "fa-shield-halved",
          texto: "Como reacción adicional (no gastas tu reacción si usas esta) puedes usar una carta de consciencia para defender a un aliado que se encuentre dentro de tu rango.",
          auto: "En Juego: acción «Defender a un aliado (Escudo)» para cartas CONS; es una reacción que no gasta tu reacción del turno."
        },
        {
          clave: "daga", nombre: "Daga", icono: "fa-bullseye",
          texto: "Puedes usar una carta de consciencia con una carta de físico para hacer un ataque apuntado, en vez de usar dos cartas de físico.",
          auto: "En Juego: el Ataque apuntado admite una carta CONS junto a una FISC (cada una tira con su característica)."
        }
      ],
      progresion: {
        2: {
          habilidades: [
            {
              nombre: "Potenciación", esAtaque: false, valorX: true,
              texto: "Durante X turnos, ganas 1 más a la característica de tu elección. (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Baluarte", esAtaque: false, valorX: true,
              texto: "Mitigas X puntos de daño de cualquier ataque a todos tus aliados que puedas ver. (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Paso de las sombras", esAtaque: false, valorX: true, sinAccion: true,
              texto: "Te fundes con las sombras del entorno y apareces en las sombras de tu elección a X metros de distancia. Usar esta habilidad no gasta acción. (X es el resultado de la tirada de misticismo)"
            }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "espadas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "espadas", numero: 2 }]
          ]
        },
        3: {
          especializaciones: [
            {
              // (v0.18.0) Custodio: progresión propia de Nv. 3 a 6 (se suma a la de la clase).
              clave: "custodio", nombre: "Custodio",
              texto: "Especialización de Fortis Corpore: el guardián que protege a sus aliados a costa de sí mismo.",
              tablaElecciones: [
                { nivel: 3, beneficios: "Elección de característica · +1 Mano Máxima · Elección de abalorio · Siempre presente" },
                { nivel: 4, beneficios: "Elección de habilidad · Elección de cartas" },
                { nivel: 5, beneficios: "Elección de habilidad (pendiente de definir) · Elección de característica" },
                { nivel: 6, beneficios: "Elección de abalorio (pendiente de definir) · +1 Mano Máxima" }
              ],
              progresion: {
                3: {
                  caracteristica: true,
                  manoMaxima: 1,
                  abalorios: [
                    {
                      clave: "ultimoAliento", nombre: "Último aliento", icono: "fa-heart-crack",
                      texto: "Si fueras a caer en combate por daño, en vez de eso, quema este abalorio, sin perder la vida que fueras a perder.",
                      auto: "En Juego: si el daño aplicado por el Master te dejaría a 0 de Salud, se ofrece quemar el abalorio y no perder la vida."
                    },
                    {
                      clave: "martir", nombre: "Mártir", icono: "fa-hand-holding-heart",
                      texto: "Reduce el daño que reciben todos tus aliados en tu rango de visión a la mitad, pero duplicas el daño que recibes tú de todas las fuentes de daño. Puedes usar una carta de consciencia para quemar este abalorio como reacción gratuíta después de recibir daño.",
                      auto: "En Juego: el daño que te aplica el Master se duplica; el de cada aliado (PJ) se reduce a la mitad (↑) si el Master confirma que está en tu rango de visión. Tras recibir daño, botón en el chat para quemarlo usando una carta CONS de tu mano."
                    },
                    {
                      clave: "corazonEspinas", nombre: "Corazón de espinas", icono: "fa-seedling",
                      texto: "Siempre que recibas daño de una criatura que se encuentre a distancia de cuerpo a cuerpo, esta recibirá daño igual a tu puntuación de físico.",
                      auto: "En Juego: al recibir daño de un ataque, el Master tiene un botón para aplicar al atacante tanto daño como tu Físico total (si estaba cuerpo a cuerpo)."
                    }
                  ],
                  pasivas: [
                    {
                      clave: "siemprePresente", nombre: "Siempre presente",
                      texto: "Tienes una intuición excepcional para saber si tus aliados o personas que te importan están en peligro. Incluso en algunas ocasiones siendo capaz de predecir que algo malo le va a pasar a un aliado antes de que suceda... aunque la mayoría de veces no sepas realmente de que se trata."
                    }
                  ]
                },
                4: {
                  habilidades: [
                    {
                      nombre: "Muro de voluntad", esAtaque: false, valorX: true, efectoX: "muroVoluntad",
                      texto: "Levantas un bastión de pura voluntad para proteger una zona, ninguna criatura o ataque que tu elijas puede pasar mientras mantengas la concentración, el muro tiene una cantidad de vida igual a 3 * X (donde X es el resultado de la tirada de misticismo)."
                    },
                    {
                      nombre: "Corazón del dragón", esAtaque: false, valorX: true, efectoX: "corazonDragon",
                      texto: "Durante los siguientes X turnos (donde X es el resultado de la tirada de misticismo), solo puedes recibir 1 de daño como máximo. Siempre que recibas daño ganas un punto de agotamiento."
                    },
                    {
                      nombre: "Rencor", esAtaque: false, valorX: true, efectoX: "rencor",
                      texto: "Si acabas de mitigar por completo el daño (te han hecho un ataque pero no has recibido daño) de un enemigo, puedes devolverle esa cantidad de daño más la tirada de misticismo."
                    }
                  ],
                  packs: [
                    [{ palo: "oros", numero: 2 }, { palo: "espadas", numero: 3 }],
                    [{ palo: "bastos", numero: 2 }, { palo: "espadas", numero: 3 }]
                  ]
                },
                5: {
                  caracteristica: true,
                  pendientes: ["Elección de habilidad"]
                },
                6: {
                  manoMaxima: 1,
                  pendientes: ["Elección de abalorio"]
                }
              }
            }
          ]
        }
      }
    },
    mendaciumCharisma: {
      nombre: "Mendacium Charisma",
      atributo: "social",
      paloPrincipal: "oros",
      tablaElecciones: [
        { nivel: 1, beneficios: "Mazo Inicial (Social) · Elección de abalorio" },
        { nivel: 2, beneficios: "Elección de habilidad · Elección de cartas" },
        { nivel: 3, beneficios: "Elección de especialización" }
      ],
      trinkets: [
        {
          clave: "empatia", nombre: "Empatía", icono: "fa-heart",
          texto: "Una vez por turno, si un aliado ha quemado una carta, puedes robar una carta de tu mazo.",
          auto: "En Juego: cuando otro personaje quema una carta, recibes en el chat el botón «Robar carta (Empatía)»; en combate, una vez por turno."
        },
        {
          clave: "companero", nombre: "Compañero eterno", icono: "fa-paw", eterno: true,
          texto: "Abalorio Eterno (solo puede estar En Juego o Quemado: si fuera a dejar de estar en juego se quema, y si fuera a salir de las Cartas Quemadas vuelve directamente a estar En Juego). Tienes un compañero, animal, espiritual o imaginario, una criatura menor con poderes limitados que puedes ordenar durante tu turno para realizar pequeñas tareas sencillas. A la hora de realizar una acción usará una carta de tu mano, no dispone de reacciones y tiene los atributos iguales a la mitad de los tuyos (redondeando hacia arriba).",
          auto: "Empieza En Juego. Acción «Acción del compañero» para cualquier carta; tira con la mitad de tus dados (redondeo hacia arriba) y no puede ser una reacción. Eterno: sigue En Juego entre escenas y combates; si se descarta o se quema, va a Quemadas y al descansar vuelve directamente a estar En Juego."
        },
        {
          clave: "amistad", nombre: "Amistad", icono: "fa-handshake",
          texto: "Cuando juegues el abalorio enlazas tu destino al de un aliado. Si juegas la misma característica que ha jugado este aliado en su última acción (aunque no sea la misma acción) puedes lanzar un dado adicional.",
          auto: "Al jugarlo eliges al aliado. En Juego: si tu carta es de la misma característica que la última acción de tu aliado, tiras 1 dado más (también en las Habilidades)."
        }
      ],
      progresion: {
        2: {
          habilidades: [
            {
              nombre: "Sanación", esAtaque: false, valorX: true, efectoX: "curacion",
              texto: "Curas X puntos de vida a un objetivo que puedas tocar, tú no puedes ser el objetivo. (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Promesa", esAtaque: false, valorX: true, efectoX: "promesa",
              texto: "El aliado objetivo mira entre las X primeras cartas de su mazo, elige una carta que quiera, la añade a su mano, luego baraja el mazo. Tú no puedes ser el objetivo. (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Limpieza", esAtaque: false, valorX: true,
              texto: "Eliminas X estados alterados entre los aliados que elijas que puedas ver, tú no puedes hacerte objetivo a ti mismo. (X es el resultado de la tirada de misticismo)"
            }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "oros", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "oros", numero: 2 }]
          ]
        },
        3: {
          especializaciones: [
            {
              clave: "matasanos", nombre: "Matasanos",
              texto: "Especialización de Mendacium Charisma. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            },
            {
              clave: "invocador", nombre: "Invocador",
              texto: "Especialización de Mendacium Charisma. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            }
          ]
        }
      }
    },
    altaScentia: {
      nombre: "Alta Scentia",
      atributo: "consciencia",
      paloPrincipal: "bastos",
      tablaElecciones: [
        { nivel: 1, beneficios: "Mazo Inicial (Consciencia) · Elección de abalorio" },
        { nivel: 2, beneficios: "Elección de habilidad · Elección de cartas" },
        { nivel: 3, beneficios: "Elección de especialización" }
      ],
      trinkets: [
        {
          clave: "elementalismo", nombre: "Elementalismo", icono: "fa-fire-flame-curved",
          texto: "Puedes cambiar el elemento de tus poderes, cambiar el tipo de daño de tus ataques y el tipo de elemento de tus defensas, al que quieras.",
          auto: "En Juego: el diálogo de acción permite elegir el elemento de la acción (se indica en el chat) y la Descarga elemental puede cambiar de elemento (y con él, de estado alterado)."
        },
        {
          clave: "visionFuturo", nombre: "Visión del futuro", icono: "fa-eye",
          texto: "Puedes ver la primera carta de tu mazo en todo momento. Siempre que hagas una tirada usando misticismo o consciencia puedes descartar la primera carta de tu mazo.",
          auto: "En Juego: la ficha muestra la primera carta de tu Mazo (solo a ti y al Master). Tras cada tirada de Consciencia o Misticismo, el chat te ofrece el botón «Descartar la primera carta del Mazo»."
        },
        {
          clave: "artilugio", nombre: "Artilugio de primera", icono: "fa-toolbox", eterno: true,
          texto: "Abalorio Eterno (solo puede estar En Juego o Quemado). Al elegir este abalorio obtienes uno de los siguientes objetos mágicos a tu elección, que queda asociado a tu abalorio; solo podrás cambiarlo una vez cada vez que subas de nivel: Monóculo indiscreto, Botas de gato o Agujero portátil.",
          auto: "Eliges el artilugio al crear el personaje y puedes cambiarlo en cada subida de nivel. Empieza En Juego. Monóculo indiscreto: botón en la ficha para ver en privado la carta superior del Mazo del Token objetivo. Botas de gato y Agujero portátil: narrativos.",
          artilugios: ["monoculo", "botas", "agujero"]
        }
      ],
      progresion: {
        2: {
          habilidades: [
            {
              nombre: "Manifestar arma", esAtaque: false, valorX: true, efectoX: "manifestarArma",
              texto: "Manifiestas un arma, esta puede tener categorías según: Carta d4 = 1 categoría / Carta d6 = 2 categorías / Carta d8 = 3 categorías / Carta d10 = 4 categorías / Carta d12 = 5 categorías (consultar armas para las categorías de armas). Este arma permanece manifestada X turnos. (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Tiempo embotellado", esAtaque: false, valorX: true, efectoX: "tiempoEmbotellado",
              texto: "Realizas la tirada de misticismo y apuntas el resultado de cada dado, puedes sustituir el valor de hasta esa cantidad de dados en cualquier otra tirada. Solo puedes afectar el resultado de los dados."
            },
            {
              nombre: "Descarga elemental (Fuego)", esAtaque: true, elemento: "fuego",
              texto: "Concentras el poder elemental en un ataque dirigido a distancia, del elemento indicado, haces una cantidad de daño igual a la tirada de misticismo y puedes usar tantas cartas de consciencia como tengas en la mano para potenciar este ataque. Siempre aplicas el estado alterado relacionado con este ataque."
            },
            {
              nombre: "Descarga elemental (Hielo)", esAtaque: true, elemento: "hielo",
              texto: "Concentras el poder elemental en un ataque dirigido a distancia, del elemento indicado, haces una cantidad de daño igual a la tirada de misticismo y puedes usar tantas cartas de consciencia como tengas en la mano para potenciar este ataque. Siempre aplicas el estado alterado relacionado con este ataque."
            },
            {
              nombre: "Descarga elemental (Rayo)", esAtaque: true, elemento: "rayo",
              texto: "Concentras el poder elemental en un ataque dirigido a distancia, del elemento indicado, haces una cantidad de daño igual a la tirada de misticismo y puedes usar tantas cartas de consciencia como tengas en la mano para potenciar este ataque. Siempre aplicas el estado alterado relacionado con este ataque."
            }
          ],
          packs: [
            [{ palo: "oros", numero: 1 }, { palo: "bastos", numero: 2 }],
            [{ palo: "espadas", numero: 1 }, { palo: "bastos", numero: 2 }]
          ]
        },
        3: {
          especializaciones: [
            {
              clave: "mecanicista", nombre: "Mecanicista",
              texto: "Especialización de Alta Scentia. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            },
            {
              clave: "adivinador", nombre: "Adivinador",
              texto: "Especialización de Alta Scentia. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            },
            {
              clave: "ilusionista", nombre: "Ilusionista",
              texto: "Especialización de Alta Scentia. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            },
            {
              clave: "elementalista", nombre: "Elementalista",
              texto: "Especialización de Alta Scentia. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            }
          ]
        }
      }
    },
    potensMystica: {
      nombre: "Potens Mystica",
      atributo: "misticismo",
      paloPrincipal: "copas",
      tablaElecciones: [
        { nivel: 1, beneficios: "Mazo Inicial (Misticismo) · Elección de abalorio" },
        { nivel: 2, beneficios: "Elección de habilidad · Elección de cartas" },
        { nivel: 3, beneficios: "Elección de especialización" }
      ],
      // (v0.17.0) El «valor» de una carta son las caras de su dado (d4 = 4 ... d12 = 12): ver `valorCarta`.
      trinkets: [
        {
          clave: "ojoPorOjo", nombre: "Ojo por ojo", icono: "fa-scale-balanced",
          texto: "Siempre que quemes una carta de misticismo, puedes descartar otra carta de tu mano para que todos los enemigos que puedas ver pierdan vida igual al valor de la carta de misticismo.",
          auto: "En Juego: al quemar una carta MIST recibes en el chat el botón «Ojo por ojo»; eliges la carta de la mano que descartas y el Master resta el valor de la carta MIST (caras de su dado) a la Salud de los enemigos marcados con T."
        },
        {
          clave: "preservacion", nombre: "Preservación espiritual", icono: "fa-recycle",
          texto: "Una vez por turno, si quemas una carta de misticismo puedes hacer una tirada de consciencia; si igualas o superas el valor máximo de la carta de misticismo barajas la carta en tu mazo en vez de quemarla.",
          auto: "En Juego: al quemar una carta MIST recibes en el chat el botón «Preservación espiritual»; tiras Consciencia con una carta CONS de la mano y, si igualas o superas las caras del dado de la carta MIST, vuelve de Quemadas a tu Mazo y se baraja. En combate, una vez por turno."
        },
        {
          clave: "barrera", nombre: "Barrera espiritual", icono: "fa-shield-heart",
          texto: "Si fueras a recibir daño, en vez de eso quemas cartas de la parte superior de tu mazo, por cada carta que quemes resta la mitad de su valor al daño, hasta mitigar por completo el daño.",
          auto: "En Juego: cuando el Master aplica daño con el botón del chat, se queman cartas de la parte superior de tu Mazo; cada una resta la mitad de las caras de su dado (redondeo hacia arriba) hasta anular el daño o vaciar el Mazo."
        }
      ],
      progresion: {
        2: {
          habilidades: [
            {
              nombre: "Mal de ojo", esAtaque: false, valorX: true, efectoX: "malDeOjo",
              texto: "Maldices a un objetivo X turnos, reduciendo la categoría de sus cartas de misticismo en 1 dado (si es una carta de d4 el resultado será automáticamente 1). (X es el resultado de la tirada de misticismo)"
            },
            {
              nombre: "Sellar destino", esAtaque: false, requiereTirada: false, efectoX: "sellarDestino",
              texto: "Al usar esta habilidad, descarta otra carta de tu mano: la criatura objetivo está obligada a realizar una acción relacionada con esa carta. Si la criatura no tiene ninguna carta relacionada en su mano, descarta la mano y roba una nueva, y el efecto desaparece."
            },
            {
              nombre: "Flagelar esencia", esAtaque: false, valorX: true, efectoX: "flagelarEsencia",
              texto: "Realizas un ataque a la esencia del enemigo, haciendo X × nivel de agotamiento × nivel de peligro de daño. (X es el resultado de la tirada de misticismo)"
            }
          ],
          packs: [
            [{ palo: "espadas", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "oros", numero: 1 }, { palo: "copas", numero: 2 }],
            [{ palo: "bastos", numero: 1 }, { palo: "copas", numero: 2 }]
          ]
        },
        3: {
          especializaciones: [
            {
              clave: "brujo", nombre: "Brujo",
              texto: "Especialización de Potens Mystica. Sus beneficios están pendientes de definir: el Master los aplica mientras tanto."
            }
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
 * Valor de `system.claveRaza` / `system.claveClase` que marca una Raza o Clase como personalizada
 * desde su ficha (v0.15.1): desactiva el reconocimiento por nombre y toda automatización de la base.
 */
export const CLAVE_PERSONALIZADA = "personalizada";

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
  // (v0.15.1) Elegida «Personalizada» en la ficha: sin reconocimiento por nombre.
  if (guardada === CLAVE_PERSONALIZADA) return null;
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
 * Normaliza los Trinkets iniciales de una clase (v0.15.0): cada entrada puede ser un nombre o un
 * abalorio `{ clave, nombre, icono, texto, auto }`.
 * @param {object|null} configClase - Entrada de `SISTEMA_CONFIG.CLASES_BASE`.
 * @returns {Array<{clave: string|null, nombre: string, icono: string, texto: string, auto: string}>}
 */
export function opcionesTrinketsClase(configClase) {
  return (configClase?.trinkets ?? []).map(t => typeof t === "string"
    ? { clave: null, nombre: t, icono: "fa-gem", texto: "", auto: "" }
    : { clave: t.clave ?? null, nombre: t.nombre, icono: t.icono ?? "fa-gem", texto: t.texto ?? "", auto: t.auto ?? "",
        eterno: Boolean(t.eterno), artilugios: Boolean(t.artilugios?.length) });
}

/**
 * Especializaciones definidas en la progresión de una Clase base (v0.18.0), con el nivel en que se eligen.
 * @param {object|null} configClase - Entrada de `SISTEMA_CONFIG.CLASES_BASE`.
 * @returns {Array<object & {nivelEleccion: number}>}
 */
export function especializacionesClase(configClase) {
  const lista = [];
  for (const [nivel, recompensas] of Object.entries(configClase?.progresion ?? {})) {
    for (const e of recompensas.especializaciones ?? []) lista.push({ ...e, nivelEleccion: Number(nivel) });
  }
  return lista;
}

/**
 * Especialización ya elegida en un Item de Clase (v0.18.0): busca `system.especializacion` (nombre o
 * clave, sin distinguir mayúsculas) entre las especializaciones de su Clase base.
 * @param {Item|null} itemClase
 * @param {object|null} configClase - Entrada de `SISTEMA_CONFIG.CLASES_BASE`.
 * @returns {object|null} Configuración de la especialización o null si no hay ninguna elegida.
 */
export function especializacionDeClase(itemClase, configClase) {
  const guardada = String(itemClase?.system?.especializacion ?? "").trim().toLowerCase();
  if (!guardada) return null;
  return especializacionesClase(configClase)
    .find(e => e.nombre.toLowerCase() === guardada || e.clave?.toLowerCase() === guardada) ?? null;
}

/**
 * Abalorios que se obtienen al subir de nivel dentro de las especializaciones de una clase (v0.18.0),
 * normalizados como `opcionesTrinketsClase`.
 * @param {object|null} configClase
 * @returns {object[]}
 */
export function abaloriosEspecializacionesClase(configClase) {
  return especializacionesClase(configClase).flatMap(e =>
    Object.values(e.progresion ?? {}).flatMap(r => opcionesTrinketsClase({ trinkets: r.abalorios ?? [] })));
}

/**
 * ¿Es la carta un Abalorio Eterno (v0.15.0)? Solo puede estar En Juego o en Cartas Quemadas.
 * Se reconoce por la clave de abalorio (`abalorioDeTrinket`) entre los abalorios con `eterno: true`
 * de cualquier clase base.
 * @param {Card} carta
 * @param {string|null} [claveClase=null] - Clase base del dueño (respaldo por nombre).
 * @returns {boolean}
 */
export function esAbalorioEterno(carta, claveClase = null) {
  // (v0.15.1) Valor editado en la ficha de la Carta (`flags.cartas-y-dados.eterno`): tiene prioridad.
  const marcado = carta?.flags?.["cartas-y-dados"]?.eterno;
  if (typeof marcado === "boolean") return carta?.type === "trinket" && marcado;
  const clave = abalorioDeTrinket(carta, claveClase);
  if (!clave) return false;
  return Object.values(SISTEMA_CONFIG.CLASES_BASE)
    .some(cfg => opcionesTrinketsClase(cfg).some(o => o.clave === clave && o.eterno));
}

/**
 * Contexto de solo lectura con la tabla de elecciones de una Clase base (v0.15.0), para la ficha
 * del Item de Clase: resumen por nivel y opciones de cada elección (abalorios, habilidades, packs y
 * especializaciones).
 * @param {string|null} claveClase - Clave de `SISTEMA_CONFIG.CLASES_BASE`.
 * @returns {{nombre: string, tabla: Array<{nivel: number, beneficios: string}>,
 *   grupos: Array<{titulo: string, icono: string, nivel: number, opciones: object[]}>}|null}
 */
export function contextoProgresionClase(claveClase) {
  const cfg = claveClase ? SISTEMA_CONFIG.CLASES_BASE[claveClase] : null;
  if (!cfg) return null;
  const grupos = [];
  const abalorios = opcionesTrinketsClase(cfg);
  if (abalorios.length) grupos.push({ titulo: "Elección de abalorio", icono: "fa-gem", nivel: 1, opciones: abalorios });
  // (v0.16.0) Objetos del «Artilugio de primera» (Alta Scentia).
  if (abalorios.some(a => a.artilugios)) {
    grupos.push({ titulo: "Artilugio de primera: objeto mágico", icono: "fa-toolbox", nivel: 1, opciones: opcionesArtilugio() });
  }
  grupos.push(...gruposProgresion(cfg.progresion));
  // (v0.18.0) Progresión propia de cada especialización.
  const especializaciones = especializacionesClase(cfg)
    .filter(e => e.tablaElecciones?.length || e.progresion)
    .map(e => ({ nombre: e.nombre, texto: e.texto ?? "", tabla: e.tablaElecciones ?? [], grupos: gruposProgresion(e.progresion) }));
  return { nombre: cfg.nombre, tabla: cfg.tablaElecciones ?? [], grupos, especializaciones };
}

/**
 * Grupos de opciones de solo lectura de una tabla de progresión (v0.18.0, extraído de
 * `contextoProgresionClase`): habilidades, packs, especializaciones, características, abalorios,
 * pasivas y beneficios pendientes de cada nivel.
 * @param {object} [progresion={}]
 * @returns {Array<{titulo: string, icono: string, nivel: number, opciones: object[]}>}
 */
function gruposProgresion(progresion = {}) {
  const grupos = [];
  for (const [nivel, recompensas] of Object.entries(progresion ?? {})) {
    if (recompensas.caracteristica) {
      grupos.push({
        titulo: "Elección de característica", icono: "fa-arrow-up-1-9", nivel: Number(nivel),
        opciones: [{ nombre: "+1 característica", texto: "Subes en 1 punto cualquiera de tus características." }]
      });
    }
    if (recompensas.abalorios?.length) {
      grupos.push({
        titulo: "Elección de abalorio", icono: "fa-gem", nivel: Number(nivel),
        opciones: opcionesTrinketsClase({ trinkets: recompensas.abalorios })
      });
    }
    if (recompensas.habilidades?.length) {
      grupos.push({
        titulo: "Elección de habilidad", icono: "fa-wand-magic-sparkles", nivel: Number(nivel),
        opciones: recompensas.habilidades.map(h => ({ nombre: h.nombre, texto: h.texto ?? "" }))
      });
    }
    if (recompensas.packs?.length) {
      grupos.push({
        titulo: "Elección de cartas", icono: "fa-layer-group", nivel: Number(nivel),
        opciones: recompensas.packs.map((p, i) => ({ nombre: `Pack ${i + 1}`, texto: describirPackCartas(p) }))
      });
    }
    if (recompensas.especializaciones?.length) {
      grupos.push({
        titulo: "Elección de especialización", icono: "fa-award", nivel: Number(nivel),
        opciones: recompensas.especializaciones.map(e => ({ nombre: e.nombre, texto: e.texto ?? "" }))
      });
    }
    if (recompensas.pasivas?.length) {
      grupos.push({
        titulo: "Otros bonus", icono: "fa-star", nivel: Number(nivel),
        opciones: recompensas.pasivas.map(p => ({ nombre: p.nombre, texto: p.texto ?? "" }))
      });
    }
    if (recompensas.pendientes?.length) {
      grupos.push({
        titulo: "Pendiente de definir", icono: "fa-hourglass-half", nivel: Number(nivel),
        opciones: recompensas.pendientes.map(p => ({ nombre: p, texto: "Aún sin definir: el Master lo aplica mientras tanto." }))
      });
    }
  }
  return grupos;
}

/**
 * Clave de abalorio de un Trinket (v0.15.0): `flags.cartas-y-dados.abalorio`; para Trinkets creados
 * antes de v0.15.0, por nombre entre los abalorios de la clase indicada.
 * @param {Card} carta - Carta `trinket`.
 * @param {string|null} [claveClase=null] - Clase base del dueño (respaldo por nombre).
 * @returns {string|null}
 */
export function abalorioDeTrinket(carta, claveClase = null) {
  if (carta?.type !== "trinket") return null;
  // (v0.15.1) Una clave guardada (aunque sea vacía, «sin efecto» elegido en la ficha) tiene prioridad
  // sobre el reconocimiento por nombre.
  const guardado = carta.flags?.["cartas-y-dados"]?.abalorio;
  if (typeof guardado === "string") return guardado || null;
  const nombre = String(carta.name ?? "").trim().toLowerCase();
  const opcion = opcionesTrinketsClase(SISTEMA_CONFIG.CLASES_BASE[claveClase])
    .find(o => o.clave && o.nombre.toLowerCase() === nombre);
  return opcion?.clave ?? null;
}

/**
 * Catálogo de todos los abalorios automatizados de las Clases base (v0.15.1), para elegir el
 * efecto de cualquier Trinket desde su ficha (`flags.cartas-y-dados.abalorio`).
 * @returns {Array<{clave: string, nombre: string, clase: string, eterno: boolean, auto: string}>}
 */
export function catalogoAbalorios() {
  const catalogo = [];
  for (const cfg of Object.values(SISTEMA_CONFIG.CLASES_BASE)) {
    // (v0.18.0) También los abalorios de las especializaciones (Custodio...).
    for (const o of [...opcionesTrinketsClase(cfg), ...abaloriosEspecializacionesClase(cfg)]) {
      if (o.clave && !catalogo.some(c => c.clave === o.clave)) {
        catalogo.push({ clave: o.clave, nombre: o.nombre, clase: cfg.nombre, eterno: o.eterno, auto: o.auto });
      }
    }
  }
  return catalogo;
}

/**
 * Automatizaciones disponibles para el valor X de una Habilidad (v0.15.1), guardadas en
 * `flags.cartas-y-dados.efectoX` del Item (ver `SistemaActor#_htmlValorX`).
 * La clave vacía significa que el Master aplica el efecto a mano.
 */
export const EFECTOS_VALOR_X = {
  "": "Ninguno (lo aplica el Master)",
  curacion: "Curar X al Token objetivo",
  promesa: "Promesa: el objetivo elige entre sus X primeras cartas",
  // (v0.16.0) Alta Scentia
  manifestarArma: "Manifestar arma: categorías según el dado de la carta, X turnos",
  tiempoEmbotellado: "Tiempo embotellado: guardar los dados para sustituirlos después",
  // (v0.17.0) Potens Mystica
  malDeOjo: "Mal de ojo: maldecir al objetivo X turnos (−1 categoría a sus dados MIST)",
  flagelarEsencia: "Flagelar esencia: daño X × tu Agotamiento × Amenaza del objetivo",
  sellarDestino: "Sellar destino: descartar una carta y obligar al objetivo (sin tirada)",
  // (v0.18.0) Fortis Corpore · Custodio
  muroVoluntad: "Muro de voluntad: muro con 3 × X de vida",
  corazonDragon: "Corazón del dragón: X turnos con daño máximo 1 (+1 Agotamiento al recibirlo)",
  rencor: "Rencor: devolver el daño mitigado + X al atacante"
};

/**
 * Valor de una carta (v0.17.0, Potens Mystica): las caras de su dado (d4 = 4 ... d12 = 12).
 * Lo usan Ojo por ojo (vida perdida), Preservación espiritual (valor máximo a igualar) y Barrera
 * espiritual (la mitad, redondeando hacia arriba, mitiga el daño).
 * @param {Card|null} carta
 * @returns {number} 0 si la carta no tiene dado (p. ej. un Trinket).
 */
export function valorCarta(carta) {
  if (carta?.type !== "accion") return 0;
  const dado = carta.system?.tipoDado || SISTEMA_CONFIG.dadoPorNumeroCarta[Number(carta.system?.numero)] || "";
  return Number(String(dado).replace(/^d/i, "")) || 0;
}

/**
 * Dado reducido una categoría por «Mal de ojo» (v0.17.0): d12 → d10 → d8 → d6 → d4; un d4 no tiene
 * categoría inferior y su resultado es automáticamente 1 (`resultadoFijo`).
 * @param {string} tipoDado - "d4".."d12".
 * @returns {{tipoDado: string, resultadoFijo: number|null}}
 */
export function dadoReducidoMalDeOjo(tipoDado) {
  const orden = ["d4", "d6", "d8", "d10", "d12"];
  const i = orden.indexOf(String(tipoDado ?? "").toLowerCase());
  if (i <= 0) return { tipoDado: "d4", resultadoFijo: 1 };
  return { tipoDado: orden[i - 1], resultadoFijo: null };
}

/**
 * Nombre visible del estado alterado de un elemento (v0.16.0): la etiqueta localizada de
 * `CONFIG.statusEffects` si existe; si no, `nombreEstado` de `SISTEMA_CONFIG.ELEMENTOS`.
 * @param {string} claveElemento - Clave de `SISTEMA_CONFIG.ELEMENTOS`.
 * @returns {string} "" si el elemento no está en el catálogo.
 */
export function nombreEstadoElemento(claveElemento) {
  const elemento = SISTEMA_CONFIG.ELEMENTOS[claveElemento];
  if (!elemento) return "";
  const estado = CONFIG.statusEffects?.find?.(e => e.id === elemento.estado);
  return estado?.name ? game.i18n.localize(estado.name) : elemento.nombreEstado;
}

/**
 * Opciones del artilugio del abalorio «Artilugio de primera» (v0.16.0).
 * @param {string|null} [seleccionado=null] - Clave elegida (se marca `seleccionado`).
 * @returns {Array<{clave: string, nombre: string, icono: string, texto: string, auto: string, seleccionado: boolean}>}
 */
export function opcionesArtilugio(seleccionado = null) {
  return Object.entries(SISTEMA_CONFIG.ARTILUGIOS)
    .map(([clave, a]) => ({ clave, ...a, seleccionado: clave === seleccionado }));
}

/**
 * Texto del efecto permanente de un Trinket de abalorio (v0.16.0): el texto del abalorio y, en el
 * «Artilugio de primera», el del artilugio elegido.
 * @param {{texto?: string}|null} abalorio - Opción de `opcionesTrinketsClase`.
 * @param {string|null} [claveArtilugio=null]
 * @returns {string} HTML ("" si no hay texto).
 */
export function efectoPermanenteAbalorio(abalorio, claveArtilugio = null) {
  const artilugio = claveArtilugio ? SISTEMA_CONFIG.ARTILUGIOS[claveArtilugio] : null;
  return [
    abalorio?.texto ? `<p>${abalorio.texto}</p>` : "",
    artilugio ? `<p><strong>${artilugio.nombre}:</strong> ${artilugio.texto}</p>` : ""
  ].join("");
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
  // (v0.15.1) Elegida «Personalizada» en la ficha: sin reconocimiento por nombre.
  if (clave === CLAVE_PERSONALIZADA) return null;
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

/**
 * Acciones del catálogo (`SISTEMA_CONFIG.ACCIONES`) disponibles para una característica (v0.14.0).
 * @param {string} claveCaracteristica - `fisico`, `consciencia`, `social` o `misticismo`.
 * @param {Object} [opciones]
 * @param {Set<string>|null} [opciones.abalorios=null] - (v0.15.0) Abalorios En Juego del Actor.
 * @returns {Array<{clave: string, nombre: string, icono: string, texto: string, resolucion: string,
 *   reaccion: boolean, adicional: boolean}>} La acción `libre` siempre va al final.
 */
export function accionesDeCaracteristica(claveCaracteristica, { abalorios = null } = {}) {
  return Object.entries(SISTEMA_CONFIG.ACCIONES)
    .filter(([, a]) => a.caracteristicas.includes(claveCaracteristica))
    // (v0.15.0) Las acciones de un abalorio solo aparecen si está En Juego.
    .filter(([, a]) => !a.abalorio || Boolean(abalorios?.has(a.abalorio)))
    .map(([clave, a]) => ({ clave, ...a, reaccion: Boolean(a.reaccion), adicional: Boolean(a.adicional) }))
    .sort((a, b) => (a.clave === "libre") - (b.clave === "libre"));
}

/**
 * Nombre visible de una característica (localizado si hay traducción).
 * @param {string} clave - `fisico`, `consciencia`, `social` o `misticismo`.
 * @returns {string}
 */
export function nombreCaracteristica(clave) {
  const etiqueta = SISTEMA_CONFIG.caracteristicas[clave];
  return etiqueta ? game.i18n.localize(etiqueta) : String(clave ?? "");
}
