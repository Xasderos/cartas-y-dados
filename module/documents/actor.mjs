/**
 * @file actor.mjs
 * @description Clase extendida de Actor para Foundry VTT v14.
 * Implementa trazabilidad única por carta mediante `flags.cartas-y-dados.sourceCardId`
 * para garantizar que cada Carta de Acción y cada Trinket se mueva de forma independiente
 * entre Mazo, Mano, En Juego, Descarte y Quemadas, recalculando la Defensa en tiempo real.
 */

import {
  SISTEMA_CONFIG, abreviadoPalo, claveClaseDeItem, describirPackCartas, estadoAgotamiento, generarNombreMisticoUnico,
  nombreVisibleCarta, razaBaseDeActor, tieneRasgoRacial
} from "../config.mjs";
import { opcionesDialogoSistema } from "../applications/ventana-dinamica.mjs";
import { htmlResolucionDificultad, publicarTirada, tirarDadosSistema } from "../dados.mjs";

export class SistemaActor extends Actor {

  /* ======================================================================== */
  /*  1. INICIALIZACIÓN Y GENERADOR DE MAZO INICIAL                           */
  /* ======================================================================== */

  async inicializarPilasDeJugador() {
    let carpeta = game.folders.find(f => f.type === "Cards" && f.name === this.name);
    if (!carpeta) {
      carpeta = await Folder.create({
        name: this.name,
        type: "Cards",
        color: "#2b3a4a"
      });
    }

    const definicionPilas = [
      { clave: "mazoId", nombre: `${this.name} - Mazo de Juego`, tipo: "deck", publico: false },
      { clave: "manoId", nombre: `${this.name} - Mano`, tipo: "hand", publico: false },
      { clave: "enJuegoId", nombre: `${this.name} - Trinkets en Juego`, tipo: "pile", publico: true },
      { clave: "descarteId", nombre: `${this.name} - Descarte`, tipo: "pile", publico: true },
      { clave: "quemadasId", nombre: `${this.name} - Cartas Quemadas`, tipo: "pile", publico: true },
      { clave: "trinketsId", nombre: `${this.name} - Mazo de Trinkets`, tipo: "deck", publico: true }
    ];

    const actualizacionesActor = {};

    for (const def of definicionPilas) {
      const idActual = this.system.pilas[def.clave];
      const pilaExistente = idActual ? game.cards.get(idActual) : null;

      if (!pilaExistente) {
        const ownership = def.publico
          ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
          : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };

        const nuevaPila = await Cards.create({
          name: def.nombre,
          type: def.tipo,
          folder: carpeta.id,
          ownership
        });
        actualizacionesActor[`system.pilas.${def.clave}`] = nuevaPila.id;
      }
    }

    if (Object.keys(actualizacionesActor).length > 0) {
      await this.update(actualizacionesActor);
    }

    this.prepareData();
    ui.notifications.info(`Pilas de cartas inicializadas para ${this.name}.`);
    return this.system.pilasDocumentos;
  }

  /**
   * Inicializa por completo un personaje según su Clase Base (v0.8.4):
   * 1. Crea las 6 pilas de cartas si aún no existen.
   * 2. Puebla el Mazo de Juego con 12 Cartas de Acción de nombres místicos únicos:
   *    - 1x carta numero 1 (d4) de cada uno de los 4 palos (espadas, bastos, oros, copas).
   *    - +3x cartas numero 1 (d4) adicionales del paloPrincipal (total: 4 d4 del palo principal).
   *    - 1x carta numero 2 (d6) de cada uno de los 4 palos.
   *    - 1x carta numero 3 (d8) del paloPrincipal.
   *    (Para Tabula Rasa, sin palo principal, el Mazo queda vacío para personalización manual.)
   * 3. Crea 1 carta tipo "trinket" con `system.nivel: 1` y el nombre del Trinket elegido,
   *    sincronizando `name`, `face: 0`, `faces[0].name` y `back.name`.
   * 4. Crea o actualiza en el Actor el Item de tipo "clase" con el nombre de la clase elegida.
   * 5. (v0.10.1) Si se indica `claveRaza`, crea o actualiza el Item de tipo "raza".
   * @param {string} claveClase - Clave de `SISTEMA_CONFIG.CLASES_BASE` (ej. "fortisCorpore").
   * @param {string} nombreTrinket - Nombre del Trinket inicial elegido por el jugador.
   * @param {string|null} [claveRaza=null] - Clave de `SISTEMA_CONFIG.RAZAS_BASE` (ej. "mairu").
   */
  async inicializarPersonajeConClase(claveClase, nombreTrinket, claveRaza = null) {
    const configClase = SISTEMA_CONFIG.CLASES_BASE?.[claveClase];
    if (!configClase) {
      ui.notifications.warn(`Clase desconocida: "${claveClase}".`);
      return;
    }

    // 1. Asegurar que las 6 pilas existen vinculadas al Actor en el mundo
    await this.inicializarPilasDeJugador();
    const { mazo, trinkets } = this.system.pilasDocumentos;
    if (!mazo || !trinkets) return;

    // 2. Poblar el Mazo de Juego con las 12 Cartas de Acción de la clase
    //    (solo si tiene palo principal y el Mazo está vacío, para evitar duplicados)
    if (configClase.paloPrincipal && mazo.cards.size === 0) {
      const todosLosPalos = ["espadas", "bastos", "oros", "copas"];
      const distribucion = [];

      // 1x carta d4 (numero 1) de cada palo
      for (const palo of todosLosPalos) distribucion.push({ palo, numero: 1 });
      // +3x cartas d4 (numero 1) adicionales del palo principal (4 d4 en total)
      for (let i = 0; i < 3; i++) distribucion.push({ palo: configClase.paloPrincipal, numero: 1 });
      // 1x carta d6 (numero 2) de cada palo
      for (const palo of todosLosPalos) distribucion.push({ palo, numero: 2 });
      // 1x carta d8 (numero 3) del palo principal
      distribucion.push({ palo: configClase.paloPrincipal, numero: 3 });

      const nombresMisticosUsados = new Set();
      const payloadCartas = distribucion.map(({ palo, numero }) => {
        const nombreMistico = generarNombreMisticoUnico(nombresMisticosUsados);
        nombresMisticosUsados.add(nombreMistico);
        return this._normalizarPayloadCarta({ name: nombreMistico, type: "accion", system: { palo, numero } });
      });

      await mazo.createEmbeddedDocuments("Card", payloadCartas);
      await mazo.shuffle({ chatNotification: false });
    }

    // 3. Crear el Trinket inicial (Nivel 1, sin palo ni dado) si el Mazo de Trinkets está vacío
    const trinketInicial = nombreTrinket || configClase.trinkets?.[0] || "Vasija vacía";
    if (trinkets.cards.size === 0) {
      const payloadTrinket = this._normalizarPayloadCarta({
        name: trinketInicial,
        type: "trinket",
        system: { nivel: 1, realizaTirada: false, esAtaque: false, bonoDefensaEnJuego: 0 }
      });
      await trinkets.createEmbeddedDocuments("Card", [payloadTrinket]);
    }

    // 4. Crear o actualizar el Item de tipo 'clase' (registro de progresión, v0.10.0)
    const datosClase = { name: configClase.nombre, "system.claveClase": claveClase };
    if (configClase.paloPrincipal) datosClase["system.paloAfin"] = configClase.paloPrincipal;
    const itemClase = this.items.find(i => i.type === "clase");
    if (itemClase) {
      await itemClase.update(datosClase);
    } else {
      await this.createEmbeddedDocuments("Item", [{ type: "clase", ...foundry.utils.expandObject(datosClase) }]);
    }

    // 5. Crear o actualizar el Item de tipo 'raza' (v0.10.1)
    const configRaza = claveRaza ? SISTEMA_CONFIG.RAZAS_BASE?.[claveRaza] : null;
    if (configRaza) {
      // (v0.13.0) `rasgoRacial` resume los beneficios (tooltip de la ranura de Raza).
      const datosRaza = {
        name: configRaza.nombre,
        "system.claveRaza": claveRaza,
        "system.rasgoRacial": (configRaza.beneficios ?? []).map(r => r.nombre).join(", ")
      };
      const itemRaza = this.items.find(i => i.type === "raza");
      if (itemRaza) {
        await itemRaza.update(datosRaza);
      } else {
        await this.createEmbeddedDocuments("Item", [{ type: "raza", ...foundry.utils.expandObject(datosRaza) }]);
      }
    }

    this.prepareData();
    const textoRaza = configRaza ? `${configRaza.nombre}, ` : "";
    ui.notifications.info(`${this.name} (${textoRaza}${configClase.nombre}) está listo (Trinket inicial: "${trinketInicial}").`);
  }

  /* ======================================================================== */
  /*  1b. PROGRESIÓN DE CLASE: SUBIDA DE NIVEL (v0.10.0)                      */
  /* ======================================================================== */

  /**
   * Devuelve las opciones de la siguiente subida de nivel según
   * `SISTEMA_CONFIG.CLASES_BASE.<clave>.progresion[nivelDestino]`.
   * @returns {{itemClase: Item, claveClase: string, configClase: object, nivelActual: number,
   *   nivelDestino: number, habilidades: object[], packs: object[][]}|null}
   *   null si el Actor no tiene Clase base reconocida o no hay progresión definida para el siguiente nivel.
   */
  obtenerOpcionesSubidaNivel() {
    const itemClase = this.items.find(i => i.type === "clase");
    const claveClase = claveClaseDeItem(itemClase);
    const configClase = claveClase ? SISTEMA_CONFIG.CLASES_BASE[claveClase] : null;
    if (!configClase) return null;
    const nivelActual = Number(itemClase.system.nivel) || 1;
    const nivelDestino = nivelActual + 1;
    const recompensas = configClase.progresion?.[nivelDestino];
    if (!recompensas) return null;
    return {
      itemClase, claveClase, configClase, nivelActual, nivelDestino,
      habilidades: recompensas.habilidades ?? [],
      packs: recompensas.packs ?? []
    };
  }

  /**
   * Sube el personaje un nivel de Clase aplicando las recompensas elegidas (v0.10.0):
   * 1. Crea el Item `habilidad` elegido (origen "clase", activable, MIST; efecto a definir en su ficha).
   * 2. Añade las cartas del pack elegido al Mazo de Juego con nombres místicos únicos y baraja.
   * 3. Sube `system.nivel` del Item de Clase y registra la elección en `system.historialNiveles`.
   * 4. Anuncia la subida en el chat.
   * La confirmación del jugador se pide en la ficha (`HojaPersonajeActor#abrirSubidaNivel`).
   * @param {{indiceHabilidad: number, indicePack: number}} eleccion - Índices dentro de las opciones.
   * @returns {Promise<boolean>} true si se aplicó la subida.
   */
  async subirDeNivel({ indiceHabilidad, indicePack }) {
    const opciones = this.obtenerOpcionesSubidaNivel();
    if (!opciones) {
      ui.notifications.warn(`${this.name} no tiene una subida de nivel disponible.`);
      return false;
    }
    const habilidad = opciones.habilidades[indiceHabilidad];
    const pack = opciones.packs[indicePack];
    if (!habilidad || !pack) {
      ui.notifications.warn("Debes elegir una habilidad y un pack de cartas.");
      return false;
    }

    // Las cartas nuevas van al Mazo: las pilas deben existir
    if (!this.system.pilasDocumentos?.mazo) await this.inicializarPilasDeJugador();
    const { mazo } = this.system.pilasDocumentos;
    if (!mazo) return false;

    const { itemClase, configClase, nivelDestino } = opciones;

    // 1. Habilidad de clase
    await this.createEmbeddedDocuments("Item", [{
      name: habilidad.nombre,
      type: "habilidad",
      system: {
        origenHabilidad: "clase",
        esActivable: true,
        requiereTirada: true,
        esAtaque: Boolean(habilidad.esAtaque),
        caracteristica: "misticismo",
        descripcion: `<p>Habilidad de ${configClase.nombre} obtenida al alcanzar el Nivel ${nivelDestino}.</p>`
      },
      flags: { "cartas-y-dados": { habilidadDeClase: opciones.claveClase, nivelObtenida: nivelDestino } }
    }]);

    // 2. Cartas del pack: nombres místicos únicos frente a todas las cartas del personaje
    const nombresUsados = new Set();
    for (const pila of Object.values(this.system.pilasDocumentos ?? {})) {
      for (const carta of pila?.cards ?? []) nombresUsados.add(carta.name);
    }
    const payloadCartas = pack.map(({ palo, numero }) => {
      const nombre = generarNombreMisticoUnico(nombresUsados);
      nombresUsados.add(nombre);
      return this._normalizarPayloadCarta({ name: nombre, type: "accion", system: { palo, numero } });
    });
    await mazo.createEmbeddedDocuments("Card", payloadCartas);
    await mazo.shuffle({ chatNotification: false });

    // 3. Nivel e historial en el Item de Clase
    const descripcionPack = describirPackCartas(pack);
    await itemClase.update({
      "system.claveClase": opciones.claveClase,
      "system.nivel": nivelDestino,
      "system.historialNiveles": [
        ...(itemClase.system.historialNiveles ?? []),
        { nivel: nivelDestino, habilidad: habilidad.nombre, cartas: descripcionPack }
      ]
    });

    this.prepareData();

    // 4. Aviso en el chat
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-angles-up"></i> ${this.name} sube a Nivel ${nivelDestino}</h3>
          <p><strong>${configClase.nombre}</strong></p>
          <p><i class="fa-solid fa-wand-magic-sparkles"></i> Nueva habilidad: <strong>${habilidad.nombre}</strong></p>
          <p><i class="fa-solid fa-layer-group"></i> Cartas añadidas al Mazo: ${descripcionPack}</p>
        </div>`
    });
    ui.notifications.info(`${this.name} ha subido a Nivel ${nivelDestino}.`);
    return true;
  }

  /* ======================================================================== */
  /*  2. MOTOR INTERNO DE MOVIMIENTO INDEPENDIENTE ENTRE PILAS                */
  /* ======================================================================== */

  /**
   * Extrae una o varias cartas específicas desde un Mazo (`mazo` o `trinkets`) hacia otra pila
   * (normalmente `mano`), marcándolas como `drawn: true` en el mazo y grabando su `sourceCardId`
   * en `flags.cartas-y-dados` para no perder jamás su identidad individual.
   *
   * @param {Cards} mazoOrigen - Mazo de tipo 'deck'.
   * @param {Cards} pilaDestino - Pila destino (ej. `mano`).
   * @param {string[]} idsEnMazo - Array de IDs de las cartas dentro de `mazoOrigen`.
   */
  async _extraerCartasDeMazo(mazoOrigen, pilaDestino, idsEnMazo) {
    if (!mazoOrigen || !pilaDestino || !idsEnMazo.length) return [];

    const updatesMazo = [];
    const datosNuevasCartas = [];

    for (const id of idsEnMazo) {
      const cartaOriginal = mazoOrigen.cards.get(id);
      if (!cartaOriginal || cartaOriginal.drawn) continue;

      updatesMazo.push({ _id: cartaOriginal.id, drawn: true });

      const copia = cartaOriginal.toObject();
      delete copia._id;
      copia.drawn = false;
      copia.origin = mazoOrigen.id;
      copia.flags = foundry.utils.mergeObject(copia.flags ?? {}, {
        "cartas-y-dados": {
          sourceCardId: cartaOriginal.id,
          sourceDeckId: mazoOrigen.id
        }
      });
      datosNuevasCartas.push(copia);
    }

    if (updatesMazo.length > 0) {
      await mazoOrigen.updateEmbeddedDocuments("Card", updatesMazo);
    }

    let creadas = [];
    if (datosNuevasCartas.length > 0) {
      const normalizadas = datosNuevasCartas.map(c => this._normalizarPayloadCarta(c));
      creadas = await pilaDestino.createEmbeddedDocuments("Card", normalizadas);
    }

    this.prepareData();
    return creadas;
  }

  /**
   * Mueve una única carta entre dos pilas activas (ej. `mano` -> `enJuego`, `mano` -> `descarte`,
   * `enJuego` -> `quemadas`) conservando intactos su `system` y su `sourceCardId`.
   *
   * @param {Cards} pilaOrigen - Pila donde se encuentra actualmente la carta.
   * @param {Cards} pilaDestino - Pila a la que se mueve.
   * @param {string} cartaId - ID exacto de la carta dentro de `pilaOrigen`.
   */
  async _moverCartaEntrePilas(pilaOrigen, pilaDestino, cartaId) {
    if (!pilaOrigen || !pilaDestino) return null;
    const carta = pilaOrigen.cards.get(cartaId);
    if (!carta) return null;

    const datosCopia = carta.toObject();
    delete datosCopia._id;
    datosCopia.drawn = false;

    const [cartaCreada] = await pilaDestino.createEmbeddedDocuments("Card", [this._normalizarPayloadCarta(datosCopia)]);
    await pilaOrigen.deleteEmbeddedDocuments("Card", [carta.id]);

    // Recalcular inmediatamente las propiedades derivadas del Actor (ej. Defensa por Trinkets en juego)
    this.prepareData();
    return cartaCreada;
  }

  /**
   * Devuelve todas las cartas de `pilaOrigen` (`descarte`, `enJuego` o `quemadas`) a sus respectivos
   * mazos originales (`mazo` para acciones, `trinkets` para Trinkets) usando `sourceCardId`.
   *
   * @param {Cards} pilaOrigen - Pila que se va a vaciar de vuelta a los mazos.
   */
  async _devolverCartasASuMazoOriginal(pilaOrigen) {
    const { mazo, trinkets } = this.system.pilasDocumentos;
    if (!pilaOrigen || pilaOrigen.cards.size === 0) return;

    const updatesMazo = [];
    const updatesTrinkets = [];
    const nuevasParaMazo = [];
    const nuevasParaTrinkets = [];
    const idsABorrarDePila = [];

    const idsMazoReactivados = new Set();
    const idsTrinketsReactivados = new Set();

    for (const carta of pilaOrigen.cards) {
      const esTrinket = carta.type === "trinket";
      const mazoDestino = esTrinket ? trinkets : mazo;
      if (!mazoDestino) continue;

      const setReactivados = esTrinket ? idsTrinketsReactivados : idsMazoReactivados;
      const listaUpdates = esTrinket ? updatesTrinkets : updatesMazo;
      const listaNuevas = esTrinket ? nuevasParaTrinkets : nuevasParaMazo;

      // 1. Buscar por el ID único grabado en el flag `sourceCardId`
      const sourceId = carta.getFlag("cartas-y-dados", "sourceCardId");
      let cartaEnMazo = sourceId ? mazoDestino.cards.get(sourceId) : null;

      // 2. Fallback para cartas antiguas sin flag: buscar una carta drawn:true aún no reclamada
      if (!cartaEnMazo || setReactivados.has(cartaEnMazo.id)) {
        cartaEnMazo = mazoDestino.cards.find(
          c => c.drawn && !setReactivados.has(c.id) && c.name === carta.name && c.type === carta.type
        );
      }

      if (cartaEnMazo) {
        setReactivados.add(cartaEnMazo.id);
        listaUpdates.push({ _id: cartaEnMazo.id, drawn: false });
      } else {
        // Solo si la carta fue creada directamente fuera del mazo y no existe en él, la integramos
        const datos = carta.toObject();
        delete datos._id;
        datos.drawn = false;
        datos.origin = null;
        listaNuevas.push(datos);
      }

      idsABorrarDePila.push(carta.id);
    }

    if (updatesMazo.length > 0 && mazo) {
      await mazo.updateEmbeddedDocuments("Card", updatesMazo);
    }
    if (nuevasParaMazo.length > 0 && mazo) {
      await mazo.createEmbeddedDocuments("Card", nuevasParaMazo.map(c => this._normalizarPayloadCarta(c)));
    }
    if (updatesTrinkets.length > 0 && trinkets) {
      await trinkets.updateEmbeddedDocuments("Card", updatesTrinkets);
    }
    if (nuevasParaTrinkets.length > 0 && trinkets) {
      await trinkets.createEmbeddedDocuments("Card", nuevasParaTrinkets.map(c => this._normalizarPayloadCarta(c)));
    }
    if (idsABorrarDePila.length > 0) {
      await pilaOrigen.deleteEmbeddedDocuments("Card", idsABorrarDePila);
    }

    this.prepareData();
  }

  /**
   * Normaliza el payload de datos de una Card para crear/mover entre pilas,
   * asegurando que `name`, `face`, `faces` y `back` estén sincronizados y
   * sin valores "Unknown", evitando que Foundry VTT v14 sobrescriba el nombre.
   * @param {object} datosCarta - Datos crudos de la carta.
   * @returns {object} Payload con name, face: 0, faces y back sincronizados.
   */
  _normalizarPayloadCarta(datosCarta) {
    const nombreLimpio = nombreVisibleCarta(datosCarta);
    const imgCarta = datosCarta.img || datosCarta.faces?.[0]?.img || "icons/svg/card-hand.svg";
    return {
      ...datosCarta,
      name: nombreLimpio,
      face: 0,
      faces: [
        {
          ...(datosCarta.faces?.[0] ?? {}),
          name: nombreLimpio,
          img: imgCarta
        }
      ],
      back: {
        ...(datosCarta.back ?? {}),
        name: nombreLimpio,
        img: datosCarta.back?.img || imgCarta
      }
    };
  }

  /* ======================================================================== */
  /*  3. ROBO DE TURNO Y BARAJADO CON AGOTAMIENTO                             */
  /* ======================================================================== */

  async robarHastaLimiteMano() {
    const { mazo, mano, descarte } = this.system.pilasDocumentos;
    if (!mazo || !mano || !descarte) return;

    const limite = this.system.limiteMano;
    const porRobar = Math.max(0, limite - mano.cards.size);
    if (porRobar === 0) return;

    await this.robarCantidadCartas(porRobar);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-clone"></i><p><strong>${this.name}</strong> roba cartas hasta completar su mano (${mano.cards.size}/${limite}).</p></div>`
    });
  }

  async robarCantidadCartas(cantidad) {
    const { mazo, mano, descarte } = this.system.pilasDocumentos;
    if (!mazo || !mano || !descarte) return;

    let porRobar = cantidad;

    while (porRobar > 0) {
      if (mazo.availableCards.length === 0) {
        const accionesEnDescarte = descarte.cards.filter(c => c.type === "accion").length;
        if (accionesEnDescarte === 0) {
          ui.notifications.warn(`No quedan cartas de acción en el Mazo ni en el Descarte de ${this.name}.`);
          break;
        }
        await this.barajarDescarteEnMazo();
      }

      const disponibles = mazo.availableCards;
      const lote = Math.min(porRobar, disponibles.length);
      if (lote <= 0) break;

      const idsARobar = disponibles.slice(0, lote).map(c => c.id);
      await this._extraerCartasDeMazo(mazo, mano, idsARobar);
      porRobar -= lote;
    }
  }

  async barajarDescarteEnMazo() {
    const { mazo, descarte } = this.system.pilasDocumentos;
    if (!mazo || !descarte) return;

    await this._devolverCartasASuMazoOriginal(descarte);
    await mazo.shuffle({ chatNotification: false });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-alerta-cansancio">
          <h4><i class="fa-solid fa-triangle-exclamation"></i> Mazo Agotado</h4>
          <p><strong>${this.name}</strong> baraja su Descarte para formar un nuevo Mazo y recibe <strong>+1 de Agotamiento</strong>.</p>
        </div>
      `
    });

    // Las consecuencias del nuevo nivel las anuncia/aplica `_alCambiarAgotamiento` (hook updateActor).
    await this.cambiarAgotamiento(1);
  }

  /* ======================================================================== */
  /*  4. JUGAR CARTA, ATAQUE VS DEFENSA Y EFECTOS AUTOMATIZADOS               */
  /* ======================================================================== */

  /**
   * Devuelve el bloque HTML con la información mecánica de una carta para el chat.
   * Las Cartas de Acción muestran Palo + Dado; los Trinkets muestran su Nivel
   * (desde v0.8.4 los Trinkets ya no tienen palo ni número/dado).
   * @param {Card} carta - Carta jugada, descartada o quemada.
   * @returns {string} HTML con la información mecánica de la carta.
   */
  _infoCartaHtml(carta) {
    if (carta.type === "trinket") {
      const nivel = Number(carta.system?.nivel) || 1;
      return `<p><i class="fa-solid fa-gem"></i> <strong>Trinket</strong> · Nv. ${nivel}</p>`;
    }
    return `<p><i class="fa-solid fa-diamond"></i> <strong>${abreviadoPalo(carta.system.palo)}</strong> · Dado <strong>${carta.system.tipoDado}</strong></p>`;
  }

  /**
   * Bloques HTML de resolución de una tirada del sistema (v0.11.0: Crítico/Pifia y privacidad):
   * - Ataque con objetivo (`T`): daño = max(0, total - Defensa Total); un total negativo
   *   (Pifia) es fallo automático. El mensaje público solo indica el objetivo y si impacta;
   *   la Defensa, el daño y el botón para aplicarlo van en `master` (susurro solo al Master,
   *   ver `publicarTirada` → `enviarMensajeSoloMaster`).
   * - Ataque sin objetivo: muestra el resultado y recuerda marcar objetivo.
   * - Resto: contra la Dificultad del Master (`htmlResolucionDificultad`).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada - Tirada evaluada.
   * @param {boolean} esAtaque - Si la acción es un ataque.
   * @param {string} [etiquetaDificultad="Dificultad del Master"] - Texto de la dificultad.
   * @param {Object} [opciones]
   * @param {Token|TokenDocument|null} [opciones.tokenObjetivo] - Objetivo explícito (v0.13.0, repetición
   *   de tirada); si no se indica, se usa el objetivo marcado por el usuario (`T`).
   * @returns {{publico: string, master: string}} HTML público y HTML solo para el Master ("" si no aplica).
   */
  _htmlResolucionTirada(tirada, esAtaque, etiquetaDificultad = "Dificultad del Master", { tokenObjetivo: objetivoExplicito } = {}) {
    if (!esAtaque) return { publico: htmlResolucionDificultad(tirada, etiquetaDificultad), master: "" };

    const tokenObjetivo = objetivoExplicito !== undefined
      ? objetivoExplicito
      : game.user.targets.first() ?? null;
    const actorObjetivo = tokenObjetivo?.actor ?? null;
    if (!actorObjetivo) {
      return {
        publico: `
          <div class="cyd-resolucion-caja">
            <p><i class="fa-solid fa-crosshairs"></i> <strong>Resultado de Ataque: ${tirada.total}</strong></p>
            <p><small><i class="fa-solid fa-circle-info"></i> Pulsa <strong>T</strong> sobre un enemigo antes de tirar para restar su Defensa.</small></p>
          </div>
        `,
        master: ""
      };
    }

    // Asegurar que la Defensa del objetivo tenga calculados sus propios Trinkets en juego
    actorObjetivo.prepareData();
    const defensaObjetivo = actorObjetivo.system.defensaTotal ?? actorObjetivo.system.defensa ?? 0;
    const danoCalculado = tirada.esNegativo ? 0 : Math.max(0, tirada.total - defensaObjetivo);
    const impacta = danoCalculado > 0;

    // Público: sin Defensa ni daño.
    const resultadoPublico = impacta
      ? '<i class="fa-solid fa-burst"></i> <span class="cyd-resultado-exito">IMPACTO</span>'
      : tirada.esNegativo
        ? '<i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">FALLO AUTOMÁTICO</span>'
        : '<i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">BLOQUEADO</span>';
    const publico = `
      <div class="cyd-resolucion-caja ${impacta ? "cyd-exito" : "cyd-fallo"}">
        <p><i class="fa-solid fa-crosshairs"></i> <strong>Objetivo:</strong> ${tokenObjetivo.name} · ${resultadoPublico}</p>
        <p><small><i class="fa-solid fa-eye-slash"></i> La Defensa y el daño solo los ve el Master.</small></p>
      </div>
    `;

    // Solo Master: Defensa, daño y botón para aplicarlo.
    const detalle = impacta
      ? `<p><i class="fa-solid fa-burst"></i> <span class="cyd-resultado-exito">IMPACTO</span> · <strong>Daño ${danoCalculado}</strong> <small>(${tirada.total} Ataque - ${defensaObjetivo} Defensa)</small></p>
          <button type="button" class="cyd-btn-aplicar-dano"
                  data-actor-uuid="${actorObjetivo.uuid}"
                  data-dano="${danoCalculado}">
            <i class="fa-solid fa-droplet"></i> Aplicar ${danoCalculado} de Daño a ${tokenObjetivo.name}
          </button>`
      : tirada.esNegativo
        ? `<p><i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">FALLO AUTOMÁTICO</span> · <strong>0 Daño:</strong> resultado negativo (${tirada.total}) por Pifia.</p>`
        : `<p><i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">BLOQUEADO</span> · <strong>0 Daño:</strong> La tirada (${tirada.total}) no superó la Defensa (${defensaObjetivo}).</p>`;
    const master = `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-eye-slash"></i> Resolución de ataque <small>(solo Master)</small></h3>
        <div class="cyd-resolucion-caja ${impacta ? "cyd-exito" : "cyd-fallo"}">
          <p><i class="fa-solid fa-crosshairs"></i> <strong>${this.name}</strong> → <strong>${tokenObjetivo.name}</strong> · <i class="fa-solid fa-shield-halved"></i> Defensa ${defensaObjetivo}</p>
          ${detalle}
        </div>
      </div>
    `;
    return { publico, master };
  }

  async jugarCarta(cartaId, { quemar = false, modo = "usar" } = {}) {
    const { mano, enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!mano || !enJuego || !descarte || !quemadas) return null;

    const carta = mano.cards.get(cartaId);
    if (!carta) {
      ui.notifications.error("La carta seleccionada no está en tu mano.");
      return null;
    }

    // Si el modo es "usar-y-quemar", forzar quemado de la carta tras usarla
    if (modo === "usar-y-quemar") quemar = true;

    const efectosAgotamiento = this.system.agotamiento?.efectos ?? {};

    // Agotamiento 5+: solo puede haber un Trinket activo en juego.
    if (carta.type === "trinket" && !quemar && !carta.system.seQuema
        && efectosAgotamiento.unTrinket && enJuego.cards.size >= 1) {
      ui.notifications.warn(`${this.name} tiene Agotamiento ${this.system.agotamiento.nivel}: solo puede tener un Trinket activo. Retira o quema el que está en juego antes de jugar otro.`);
      return null;
    }

    const auto = carta.system.automatizacion ?? {};
    const bonoTirada = Number(auto.bonoTirada) || 0;

    /** @type {import("../dados.mjs").ResultadoTiradaSistema|null} */
    let tirada = null;
    let bloqueResolucionHtml = "";
    /** HTML de resolución solo para el Master (Defensa y daño del objetivo). */
    let htmlMaster = "";

    // Los Trinkets NO calculan ni lanzan dados XdY (v0.8.4): se mueven directamente
    // a la pila `enJuego` ejecutando su automatización e indicando su Nivel en el chat.
    const debeTirar = carta.type === "accion";

    if (debeTirar) {
      const claveCaract = carta.system.caracteristicaAsociada;
      const cantidadDados = this.system.caracteristicasTotales?.[claveCaract]
        ?? this.system.caracteristicas[claveCaract]
        ?? 1;
      const tipoDado = carta.system.tipoDado ?? "d6";
      tirada = await tirarDadosSistema({
        cantidadDados, tipoDado, bono: bonoTirada, rollData: this.getRollData(),
        mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento()
      });
      const resolucion = this._htmlResolucionTirada(tirada, Boolean(carta.system.esAtaque));
      bloqueResolucionHtml = tirada.html + resolucion.publico;
      htmlMaster = resolucion.master;
    }

    // Determinar pila destino: Quemadas, En Juego (si es Trinket) o Descarte
    // Agotamiento 7+: las Cartas de Acción usadas se queman en vez de descartarse
    // (los Trinkets no se descartan al jugarse: van a En Juego).
    const quemaPorAgotamiento = carta.type === "accion" && Boolean(efectosAgotamiento.quemarAlUsar);
    const seQuema = quemar || Boolean(carta.system.seQuema) || quemaPorAgotamiento;
    let pilaDestino = descarte;
    let etiquetaDestino = "Descarte";

    if (seQuema) {
      pilaDestino = quemadas;
      etiquetaDestino = quemaPorAgotamiento && !quemar && !carta.system.seQuema
        ? "Carta Quemada por Agotamiento"
        : "Carta Quemada";
    } else if (carta.type === "trinket") {
      pilaDestino = enJuego;
      etiquetaDestino = "Trinket En Juego";
    }

    // Mover carta preservando flags y recalcular datos derivados del Actor (incluyendo Defensa)
    await this._moverCartaEntrePilas(mano, pilaDestino, carta.id);

    const resumenEfectosAuto = [];
    const updatesActor = {};

    if (auto.curacion > 0) {
      const nuevaSalud = Math.min(this.system.salud.maxTotal, this.system.salud.value + auto.curacion);
      updatesActor["system.salud.value"] = nuevaSalud;
      resumenEfectosAuto.push(`<i class="fa-solid fa-heart-pulse"></i> +${auto.curacion} Salud`);
    }

    if (auto.cambioCansancio !== 0) {
      updatesActor["system.cansancio.value"] = SistemaActor.limitarAgotamiento(this.system.cansancio.value + auto.cambioCansancio);
      const signo = auto.cambioCansancio > 0 ? `+${auto.cambioCansancio}` : auto.cambioCansancio;
      resumenEfectosAuto.push(`<i class="fa-solid fa-hourglass-half"></i> ${signo} Agotamiento`);
    }

    if (Object.keys(updatesActor).length > 0) {
      await this.update(updatesActor);
    }

    if (auto.robarCartas > 0) {
      await this.robarCantidadCartas(auto.robarCartas);
      resumenEfectosAuto.push(`<i class="fa-solid fa-clone"></i> Roba +${auto.robarCartas} carta(s)`);
    }

    const bonoDefTrinket = Number(carta.system.bonoDefensaEnJuego) || 0;
    if (carta.type === "trinket" && bonoDefTrinket !== 0 && !seQuema) {
      const signoDef = bonoDefTrinket > 0 ? `+${bonoDefTrinket}` : bonoDefTrinket;
      resumenEfectosAuto.push(`<i class="fa-solid fa-shield-halved"></i> ${signoDef} Defensa (Activo en Juego)`);
    }

    // Garantizar que `defensaTotal` quede recalculada en el Actor
    this.prepareData();

    const htmlEfectosAuto = resumenEfectosAuto.length > 0
      ? `<p class="cyd-tags-auto"><strong>Efectos aplicados:</strong> ${resumenEfectosAuto.join(" · ")}</p>`
      : "";

    const efectoHtml = carta.type === "trinket"
      ? carta.system.efectoAlJugar
      : carta.system.efecto;

    // Icono de cabecera: los Trinkets anuncian su entrada en juego con su Nivel (v0.8.4)
    const iconoChat = carta.type === "trinket" ? '<i class="fa-solid fa-gem"></i>' : carta.system.esAtaque ? '<i class="fa-solid fa-crosshairs"></i>' : '<i class="fa-solid fa-diamond"></i>';
    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3>${iconoChat} ${nombreVisibleCarta(carta)} <small>(${etiquetaDestino})</small></h3>
        ${this._infoCartaHtml(carta)}
        ${bloqueResolucionHtml}
        ${htmlEfectosAuto}
        ${efectoHtml ? `<div class="cyd-efecto">${efectoHtml}</div>` : ""}
      </div>
    `;

    if (tirada) {
      await publicarTirada(tirada, {
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: saborChat,
        htmlMaster,
        repeticion: this._datosRepeticionTirada(tirada, {
          titulo: nombreVisibleCarta(carta), esAtaque: Boolean(carta.system.esAtaque)
        })
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: saborChat
      });
    }

    return tirada;
  }

  /* ======================================================================== */
  /*  DESCARTAR Y QUEMAR CARTAS SIN TIRAR                                     */
  /* ======================================================================== */

  /**
   * Descarta una carta de la mano sin realizar tirada, anunciándolo en el chat.
   * La carta se mueve a la pila de Descarte.
   * @param {string} cartaId - ID de la carta en la mano del actor.
   */
  async descartarCarta(cartaId) {
    const { mano, descarte } = this.system.pilasDocumentos;
    if (!mano || !descarte) return null;

    const carta = mano.cards.get(cartaId);
    if (!carta) {
      ui.notifications.error("La carta seleccionada no está en tu mano.");
      return null;
    }

    await this._moverCartaEntrePilas(mano, descarte, carta.id);
    this.prepareData();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-box-archive"></i> ${nombreVisibleCarta(carta)} <small>Descarte</small></h3>
          <p><strong>${carta.type === "trinket" ? "Trinket" : "Acción"}:</strong> ${carta.type === "trinket" ? "Nv. " + (Number(carta.system.nivel) || 1) + " —" : ""} Descartad${carta.type === "trinket" ? "o" : "a"} sin tirar</p>
          ${this._infoCartaHtml(carta)}
          <p><small>La carta ha sido enviada al Descarte sin realizar ninguna tirada.</small></p>
        </div>
      `
    });

    return carta;
  }

  /**
   * Quema una carta de la mano sin realizar tirada, anunciándolo en el chat.
   * La carta se mueve a la pila de Cartas Quemadas.
   * @param {string} cartaId - ID de la carta en la mano del actor.
   */
  async quemarCarta(cartaId) {
    const { mano, quemadas } = this.system.pilasDocumentos;
    if (!mano || !quemadas) return null;

    const carta = mano.cards.get(cartaId);
    if (!carta) {
      ui.notifications.error("La carta seleccionada no está en tu mano.");
      return null;
    }

    await this._moverCartaEntrePilas(mano, quemadas, carta.id);
    this.prepareData();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-fire"></i> ${nombreVisibleCarta(carta)} <small>Carta Quemada</small></h3>
          <p><strong>${carta.type === "trinket" ? "Trinket" : "Acción"}:</strong> ${carta.type === "trinket" ? "Nv. " + (Number(carta.system.nivel) || 1) + " —" : ""} Quemad${carta.type === "trinket" ? "o" : "a"} sin tirar</p>
          ${this._infoCartaHtml(carta)}
          <p><small>La carta ha sido quemada (enviada a Cartas Quemadas) sin realizar ninguna tirada.</small></p>
        </div>
      `
    });

    return carta;
  }

  /* ======================================================================== */
  /*  5. GESTIÓN INDEPENDIENTE DE TRINKETS, FIN DE COMBATE Y DESCANSO         */
  /* ======================================================================== */

  /**
   * Descarta exactamente la carta `cartaManoId` de la mano y extrae exactamente
   * el Trinket `trinketId` elegido del Mazo de Trinkets hacia la Mano.
   */
  async robarTrinketPorDescarte(cartaManoId, trinketId) {
    const { mano, descarte, trinkets } = this.system.pilasDocumentos;
    if (!mano || !descarte || !trinkets) return;

    const cartaCoste = mano.cards.get(cartaManoId);
    const cartaTrinket = trinkets.cards.get(trinketId);

    if (!cartaCoste) {
      ui.notifications.warn("Debes elegir una carta de tu mano para descartar como coste.");
      return;
    }
    if (!cartaTrinket || cartaTrinket.drawn) {
      ui.notifications.warn("Ese Trinket no está disponible actualmente en tu Mazo de Trinkets.");
      return;
    }

    await this._moverCartaEntrePilas(mano, descarte, cartaCoste.id);
    await this._extraerCartasDeMazo(trinkets, mano, [cartaTrinket.id]);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-gem"></i><p><strong>${this.name}</strong> descarta <em>${nombreVisibleCarta(cartaCoste)}</em> y añade el Trinket <strong>${nombreVisibleCarta(cartaTrinket)}</strong> a su mano.</p></div>`
    });
  }

  /**
   * Mueve un único Trinket desde la pila `enJuego` hacia `descarte` o `quemadas`,
   * recalculando al instante la Defensa Total del personaje.
   */
  async retirarTrinketEnJuego(trinketEnJuegoId, { quemar = false } = {}) {
    const { enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!enJuego || !descarte || !quemadas) return;

    const trinket = enJuego.cards.get(trinketEnJuegoId);
    if (!trinket) return;

    const destino = quemar ? quemadas : descarte;
    const textoAccion = quemar ? "quema" : "descarta";
    const iconoAccion = quemar ? '<i class="fa-solid fa-fire"></i>' : '<i class="fa-solid fa-box-archive"></i>';

    await this._moverCartaEntrePilas(enJuego, destino, trinket.id);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso">${iconoAccion}<p><strong>${this.name}</strong> ${textoAccion} su Trinket activo <strong>${nombreVisibleCarta(trinket)}</strong>.</p></div>`
    });
  }

  /**
   * Al terminar la escena o combate:
   * Devuelve la Mano (`mano`), los Trinkets `enJuego` y el `descarte` a sus respectivos
   * mazos originales (`mazo` para acciones, `trinkets` para Trinkets) y los baraja.
   * Las Cartas Quemadas NO se recuperan hasta descansar.
   */
  async finalizarAccionOCombate() {
    const { mazo, trinkets, mano, enJuego, descarte } = this.system.pilasDocumentos;
    if (!mazo) return;

    for (const pila of [mano, enJuego, descarte]) {
      if (pila && pila.cards.size > 0) {
        await this._devolverCartasASuMazoOriginal(pila);
      }
    }

    await mazo.shuffle({ chatNotification: false });
    if (trinkets) await trinkets.shuffle({ chatNotification: false });

    this.prepareData();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-rotate"></i><p><strong>Fin de Escena / Combate (${this.name}):</strong> Su Mano, su Descarte y sus Trinkets en juego regresan a sus respectivos mazos y se barajan.</p></div>`
    });
  }

  /**
   * Descanso completo:
   * Devuelve Mano, En Juego, Descarte y Cartas Quemadas a sus mazos originales y los baraja.
   * Agotamiento (v0.12.0): solo un descanso cómodo en un lugar sin amenazas recupera
   * 1 punto (máximo 1 por día; lo controla el Master al elegir el tipo de descanso).
   * @param {Object} [opciones]
   * @param {boolean} [opciones.comodo=false] - Descanso cómodo y seguro: −1 Agotamiento.
   */
  async realizarDescanso({ comodo = false } = {}) {
    const { mazo, trinkets, mano, enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!mazo) return;

    for (const pila of [mano, enJuego, descarte, quemadas]) {
      if (pila && pila.cards.size > 0) {
        await this._devolverCartasASuMazoOriginal(pila);
      }
    }

    await mazo.shuffle({ chatNotification: false });
    if (trinkets) await trinkets.shuffle({ chatNotification: false });

    const agotamientoAntes = Number(this.system.cansancio?.value) || 0;
    const recupera = comodo && agotamientoAntes > 0;
    if (recupera) await this.cambiarAgotamiento(-1);

    // Rasgos raciales (v0.13.0): «Espera un momento» se recarga con cualquier descanso;
    // «Tradición alquímica» (1 al día) solo con el descanso cómodo (también máx. 1 al día).
    const recargaRasgos = { "system.rasgosRaza.esperaUnMomentoUsado": false };
    if (comodo) recargaRasgos["system.rasgosRaza.alquimiaUsada"] = false;
    await this.update(recargaRasgos);
    this.prepareData();

    const textoAgotamiento = recupera
      ? `Descanso cómodo: recupera <strong>1 punto de Agotamiento</strong> (${agotamientoAntes} → ${agotamientoAntes - 1}).`
      : comodo
        ? "No tiene Agotamiento que recuperar."
        : agotamientoAntes > 0
          ? `Descanso incómodo o amenazado: su Agotamiento (${agotamientoAntes}) no se recupera.`
          : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-campground"></i><p><strong>${this.name}</strong> descansa: recupera su Mano, su Descarte y sus <strong>Cartas Quemadas</strong> y baraja sus mazos. ${textoAgotamiento}</p></div>`
    });
  }

  /* ======================================================================== */
  /*  5b. AGOTAMIENTO (v0.12.0)                                                */
  /* ======================================================================== */

  /**
   * Acota un valor de Agotamiento a la escala del sistema (0..AGOTAMIENTO_MAXIMO).
   * @param {number} valor
   * @returns {number}
   */
  static limitarAgotamiento(valor) {
    return Math.max(0, Math.min(SISTEMA_CONFIG.AGOTAMIENTO_MAXIMO, Math.floor(Number(valor) || 0)));
  }

  /**
   * Suma (o resta) puntos de Agotamiento, acotando a 0..8. Las consecuencias del nuevo
   * nivel se anuncian y aplican en `_alCambiarAgotamiento` (hooks pre/updateActor).
   * @param {number} delta - Puntos a sumar (negativo = recuperar).
   * @returns {Promise<number>} Nuevo nivel de Agotamiento.
   */
  async cambiarAgotamiento(delta) {
    const actual = Number(this.system.cansancio?.value) || 0;
    const nuevo = SistemaActor.limitarAgotamiento(actual + (Number(delta) || 0));
    if (nuevo !== actual) await this.update({ "system.cansancio.value": nuevo });
    return nuevo;
  }

  /**
   * Agotamiento 6+: el resultado de todas las tiradas se reduce a la mitad.
   * @returns {boolean}
   */
  _tiradasAMitadPorAgotamiento() {
    return Boolean(this.system.agotamiento?.efectos?.tiradasMitad);
  }

  /**
   * Reacciona a un cambio de nivel de Agotamiento (llamado desde el hook `updateActor`
   * solo en el cliente que hizo el cambio):
   * - Al subir: anuncia en el chat las consecuencias nuevas.
   * - Nivel 3+: recorta la Salud actual a la nueva Salud Máxima.
   * - Nivel 5+: si hay más de un Trinket en juego, pide elegir cuál conservar y quema el resto.
   * - Nivel 8: el personaje muere (estado "dead" en sus Tokens y aviso en el chat).
   * @param {number} anterior - Nivel antes del cambio.
   * @param {number} nuevo - Nivel después del cambio.
   * @returns {Promise<void>}
   */
  async _alCambiarAgotamiento(anterior, nuevo) {
    this.prepareData();
    const estado = estadoAgotamiento(nuevo);

    if (nuevo > anterior) {
      const nuevas = SISTEMA_CONFIG.AGOTAMIENTO_NIVELES.filter(e => e.nivel > anterior && e.nivel <= nuevo);
      const lista = nuevas.map(e => `<li><i class="fa-solid ${e.icono}"></i> <strong>Nv. ${e.nivel}:</strong> ${e.texto}</li>`).join("");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `
          <div class="cyd-alerta-cansancio">
            <h4><i class="fa-solid fa-hourglass-half"></i> Agotamiento ${estado.nivel}/${estado.maximo}</h4>
            <p><strong>${this.name}</strong> sufre nuevas consecuencias (acumulativas):</p>
            <ul>${lista}</ul>
          </div>
        `
      });
    }

    // Nivel 3+: la Salud actual no puede superar la nueva Salud Máxima.
    const saludMax = Number(this.system.salud?.maxTotal) || 1;
    if ((Number(this.system.salud?.value) || 0) > saludMax) {
      await this.update({ "system.salud.value": saludMax });
    }

    if (estado.efectos.unTrinket) await this._reducirTrinketsPorAgotamiento();

    if (estado.muerto && anterior < SISTEMA_CONFIG.AGOTAMIENTO_MAXIMO) {
      try {
        await this.toggleStatusEffect("dead", { active: true, overlay: true });
      } catch (error) {
        console.warn("[Cartas y Dados] No se pudo aplicar el estado 'dead' por Agotamiento", error);
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="cyd-alerta-cansancio"><h4><i class="fa-solid fa-skull"></i> Muerte por Agotamiento</h4><p><strong>${this.name}</strong> alcanza el Agotamiento ${estado.maximo} y muere.</p></div>`
      });
    }
  }

  /**
   * Agotamiento 5+: deja un único Trinket en juego. Si hay varios, el usuario elige con
   * un DialogV2 cuál conservar; el resto se queman (`enJuego → quemadas`). Si cierra el
   * diálogo se conserva el primero.
   * @returns {Promise<void>}
   */
  async _reducirTrinketsPorAgotamiento() {
    const { enJuego, quemadas } = this.system.pilasDocumentos ?? {};
    if (!enJuego || !quemadas || enJuego.cards.size <= 1) return;

    const trinkets = enJuego.cards.contents;
    const elegido = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 440, lista: true }),
      window: { title: `Agotamiento: ${this.name}`, icon: "fa-solid fa-hourglass-half" },
      content: `<p>Con Agotamiento 5 o más solo puedes tener <strong>un Trinket activo</strong>. Elige cuál conservas; el resto se queman:</p>`,
      buttons: trinkets.map((t, i) => ({
        action: t.id,
        label: `Conservar ${nombreVisibleCarta(t)} (Nv. ${Number(t.system?.nivel) || 1})`,
        icon: "fa-solid fa-gem",
        default: i === 0,
        callback: () => t.id
      })),
      rejectClose: false
    }) ?? trinkets[0].id;

    const quemados = [];
    for (const t of trinkets) {
      if (t.id === elegido) continue;
      quemados.push(nombreVisibleCarta(t));
      await this._moverCartaEntrePilas(enJuego, quemadas, t.id);
    }
    this.prepareData();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-fire"></i><p><strong>${this.name}</strong> no puede mantener tantos Trinkets por el Agotamiento y quema: <strong>${quemados.join(", ")}</strong>.</p></div>`
    });
  }

  /* ======================================================================== */
  /*  6. RASTREO EXACTO DE TRINKETS POR ID ÚNICO (`sourceCardId`)             */
  /* ======================================================================== */

  /**
   * Localiza el estado exacto de cada Trinket del jugador comparando primero su `sourceCardId`
   * único y llevando un registro de cartas ya emparejadas (`idsEmparejados`) para que dos Trinkets
   * nunca puedan confundirse entre Descarte y Quemadas.
   */
  obtenerResumenTrinkets() {
    const { trinkets, mano, enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!trinkets) return [];

    const idsEmparejados = new Set();

    /**
     * Busca dentro de una pila activa la copia que corresponde a `trinketOriginal`.
     */
    const buscarCopiaEnPila = (pila, trinketOriginal) => {
      if (!pila) return null;
      // 1. Búsqueda exacta por flag `sourceCardId`
      let encontrada = pila.cards.find(
        c => !idsEmparejados.has(c.id) && c.getFlag("cartas-y-dados", "sourceCardId") === trinketOriginal.id
      );
      // 2. Fallback seguro para cartas creadas antes de esta actualización
      if (!encontrada) {
        encontrada = pila.cards.find(
          c => !idsEmparejados.has(c.id) && !c.getFlag("cartas-y-dados", "sourceCardId") && c.name === trinketOriginal.name
        );
      }
      if (encontrada) idsEmparejados.add(encontrada.id);
      return encontrada;
    };

    return trinkets.cards.map(trinketOriginal => {
      let estado = "disponible";
      let etiquetaEstado = "En Reserva";
      let idEnPilaActual = trinketOriginal.id;

      if (trinketOriginal.drawn) {
        const enMesa = buscarCopiaEnPila(enJuego, trinketOriginal);
        const enLaMano = !enMesa ? buscarCopiaEnPila(mano, trinketOriginal) : null;
        const enElDescarte = !enMesa && !enLaMano ? buscarCopiaEnPila(descarte, trinketOriginal) : null;
        const enQuemadas = !enMesa && !enLaMano && !enElDescarte ? buscarCopiaEnPila(quemadas, trinketOriginal) : null;

        if (enMesa) {
          estado = "enJuego";
          etiquetaEstado = "Activo en Juego";
          idEnPilaActual = enMesa.id;
        } else if (enLaMano) {
          estado = "enMano";
          etiquetaEstado = "En Mano";
          idEnPilaActual = enLaMano.id;
        } else if (enElDescarte) {
          estado = "descartado";
          etiquetaEstado = "Descartado";
          idEnPilaActual = enElDescarte.id;
        } else if (enQuemadas) {
          estado = "quemado";
          etiquetaEstado = "Quemado";
          idEnPilaActual = enQuemadas.id;
        }
      }

      return {
        idOriginal: trinketOriginal.id,
        idEnPilaActual,
        nombre: nombreVisibleCarta(trinketOriginal),
        img: trinketOriginal.img,
        estado,
        etiquetaEstado,
        // Los Trinkets ya no tienen palo ni dado: su escala es su Nivel (v0.8.4)
        nivel: Number(trinketOriginal.system?.nivel) || 1,
        bonoDefensaEnJuego: Number(trinketOriginal.system.bonoDefensaEnJuego) || 0,
        efectoPermanente: trinketOriginal.system.efectoPermanente,
        efectoAlJugar: trinketOriginal.system.efectoAlJugar
      };
    });
  }
  
  /* ======================================================================== */
  /*  6b. RASGOS RACIALES (v0.13.0)                                            */
  /* ======================================================================== */

  /**
   * Datos necesarios para repetir una tirada con «Espera un momento» (Humanos). Se guardan en
   * `flags.cartas-y-dados.repeticion` del mensaje (ver `publicarTirada`). Solo se generan si el
   * Actor tiene el rasgo, para no cargar flags en el resto de mensajes.
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada - Tirada original.
   * @param {Object} datos
   * @param {string} datos.titulo - Nombre de la carta, habilidad o acción.
   * @param {boolean} [datos.esAtaque=false]
   * @param {string} [datos.etiquetaDificultad="Dificultad del Master"]
   * @returns {Object|null}
   */
  _datosRepeticionTirada(tirada, { titulo, esAtaque = false, etiquetaDificultad = "Dificultad del Master" }) {
    if (!tieneRasgoRacial(this, "esperaUnMomento")) return null;
    const objetivo = esAtaque ? game.user.targets.first() ?? null : null;
    return {
      actorUuid: this.uuid,
      titulo: String(titulo ?? "Tirada"),
      cantidadDados: tirada.cantidadDados,
      tipoDado: tirada.tipoDado,
      bono: tirada.bono,
      esAtaque: Boolean(esAtaque),
      etiquetaDificultad,
      objetivoTokenUuid: objetivo?.document?.uuid ?? null,
      totalAnterior: tirada.total
    };
  }

  /**
   * Humanos · «Espera un momento»: repite una tirada ya publicada y usa el nuevo resultado
   * (1 vez por descanso). Vuelve a resolver contra el mismo objetivo o contra la Dificultad
   * actual del Master, publica la nueva tirada y marca el rasgo como usado.
   * @param {ChatMessage} mensaje - Mensaje con `flags.cartas-y-dados.repeticion`.
   * @returns {Promise<import("../dados.mjs").ResultadoTiradaSistema|null>}
   */
  async repetirTiradaEsperaUnMomento(mensaje) {
    const datos = mensaje?.getFlag("cartas-y-dados", "repeticion");
    if (!datos) return null;
    if (!tieneRasgoRacial(this, "esperaUnMomento")) return null;
    if (this.system.rasgosRaza?.esperaUnMomentoUsado) {
      ui.notifications.warn(`${this.name} ya ha usado «Espera un momento» desde su último descanso.`);
      return null;
    }
    if (mensaje.getFlag("cartas-y-dados", "repetida")) {
      ui.notifications.warn("Esta tirada ya se ha repetido.");
      return null;
    }

    // Marcar el uso antes de tirar para evitar dobles clics.
    await this.update({ "system.rasgosRaza.esperaUnMomentoUsado": true });
    if (mensaje.isOwner) await mensaje.setFlag("cartas-y-dados", "repetida", true);

    const tirada = await tirarDadosSistema({
      cantidadDados: datos.cantidadDados, tipoDado: datos.tipoDado, bono: datos.bono,
      rollData: this.getRollData(), mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento()
    });
    const tokenObjetivo = datos.objetivoTokenUuid ? (fromUuidSync(datos.objetivoTokenUuid) ?? null) : null;
    const resolucion = this._htmlResolucionTirada(tirada, datos.esAtaque, datos.etiquetaDificultad, { tokenObjetivo });

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-rotate-left"></i> Espera un momento · ${datos.titulo}</h3>
        <p><small>Rasgo racial (Humanos): repite la tirada y usa el nuevo resultado. Resultado anterior: <strong>${datos.totalAnterior}</strong>.</small></p>
        ${tirada.html}
        ${resolucion.publico}
      </div>
    `;
    await publicarTirada(tirada, {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: saborChat,
      htmlMaster: resolucion.master
    });
    return tirada;
  }

  /**
   * Sierpes · «Tradición alquímica»: una vez al día prepara un ungüento que cura tantos
   * puntos de Salud como su nivel, a sí misma o a la criatura voluntaria marcada como objetivo.
   * Si el usuario no puede modificar al objetivo, el chat lleva un botón para que el Master
   * aplique la curación (`.cyd-btn-aplicar-curacion`, ver `sistema.mjs`).
   * @returns {Promise<boolean>} true si se usó.
   */
  async usarTradicionAlquimica() {
    if (!tieneRasgoRacial(this, "tradicionAlquimica")) return false;
    if (this.system.rasgosRaza?.alquimiaUsada) {
      ui.notifications.warn(`${this.name} ya ha preparado su ungüento hoy (se recarga con un descanso cómodo).`);
      return false;
    }

    const curacion = Math.max(1, Number(this.system.nivelEfectivo) || 1);
    const tokenObjetivo = game.user.targets.first() ?? null;
    const actorObjetivo = tokenObjetivo?.actor ?? null;
    const botones = [
      { action: "propio", label: `En ${this.name} (+${curacion} Salud)`, icon: "fa-solid fa-flask", default: true, callback: () => "propio" }
    ];
    if (actorObjetivo && actorObjetivo !== this) {
      botones.push({ action: "objetivo", label: `En ${tokenObjetivo.name} (+${curacion} Salud)`, icon: "fa-solid fa-crosshairs", callback: () => "objetivo" });
    }
    botones.push({ action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => "cancelar" });

    const eleccion = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 460, lista: true }),
      window: { title: "Tradición alquímica", icon: "fa-solid fa-flask" },
      content: `<p>Con los materiales que encuentra cerca, <strong>${this.name}</strong> prepara un ungüento que cura <strong>${curacion}</strong> punto(s) de Salud (su nivel). Debe usarse de inmediato en sí misma o en una criatura voluntaria (marca su Token con <strong>T</strong>).</p>`,
      buttons: botones,
      rejectClose: false
    });
    if (eleccion !== "propio" && eleccion !== "objetivo") return false;

    const destino = eleccion === "objetivo" ? actorObjetivo : this;
    const nombreDestino = eleccion === "objetivo" ? tokenObjetivo.name : this.name;
    await this.update({ "system.rasgosRaza.alquimiaUsada": true });

    let lineaResultado;
    if (destino.isOwner) {
      destino.prepareData();
      const antes = Number(destino.system.salud?.value) || 0;
      const maximo = Number(destino.system.salud?.maxTotal) || antes;
      const despues = Math.min(maximo, antes + curacion);
      await destino.update({ "system.salud.value": despues });
      lineaResultado = `<p><i class="fa-solid fa-heart-pulse"></i> <strong>${nombreDestino}</strong> recupera <strong>${despues - antes}</strong> de Salud (${antes} → ${despues}).</p>`;
    } else {
      lineaResultado = `
        <p><i class="fa-solid fa-heart-pulse"></i> Cura <strong>${curacion}</strong> de Salud a <strong>${nombreDestino}</strong> (lo aplica el Master).</p>
        <button type="button" class="cyd-btn-aplicar-curacion" data-actor-uuid="${destino.uuid}" data-curacion="${curacion}">
          <i class="fa-solid fa-heart-pulse"></i> Aplicar ${curacion} de Curación a ${nombreDestino}
        </button>`;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-flask"></i> Tradición alquímica</h3>
          <p><small>Rasgo racial (Sierpes), 1 vez al día.</small></p>
          ${lineaResultado}
        </div>
      `
    });
    return true;
  }

  /**
   * Aplica la visión en la oscuridad de la raza (Mandrágora, 20 m) al Token Prototipo y a los
   * Tokens vinculados que el usuario pueda modificar. Sin efecto en razas sin `visionOscuridad`.
   * @returns {Promise<void>}
   */
  async _aplicarVisionRacial() {
    const metros = Number(razaBaseDeActor(this)?.config.visionOscuridad) || 0;
    if (metros <= 0 || !this.isOwner) return;
    const modo = CONFIG.Canvas?.visionModes?.darkvision ? "darkvision" : "basic";
    const sight = { enabled: true, range: metros, visionMode: modo };
    try {
      await this.update({ "prototypeToken.sight": sight });
      for (const token of this.getActiveTokens(true, true)) {
        if (token.isOwner) await token.update({ sight });
      }
    } catch (error) {
      console.warn("Cartas y Dados | No se pudo aplicar la visión racial al Token:", error);
    }
  }

  /* ======================================================================== */
  /*  7. ATAQUES Y ACCIONES DE PNJ / CRIATURA (SIN NECESIDAD DE MAZO)         */
  /* ======================================================================== */

  /**
   * Realiza una tirada directa de Criatura/PNJ (o habilidad activable) usando
   * una característica (`fisico`, `consciencia`, `social`, `misticismo`) y un tipo de dado (`d4`-`d12`),
   * comparando automáticamente contra la Defensa del objetivo seleccionado (`Ataque - Defensa`).
   *
   * @param {Object} opciones
   * @param {string} opciones.titulo - Nombre del ataque o acción.
   * @param {string} [opciones.caracteristica="fisico"] - Característica que define el número de dados.
   * @param {string} [opciones.tipoDado="d6"] - Tamaño del dado ('d4', 'd6', 'd8', 'd10', 'd12').
   * @param {number} [opciones.bonoTirada=0] - Bonificador plano sumado al total.
   * @param {boolean} [opciones.esAtaque=true] - Si es true, resta la Defensa del objetivo.
   * @param {string} [opciones.descripcion=""] - Texto descriptivo para mostrar en el chat.
   */
  async realizarAccionRapida({
    titulo = "Ataque",
    caracteristica = "fisico",
    tipoDado = "d6",
    bonoTirada = 0,
    esAtaque = true,
    descripcion = ""
  } = {}) {
    this.prepareData();
    const cantidadDados = this.system.caracteristicasTotales?.[caracteristica]
      ?? this.system.caracteristicas?.[caracteristica]
      ?? 1;

    const bono = Number(bonoTirada) || 0;
    const tirada = await tirarDadosSistema({
      cantidadDados, tipoDado, bono, rollData: this.getRollData(),
      mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento()
    });
    const resolucion = this._htmlResolucionTirada(tirada, esAtaque, "Dificultad");
    const bloqueResolucionHtml = tirada.html + resolucion.publico;
    const htmlMaster = resolucion.master;

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3>${esAtaque ? '<i class="fa-solid fa-crosshairs"></i>' : '<i class="fa-solid fa-bolt"></i>'} ${titulo}</h3>
        <p><strong>Atributo:</strong> ${caracteristica.toUpperCase()} (${cantidadDados}${tipoDado})</p>
        ${bloqueResolucionHtml}
        ${descripcion ? `<div class="cyd-efecto">${descripcion}</div>` : ""}
      </div>
    `;

    await publicarTirada(tirada, {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: saborChat,
      htmlMaster,
      repeticion: this._datosRepeticionTirada(tirada, { titulo, esAtaque, etiquetaDificultad: "Dificultad" })
    });

    return tirada;
  }

  /**
   * Ejecuta un Item de tipo 'habilidad' poseído por el Actor (PJ o PNJ).
   * - PJ, o PNJ con Mazo de Jefe activo: la habilidad activable exige consumir una
   *   Carta de Misticismo (Copas) de la mano (`system.palo === "copas"`); el dado lo
   *   define la carta y esta se mueve obligatoriamente de `mano` a `quemadas`.
   * - PNJ SIN Mazo de Jefe: se usa sin carta; el dado es el de Misticismo del PNJ
   *   (`system.dadosCaracteristicas.misticismo`).
   * Si `requiereTirada === false` se aplica el efecto directamente sin lanzar dados;
   * en caso contrario se lanzan `caracteristicasTotales.misticismo` dados.
   * @param {string} itemId - ID del Item dentro de `this.items`.
   * @returns {Promise<import("../dados.mjs").ResultadoTiradaSistema|null>} Tirada (con Crítico/Pifia) o null.
   */
  async usarHabilidad(itemId) {
    const item = this.items.get(itemId);
    if (!item) return null;

    // Habilidad pasiva / no activable: solo se publica su efecto en el chat.
    if (!item.system.esActivable) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="cyd-carta-jugada"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.name}</h3><div>${item.system.descripcion || ""}</div></div>`
      });
      return null;
    }

    const pilas = this.system.pilasDocumentos ?? {};
    const mano = pilas.mano ?? null;
    const quemadas = pilas.quemadas ?? null;

    // Un PNJ sin Mazo de Jefe (mismo criterio que `HojaPnjActor`: mazo, mano, descarte
    // y quemadas vinculadas) usa sus habilidades sin consumir carta de Misticismo.
    const tieneMazoJefe = Boolean(pilas.mazo && pilas.mano && pilas.descarte && pilas.quemadas);
    const requiereCarta = this.type !== "pnj" || tieneMazoJefe;

    /** @type {Card|null} Carta de Misticismo consumida (null si no se requiere carta). */
    let cartaElegida = null;
    let numero = null;
    let tipoDado;

    if (requiereCarta) {
      if (!mano || !quemadas) {
        ui.notifications.warn("Tus pilas de cartas no están inicializadas. Inicialízalas antes de usar habilidades.");
        return null;
      }

      // Exigir al menos una Carta de Acción de Misticismo (Copas) en la mano.
      const cartasMisticismo = mano.cards.contents.filter(
        c => c.type === "accion" && c.system.palo === "copas"
      );
      if (cartasMisticismo.length === 0) {
        ui.notifications.warn(
          "Necesitas tener al menos una carta de Misticismo (Copas) en la mano para usar una habilidad."
        );
        return null;
      }

      cartaElegida = await this._elegirCartaMisticismo(cartasMisticismo, item.name);
      if (!cartaElegida) return null; // El jugador canceló la selección.

      numero = Number(cartaElegida.system.numero) || 1;
      tipoDado = cartaElegida.system.tipoDado || SISTEMA_CONFIG.dadoPorNumeroCarta[numero] || "d6";
    } else {
      // PNJ sin Mazo de Jefe: el dado de Misticismo configurado en su ficha.
      tipoDado = this.system.dadosCaracteristicas?.misticismo || "d6";
    }

    // `Number(undefined)` es NaN (no null), por eso se usa `||` en lugar de `??`.
    const cantidadDados =
      Number(this.system.caracteristicasTotales?.misticismo) ||
      Number(this.system.caracteristicas?.misticismo) ||
      1;
    const bonoTirada = Number(item.system.bonoTirada) || 0;
    const esAtaque = Boolean(item.system.esAtaque);
    const nombreCarta = cartaElegida ? nombreVisibleCarta(cartaElegida) : "";

    // Líneas de chat que solo aparecen si se consumió una carta de Misticismo.
    const lineaCartaUsada = cartaElegida
      ? `<p><i class="fa-solid fa-moon"></i> <strong>Carta de Misticismo:</strong> ${nombreCarta} <small>MIST · ${tipoDado} (Valor ${numero})</small></p>`
      : `<p><small>Sin Mazo de Jefe: habilidad usada sin consumir carta de Misticismo.</small></p>`;
    const lineaQuemada = cartaElegida
      ? `<p class="cyd-nota-quemada"><small><i class="fa-solid fa-fire"></i> La carta <strong>${nombreCarta}</strong> fue <strong>quemada</strong> y enviada a Cartas Quemadas.</small></p>`
      : "";

    // Habilidad sin tirada: efecto directo, consumiendo la carta de Misticismo.
    if (item.system.requiereTirada === false) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `
          <div class="cyd-carta-jugada">
            <h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.name}</h3>
            ${lineaCartaUsada}
            <p><strong>Efecto:</strong> aplicado directamente sin tirada de dados.</p>
            ${item.system.descripcion ? `<div class="cyd-efecto">${item.system.descripcion}</div>` : ""}
            ${lineaQuemada}
          </div>
        `
      });
      // Automatización (curación, cambio de cansancio y robo de cartas) si está configurada.
      await this._aplicarAutomatizacionHabilidad(item);

      if (cartaElegida) await this._moverCartaEntrePilas(mano, quemadas, cartaElegida.id);
      this.prepareData();
      if (this.sheet?.rendered) this.sheet.render();
      return null;
    }

    // Habilidad con tirada: XdY de Misticismo.
    const bono = bonoTirada;
    const tirada = await tirarDadosSistema({
      cantidadDados, tipoDado, bono, rollData: this.getRollData(),
      mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento()
    });
    const resolucion = this._htmlResolucionTirada(tirada, esAtaque, "Dificultad");
    const bloqueResolucionHtml = resolucion.publico;
    const htmlMaster = resolucion.master;

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.name}</h3>
        ${lineaCartaUsada}
        <p><strong>Tirada:</strong> Misticismo × ${tipoDado}</p>
        ${tirada.html}
        ${bloqueResolucionHtml}
        ${item.system.descripcion ? `<div class="cyd-efecto">${item.system.descripcion}</div>` : ""}
        ${lineaQuemada}
      </div>
    `;

    await publicarTirada(tirada, {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: saborChat,
      htmlMaster,
      repeticion: this._datosRepeticionTirada(tirada, { titulo: item.name, esAtaque, etiquetaDificultad: "Dificultad" })
    });

    // Quemar la carta usada: mano -> quemadas (motor propio de pilas, sin Cards#pass()).
    if (cartaElegida) await this._moverCartaEntrePilas(mano, quemadas, cartaElegida.id);

    // Automatización (curación, cambio de cansancio y robo de cartas) si está configurada.
    await this._aplicarAutomatizacionHabilidad(item);

    this.prepareData();
    if (this.sheet?.rendered) this.sheet.render();
    return tirada;
  }

  /**
   * Aplica los efectos de automatización de una Habilidad (curación, cambio de cansancio
   * y robo de cartas) cuando están configurados en `item.system.automatizacion`.
   * @param {Item} item - Item de tipo "habilidad" activado.
   * @returns {Promise<void>}
   */
  async _aplicarAutomatizacionHabilidad(item) {
    const automatizacion = item.system.automatizacion ?? {};
    const curacion = Number(automatizacion.curacion) || 0;
    const cambioCansancio = Number(automatizacion.cambioCansancio) || 0;
    const robarCartas = Number(automatizacion.robarCartas) || 0;

    if (curacion !== 0) {
      // Tope de curación = Salud Máxima Total (Base + Físico + Bonos), igual que en jugarCarta.
      const saludActual = Number(this.system.salud?.value) || 0;
      const saludMax = Number(this.system.salud?.maxTotal) || Number(this.system.salud?.max) || saludActual;
      const nuevaSalud = Math.max(0, Math.min(saludMax, saludActual + curacion));
      await this.update({ "system.salud.value": nuevaSalud });
    }

    if (cambioCansancio !== 0) {
      await this.cambiarAgotamiento(cambioCansancio);
    }

    if (robarCartas > 0) {
      await this.robarCantidadCartas(robarCartas);
    }
  }

  /**
   * Muestra un DialogV2 para elegir qué Carta de Misticismo (Copas) de la mano
   * se consumirá al activar una habilidad.
   * @param {Card[]} cartas - Cartas de Misticismo disponibles en la mano del Actor.
   * @param {string} nombreHabilidad - Nombre de la habilidad que se va a activar.
   * @returns {Card|null} La carta elegida o null si el jugador canceló.
   */
  async _elegirCartaMisticismo(cartas, nombreHabilidad) {
    const botones = cartas.map(c => {
      const numero = Number(c.system.numero) || 1;
      const tipoDado = SISTEMA_CONFIG.dadoPorNumeroCarta[numero] ?? c.system.tipoDado ?? "d6";
      return {
        action: c.id,
        label: `${nombreVisibleCarta(c)} — MIST ${numero} (${tipoDado})`,
        callback: () => c.id
      };
    });
    botones.push({ action: "cancelar", label: "Cancelar", callback: () => null });

    const seleccion = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 440, lista: true }),
      window: { title: `Usar habilidad: ${nombreHabilidad}` },
      content: `<p>Selecciona la Carta de Misticismo (Copas) de tu mano que se consumirá al activar <strong>${nombreHabilidad}</strong>:</p>`,
      buttons: botones,
      rejectClose: false
    });

    if (!seleccion) return null;
    const cartaElegida = this.system.pilasDocumentos?.mano?.cards.get(seleccion) ?? null;
    return cartaElegida;
  }

  /**
   * @deprecated Usar `usarHabilidad(itemId)`. Se mantiene para retrocompatibilidad
   * con cualquier llamador externo que aún invoque el nombre anterior.
   * @param {string} itemId - ID del Item dentro de `this.items`.
   * @returns {Promise<import("../dados.mjs").ResultadoTiradaSistema|null>} Tirada (con Crítico/Pifia) o null.
   */
  async usarHabilidadItem(itemId) {
    return this.usarHabilidad(itemId);
  }
}

/**
 * Pregunta al usuario qué tipo de descanso se realiza (v0.12.0). Solo un descanso cómodo
 * en un lugar sin amenazas recupera 1 punto de Agotamiento (máximo 1 por día).
 * @param {string} quien - Nombre del Actor o "el grupo", para el texto del diálogo.
 * @returns {Promise<{comodo: boolean}|null>} Opciones para `realizarDescanso`, o null si se cancela.
 */
export async function preguntarTipoDescanso(quien) {
  const respuesta = await foundry.applications.api.DialogV2.wait({
    ...opcionesDialogoSistema({ width: 460, lista: true }),
    window: { title: "Descanso", icon: "fa-solid fa-campground" },
    content: `<p>¿Cómo descansa <strong>${quien}</strong>? Todas las cartas vuelven a sus mazos. Solo un descanso cómodo en un lugar donde no se sienta amenazado recupera <strong>1 punto de Agotamiento</strong> (máximo 1 por día).</p>`,
    buttons: [
      { action: "comodo", label: "Descanso cómodo y seguro (−1 Agotamiento)", icon: "fa-solid fa-campground", default: true, callback: () => "comodo" },
      { action: "incomodo", label: "Descanso sin recuperar Agotamiento", icon: "fa-solid fa-tent", callback: () => "incomodo" },
      { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => "cancelar" }
    ],
    rejectClose: false
  });
  // DialogV2.wait devuelve el nombre de la acción si el callback da null/undefined, y null al
  // cerrar la ventana: solo "comodo" e "incomodo" son respuestas válidas.
  if (respuesta !== "comodo" && respuesta !== "incomodo") return null;
  return { comodo: respuesta === "comodo" };
}
