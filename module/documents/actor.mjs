/**
 * @file actor.mjs
 * @description Clase extendida de Actor para Foundry VTT v14.
 * Implementa trazabilidad única por carta mediante `flags.cartas-y-dados.sourceCardId`
 * para garantizar que cada Carta de Acción y cada Trinket se mueva de forma independiente
 * entre Mazo, Mano, En Juego, Descarte y Quemadas, recalculando la Defensa en tiempo real.
 */

import {
  SISTEMA_CONFIG, abalorioDeTrinket, abreviadoPalo, claveClaseDeItem, dadoReducidoMalDeOjo, describirPackCartas,
  efectoPermanenteAbalorio, esAbalorioEterno, especializacionDeClase, estadoAgotamiento, generarNombreMisticoUnico, nombreCaracteristica,
  nombreEstadoElemento, nombreVisibleCarta, opcionesArtilugio, opcionesTrinketsClase, razaBaseDeActor, tieneRasgoRacial,
  valorCarta
} from "../config.mjs";
import { opcionesDialogoSistema } from "../applications/ventana-dinamica.mjs";
import { combinarTiradas, enviarMensajeSoloMaster, htmlResolucionDificultad, publicarTirada, tirarDadosSistema } from "../dados.mjs";
import { obtenerOCrearCarpeta } from "../carpetas.mjs";

export class SistemaActor extends Actor {

  /* ======================================================================== */
  /*  1. INICIALIZACIÓN Y GENERADOR DE MAZO INICIAL                           */
  /* ======================================================================== */

  /**
   * Crea (si faltan) las 6 pilas de cartas del Actor dentro de una carpeta `Cards` con su nombre.
   * (v0.17.1) Las llamadas simultáneas para el mismo Actor (doble clic, asistente + botón) esperan
   * a la misma inicialización, y la carpeta se obtiene con `obtenerOCrearCarpeta` para no duplicarla.
   * @returns {Promise<Object>} `system.pilasDocumentos` tras la inicialización.
   */
  async inicializarPilasDeJugador() {
    if (this._promesaInicializarPilas) return this._promesaInicializarPilas;
    this._promesaInicializarPilas = this._inicializarPilasDeJugador()
      .finally(() => { this._promesaInicializarPilas = null; });
    return this._promesaInicializarPilas;
  }

  /**
   * Implementación de `inicializarPilasDeJugador` (no llamar directamente).
   * @returns {Promise<Object>}
   * @private
   */
  async _inicializarPilasDeJugador() {
    const carpeta = await obtenerOCrearCarpeta("Cards", this.name, "#2b3a4a");

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
   * @param {Object} [opciones]
   * @param {string|null} [opciones.artilugio=null] - (v0.16.0) Clave de `SISTEMA_CONFIG.ARTILUGIOS` si el
   *   Trinket elegido es el «Artilugio de primera» (se guarda en `flags.cartas-y-dados.artilugio`).
   */
  async inicializarPersonajeConClase(claveClase, nombreTrinket, claveRaza = null, { artilugio = null } = {}) {
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
    // (v0.15.0) Si el Trinket es un abalorio de la clase, se guarda su clave (efecto automatizado
    // mientras esté En Juego) y su texto como efecto permanente.
    const opcionesTrinket = opcionesTrinketsClase(configClase);
    const trinketInicial = nombreTrinket || opcionesTrinket[0]?.nombre || "Vasija vacía";
    const abalorio = opcionesTrinket.find(o => o.nombre === trinketInicial) ?? null;
    // (v0.16.0) Artilugio de primera: objeto mágico elegido (el primero si no se indica).
    const claveArtilugio = abalorio?.artilugios
      ? (SISTEMA_CONFIG.ARTILUGIOS[artilugio] ? artilugio : Object.keys(SISTEMA_CONFIG.ARTILUGIOS)[0])
      : null;
    if (trinkets.cards.size === 0) {
      const payloadTrinket = this._normalizarPayloadCarta({
        name: trinketInicial,
        type: "trinket",
        system: {
          nivel: 1, realizaTirada: false, esAtaque: false, bonoDefensaEnJuego: 0,
          efectoPermanente: efectoPermanenteAbalorio(abalorio, claveArtilugio)
        },
        ...(abalorio?.clave ? { flags: { "cartas-y-dados": {
          abalorio: abalorio.clave,
          ...(claveArtilugio ? { artilugio: claveArtilugio } : {})
        } } } : {})
      });
      await trinkets.createEmbeddedDocuments("Card", [payloadTrinket]);
    }
    // (v0.15.0) Un Abalorio Eterno (Compañero eterno) empieza directamente En Juego.
    await this._asegurarAbaloriosEternos();

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
   * (v0.16.0) `artilugio`: si el personaje tiene el «Artilugio de primera», `{actual, opciones}` para
   * cambiar su objeto mágico (una vez por subida de nivel); null si no lo tiene.
   * (v0.18.0) Se suman las recompensas de la `progresion` de la especialización: la ya elegida o, en el
   * nivel en que se elige, la indicada (o la única que haya). Nuevas recompensas: `caracteristica`,
   * `manoMaxima`, `abalorios`, `pasivas` y `pendientes` (ver `SISTEMA_CONFIG.CLASES_BASE`).
   * @param {Object} [opciones]
   * @param {string|null} [opciones.especializacion=null] - Clave de la especialización a elegir en este nivel.
   * @returns {{itemClase: Item, claveClase: string, configClase: object, nivelActual: number,
   *   nivelDestino: number, habilidades: object[], packs: object[][], especializaciones: object[],
   *   especializacionActual: object|null, especializacionRecompensas: object|null,
   *   caracteristica: boolean, manoMaxima: number, abalorios: object[], pasivas: object[], pendientes: string[],
   *   artilugio: {actual: string|null, opciones: object[]}|null}|null}
   *   null si el Actor no tiene Clase base reconocida o no hay progresión definida para el siguiente nivel.
   */
  obtenerOpcionesSubidaNivel({ especializacion = null } = {}) {
    const itemClase = this.items.find(i => i.type === "clase");
    const claveClase = claveClaseDeItem(itemClase);
    const configClase = claveClase ? SISTEMA_CONFIG.CLASES_BASE[claveClase] : null;
    if (!configClase) return null;
    const nivelActual = Number(itemClase.system.nivel) || 1;
    const nivelDestino = nivelActual + 1;
    const recompensasClase = configClase.progresion?.[nivelDestino] ?? null;
    const especializaciones = recompensasClase?.especializaciones ?? [];
    const especializacionActual = especializacionDeClase(itemClase, configClase);
    // Especialización cuyas recompensas se suman: la elegida antes o la que se elige ahora.
    const especializacionRecompensas = especializacionActual
      ?? especializaciones.find(e => e.clave === especializacion)
      ?? (especializaciones.length === 1 ? especializaciones[0] : null);
    const recompensasEsp = especializacionRecompensas?.progresion?.[nivelDestino] ?? null;
    if (!recompensasClase && !recompensasEsp) return null;
    const lista = campo => [...(recompensasClase?.[campo] ?? []), ...(recompensasEsp?.[campo] ?? [])];
    return {
      itemClase, claveClase, configClase, nivelActual, nivelDestino,
      habilidades: lista("habilidades"),
      packs: lista("packs"),
      especializaciones,
      especializacionActual,
      especializacionRecompensas,
      caracteristica: Boolean(recompensasClase?.caracteristica || recompensasEsp?.caracteristica),
      manoMaxima: (Number(recompensasClase?.manoMaxima) || 0) + (Number(recompensasEsp?.manoMaxima) || 0),
      abalorios: opcionesTrinketsClase({ trinkets: lista("abalorios") }),
      pasivas: lista("pasivas"),
      pendientes: lista("pendientes"),
      artilugio: this._cartasDeAbalorio("artilugio").length
        ? { actual: this.artilugioActual(), opciones: opcionesArtilugio(this.artilugioActual()) }
        : null
    };
  }

  /**
   * Sube el personaje un nivel de Clase aplicando las recompensas elegidas (v0.10.0; v0.15.0 cada
   * recompensa es opcional según `progresion[nivelDestino]`):
   * 1. Crea el Item `habilidad` elegido (origen "clase", activable, MIST) con la descripción de la
   *    clase y sus marcas `valorX`/`sinAccion`.
   * 2. Añade las cartas del pack elegido al Mazo de Juego con nombres místicos únicos y baraja.
   * 3. (v0.15.0) Especialización: se guarda en `system.especializacion` y se crea como Habilidad pasiva.
   * 3b. (v0.18.0) +1 a la característica base elegida, +N Mano Máxima (bonificador `limiteMano` del
   *    Item de Clase), abalorio elegido (Trinket en el Mazo de Trinkets) y Habilidades pasivas.
   * 4. Sube `system.nivel` del Item de Clase y registra la elección en `system.historialNiveles`.
   * 5. Anuncia la subida en el chat (con los beneficios pendientes de definir, que aplica el Master).
   * La confirmación del jugador se pide en la ficha (`HojaPersonajeActor#abrirSubidaNivel`).
   * 6. (v0.16.0) Si se indica `artilugio` distinto del actual, cambia el objeto del «Artilugio de primera».
   * @param {{indiceHabilidad?: number, indicePack?: number, indiceEspecializacion?: number,
   *   especializacion?: string|null, caracteristica?: string|null, indiceAbalorio?: number,
   *   artilugio?: string|null}} eleccion
   *   Índices dentro de las opciones (solo se exigen los de las listas que el nivel ofrece).
   *   `especializacion` (v0.18.0): clave de la especialización (alternativa a `indiceEspecializacion`).
   *   `caracteristica` (v0.18.0): clave (`fisico`, `consciencia`, `social`, `misticismo`) que sube +1.
   * @returns {Promise<boolean>} true si se aplicó la subida.
   */
  async subirDeNivel({
    indiceHabilidad, indicePack, indiceEspecializacion, especializacion: claveEspecializacion = null,
    caracteristica: claveCaracteristica = null, indiceAbalorio, artilugio = null
  } = {}) {
    const previas = this.obtenerOpcionesSubidaNivel();
    if (!previas) {
      ui.notifications.warn(`${this.name} no tiene una subida de nivel disponible.`);
      return false;
    }
    const especializacion = previas.especializaciones.length
      ? (previas.especializaciones.find(e => e.clave === claveEspecializacion)
        ?? previas.especializaciones[indiceEspecializacion] ?? null)
      : null;
    // (v0.18.0) Con la especialización elegida, sus recompensas del nivel se suman a las de la clase.
    const opciones = especializacion
      ? this.obtenerOpcionesSubidaNivel({ especializacion: especializacion.clave })
      : previas;
    const habilidad = opciones.habilidades.length ? opciones.habilidades[indiceHabilidad] ?? null : null;
    const pack = opciones.packs.length ? opciones.packs[indicePack] ?? null : null;
    const abalorio = opciones.abalorios.length ? opciones.abalorios[indiceAbalorio] ?? null : null;
    const caracteristica = opciones.caracteristica && ["fisico", "consciencia", "social", "misticismo"].includes(claveCaracteristica)
      ? claveCaracteristica : null;
    if ((opciones.habilidades.length && !habilidad) || (opciones.packs.length && !pack)
        || (opciones.especializaciones.length && !especializacion)
        || (opciones.abalorios.length && !abalorio) || (opciones.caracteristica && !caracteristica)) {
      ui.notifications.warn("Debes elegir una opción de cada recompensa del nivel.");
      return false;
    }

    const { itemClase, configClase, nivelDestino } = opciones;

    // 1. Habilidad de clase
    if (habilidad) {
      const descripcion = habilidad.texto
        ? `<p>${habilidad.texto}</p>`
        : `<p>Habilidad de ${configClase.nombre} obtenida al alcanzar el Nivel ${nivelDestino}.</p>`;
      await this.createEmbeddedDocuments("Item", [{
        name: habilidad.nombre,
        type: "habilidad",
        system: {
          origenHabilidad: "clase",
          esActivable: true,
          // (v0.17.0) Sellar destino no tiene tirada.
          requiereTirada: habilidad.requiereTirada !== false,
          esAtaque: Boolean(habilidad.esAtaque),
          valorX: Boolean(habilidad.valorX),
          sinAccion: Boolean(habilidad.sinAccion),
          caracteristica: "misticismo",
          descripcion
        },
        flags: { "cartas-y-dados": {
          habilidadDeClase: opciones.claveClase, nivelObtenida: nivelDestino,
          // (v0.15.0) Automatización del valor X (Sanación, Promesa...): ver `_htmlValorX`.
          ...(habilidad.efectoX ? { efectoX: habilidad.efectoX } : {}),
          // (v0.16.0) Descarga elemental: elemento y estado alterado (ver `_usarDescargaElemental`).
          ...(habilidad.elemento ? { elemento: habilidad.elemento } : {})
        } }
      }]);
    }

    // 2. Cartas del pack: nombres místicos únicos frente a todas las cartas del personaje
    const descripcionPack = pack ? describirPackCartas(pack) : "";
    if (pack) {
      // Las cartas nuevas van al Mazo: las pilas deben existir
      if (!this.system.pilasDocumentos?.mazo) await this.inicializarPilasDeJugador();
      const { mazo } = this.system.pilasDocumentos;
      if (!mazo) return false;
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
    }

    // 3. Especialización (v0.15.0): registro en la Clase + Habilidad pasiva con su texto
    if (especializacion) {
      await this.createEmbeddedDocuments("Item", [{
        name: especializacion.nombre,
        type: "habilidad",
        system: {
          origenHabilidad: "clase",
          esActivable: false,
          requiereTirada: false,
          esAtaque: false,
          caracteristica: "misticismo",
          descripcion: `<p>${especializacion.texto ?? `Especialización de ${configClase.nombre}.`}</p>`
        },
        flags: { "cartas-y-dados": {
          habilidadDeClase: opciones.claveClase, nivelObtenida: nivelDestino, especializacion: especializacion.clave
        } }
      }]);
    }

    // 3b. (v0.18.0) Característica, Mano Máxima, abalorio y Habilidades pasivas
    const otros = [];
    if (caracteristica) {
      const actual = Number(this.system.caracteristicas?.[caracteristica]) || 1;
      await this.update({ [`system.caracteristicas.${caracteristica}`]: Math.min(10, actual + 1) });
      otros.push(`+1 ${nombreCaracteristica(caracteristica)}`);
    }
    if (opciones.manoMaxima) otros.push(`+${opciones.manoMaxima} Mano Máxima`);
    if (abalorio) {
      if (!this.system.pilasDocumentos?.trinkets) await this.inicializarPilasDeJugador();
      const trinkets = this.system.pilasDocumentos?.trinkets;
      if (trinkets) {
        await trinkets.createEmbeddedDocuments("Card", [this._normalizarPayloadCarta({
          name: abalorio.nombre,
          type: "trinket",
          system: {
            nivel: nivelDestino, realizaTirada: false, esAtaque: false, bonoDefensaEnJuego: 0,
            efectoPermanente: efectoPermanenteAbalorio(abalorio)
          },
          ...(abalorio.clave ? { flags: { "cartas-y-dados": { abalorio: abalorio.clave } } } : {})
        })]);
        await trinkets.shuffle({ chatNotification: false });
      }
    }
    if (opciones.pasivas.length) {
      await this.createEmbeddedDocuments("Item", opciones.pasivas.map(p => ({
        name: p.nombre,
        type: "habilidad",
        system: {
          origenHabilidad: "clase", esActivable: false, requiereTirada: false, esAtaque: false,
          caracteristica: "misticismo", descripcion: `<p>${p.texto ?? ""}</p>`
        },
        flags: { "cartas-y-dados": { habilidadDeClase: opciones.claveClase, nivelObtenida: nivelDestino, pasiva: p.clave ?? "" } }
      })));
      otros.push(...opciones.pasivas.map(p => p.nombre));
    }

    // 4. Nivel e historial en el Item de Clase
    const datosClase = {
      "system.claveClase": opciones.claveClase,
      "system.nivel": nivelDestino,
      "system.historialNiveles": [
        ...(itemClase.system.historialNiveles ?? []),
        {
          nivel: nivelDestino,
          habilidad: habilidad?.nombre ?? "",
          cartas: descripcionPack,
          especializacion: especializacion?.nombre ?? "",
          abalorio: abalorio?.nombre ?? "",
          otros: otros.join(" · ")
        }
      ]
    };
    if (especializacion) datosClase["system.especializacion"] = especializacion.nombre;
    if (opciones.manoMaxima) {
      datosClase["system.bonificadores.limiteMano"] = (Number(itemClase.system.bonificadores?.limiteMano) || 0) + opciones.manoMaxima;
    }
    await itemClase.update(datosClase);

    // 6. (v0.16.0) Cambio del objeto del Artilugio de primera (una vez por subida de nivel)
    const artilugioAnterior = opciones.artilugio?.actual ?? null;
    const cambiaArtilugio = Boolean(opciones.artilugio && SISTEMA_CONFIG.ARTILUGIOS[artilugio] && artilugio !== artilugioAnterior);
    if (cambiaArtilugio) await this.cambiarArtilugio(artilugio);

    this.prepareData();

    // 5. Aviso en el chat
    const lineas = [
      habilidad ? `<p><i class="fa-solid fa-wand-magic-sparkles"></i> Nueva habilidad: <strong>${habilidad.nombre}</strong></p>` : "",
      pack ? `<p><i class="fa-solid fa-layer-group"></i> Cartas añadidas al Mazo: ${descripcionPack}</p>` : "",
      especializacion ? `<p><i class="fa-solid fa-award"></i> Especialización: <strong>${especializacion.nombre}</strong></p>` : "",
      caracteristica ? `<p><i class="fa-solid fa-arrow-up-1-9"></i> +1 <strong>${nombreCaracteristica(caracteristica)}</strong></p>` : "",
      opciones.manoMaxima ? `<p><i class="fa-solid fa-hand"></i> +${opciones.manoMaxima} Mano Máxima</p>` : "",
      abalorio ? `<p><i class="fa-solid ${abalorio.icono}"></i> Nuevo abalorio en el Mazo de Trinkets: <strong>${abalorio.nombre}</strong></p>` : "",
      opciones.pasivas.map(p => `<p><i class="fa-solid fa-star"></i> ${p.nombre}</p>`).join(""),
      opciones.pendientes.map(p => `<p><i class="fa-solid fa-hourglass-half"></i> ${p}: <em>pendiente de definir, lo aplica el Master</em></p>`).join(""),
      cambiaArtilugio ? `<p><i class="fa-solid fa-toolbox"></i> Artilugio de primera: <strong>${SISTEMA_CONFIG.ARTILUGIOS[artilugio].nombre}</strong>${artilugioAnterior ? ` (antes: ${SISTEMA_CONFIG.ARTILUGIOS[artilugioAnterior]?.nombre ?? artilugioAnterior})` : ""}</p>` : ""
    ].join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-angles-up"></i> ${this.name} sube a Nivel ${nivelDestino}</h3>
          <p><strong>${configClase.nombre}</strong></p>
          ${lineas}
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
    // (v0.15.0) Abalorio Eterno: solo puede estar En Juego o Quemado.
    pilaDestino = this._destinoAbalorioEterno(carta, pilaOrigen, pilaDestino);
    if (pilaDestino === pilaOrigen) return carta;

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
    // (v0.15.0) Los Abalorios Eternos no vuelven al Mazo de Trinkets: si están En Juego se quedan
    // (fin de escena/combate y descanso) y desde Quemadas (u otra pila) vuelven a estar En Juego.
    const eternos = [];

    for (const carta of pilaOrigen.cards) {
      if (this._esAbalorioEterno(carta)) {
        eternos.push(carta.id);
        continue;
      }
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
    // Si ya están En Juego se quedan (siguen en juego entre escenas y combates y al descansar).
    if (pilaOrigen.id !== this.system.pilas?.enJuegoId) {
      for (const id of eternos) await this._moverCartaEntrePilas(pilaOrigen, trinkets ?? pilaOrigen, id);
    }

    this.prepareData();
  }

  /**
   * ¿Es la carta un Abalorio Eterno de este Actor? (v0.15.0, ver `esAbalorioEterno`).
   * @param {Card} carta
   * @returns {boolean}
   */
  _esAbalorioEterno(carta) {
    if (carta?.type !== "trinket") return false;
    return esAbalorioEterno(carta, claveClaseDeItem(this.items.find(i => i.type === "clase")));
  }

  /**
   * Destino real de un movimiento para un Abalorio Eterno (v0.15.0): solo puede estar En Juego o en
   * Cartas Quemadas. Si va a dejar de estar En Juego, se quema; si va a salir de Quemadas (o está en
   * cualquier otra pila), pasa directamente a En Juego. Cualquier otra carta conserva su destino.
   * @param {Card} carta
   * @param {Cards} pilaOrigen
   * @param {Cards} pilaDestino - Destino pedido.
   * @returns {Cards} Destino a usar.
   */
  _destinoAbalorioEterno(carta, pilaOrigen, pilaDestino) {
    if (!this._esAbalorioEterno(carta)) return pilaDestino;
    const { enJuego, quemadas } = this.system.pilasDocumentos ?? {};
    if (!enJuego || !quemadas) return pilaDestino;
    if (pilaDestino.id === enJuego.id || pilaDestino.id === quemadas.id) return pilaDestino;
    if (pilaOrigen.id === enJuego.id) return quemadas;
    return enJuego;
  }

  /**
   * Coloca En Juego los Abalorios Eternos que estén fuera de su sitio (v0.15.0): disponibles en el
   * Mazo de Trinkets (personaje recién creado o anterior a esta regla) o en la Mano o el Descarte.
   * No hace nada si ya hay una copia En Juego o Quemada.
   * @returns {Promise<void>}
   */
  async _asegurarAbaloriosEternos() {
    if (!this.isOwner) return;
    const { trinkets, mano, descarte, enJuego, quemadas } = this.system.pilasDocumentos ?? {};
    if (!trinkets || !enJuego || !quemadas) return;
    const colocados = new Set([...enJuego.cards, ...quemadas.cards]
      .filter(c => this._esAbalorioEterno(c))
      .map(c => c.getFlag("cartas-y-dados", "sourceCardId") ?? c.id));

    for (const pila of [mano, descarte]) {
      for (const carta of [...(pila?.cards ?? [])]) {
        if (!this._esAbalorioEterno(carta)) continue;
        colocados.add(carta.getFlag("cartas-y-dados", "sourceCardId") ?? carta.id);
        await this._moverCartaEntrePilas(pila, enJuego, carta.id);
      }
    }
    const pendientes = trinkets.cards.filter(c => !c.drawn && !colocados.has(c.id) && this._esAbalorioEterno(c));
    if (pendientes.length) await this._extraerCartasDeMazo(trinkets, enJuego, pendientes.map(c => c.id));
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

      // (v0.16.0) En el orden del barajado (la primera es la carta superior).
      const disponibles = this._cartasDisponiblesEnOrden(mazo);
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
  // (v0.18.0) Un ataque BLOQUEADO deja en el mensaje del Master un `.cyd-registro-bloqueo` oculto
  // (objetivo, atacante y daño mitigado por completo) que usa la habilidad Rencor (Custodio).
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
                  data-atacante-uuid="${this.uuid}"
                  data-dano="${danoCalculado}">
            <i class="fa-solid fa-droplet"></i> Aplicar ${danoCalculado} de Daño a ${tokenObjetivo.name}
          </button>`
      : tirada.esNegativo
        ? `<p><i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">FALLO AUTOMÁTICO</span> · <strong>0 Daño:</strong> resultado negativo (${tirada.total}) por Pifia.</p>`
        : `<p><i class="fa-solid fa-shield-halved"></i> <span class="cyd-resultado-fallo">BLOQUEADO</span> · <strong>0 Daño:</strong> La tirada (${tirada.total}) no superó la Defensa (${defensaObjetivo}).</p>
           <span class="cyd-registro-bloqueo" hidden data-objetivo-uuid="${actorObjetivo.uuid}" data-atacante-uuid="${this.uuid}"
                 data-atacante-nombre="${foundry.utils.escapeHTML(this.name)}" data-cantidad="${Math.max(0, tirada.total)}"></span>`;
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

  /**
   * Juega una carta de la mano (v0.14.0: acciones, Ataque apuntado, Potenciar y reacciones).
   * - **Trinket:** no tira; va a `enJuego` (o a `quemadas` si se quema) y aplica su automatización.
   * - **Carta de Acción:** realiza la acción `accion` de `SISTEMA_CONFIG.ACCIONES` (sin acción = la
   *   carta decide: ataque si `esAtaque`, si no contra la Dificultad). Tira
   *   `caracteristicasTotales[caracteristicaAsociada]` dados `tipoDado` + `automatizacion.bonoTirada`.
   *   - Ataque apuntado (`cartaApuntadoId`): segunda carta del mismo palo; se suman ambas tiradas y el
   *     resultado se divide entre 2 (redondeo hacia arriba). Por defecto se resuelve como ataque.
   *   - Potenciar (`cartaPotenciarId`): otra carta MIST de la mano; su tirada de Misticismo se suma
   *     y se quema siempre.
   *   - Destino: las cartas MIST, las marcadas «Se quema» y todas con Agotamiento 7+ se queman; el
   *     resto va al Descarte. `quemar` (booleano) fuerza el destino como excepción.
   *   - Reacción (`reaccion`): con Agotamiento 4+ o, en combate, con la reacción ya usada, pide
   *     confirmar una excepción; en combate la marca como usada hasta el turno del Actor.
   * @param {string} cartaId - ID de la carta en la mano.
   * @param {Object} [opciones]
   * @param {boolean} [opciones.quemar] - Forzar quemar (true) o descartar (false); sin indicar, según las reglas.
   * @param {string} [opciones.modo="usar"] - "usar-y-quemar" equivale a `quemar: true` (compatibilidad).
   * @param {string|null} [opciones.accion=null] - Clave de `SISTEMA_CONFIG.ACCIONES`.
   * @param {string|null} [opciones.cartaApuntadoId=null] - Segunda carta del Ataque apuntado.
   * @param {boolean} [opciones.puntoDebil=false] - El Ataque apuntado va al punto débil (explotar su debilidad).
   * @param {string|null} [opciones.cartaPotenciarId=null] - Carta MIST con la que se Potencia.
   * @param {boolean} [opciones.reaccion=false] - La acción es una reacción.
   * @param {string} [opciones.resolucion="auto"] - Clave de `SISTEMA_CONFIG.RESOLUCIONES_ACCION`.
   * @param {boolean} [opciones.comoFisico=false] - (v0.15.0, abalorio Espada) La carta CONS se usa como
   *   carta de Físico: tira con Físico.
   * @param {string|null} [opciones.elemento=null] - (v0.16.0, abalorio Elementalismo) Elemento de la acción:
   *   clave de `SISTEMA_CONFIG.ELEMENTOS` o texto libre; se indica en el chat.
   * (v0.15.0) Abalorios En Juego: con Espada o Daga el Ataque apuntado admite combinar FISC y CONS
   * (con Espada ambas tiran con Físico; con Daga cada una con su característica). Las acciones con
   * `reaccionAdicional` (Escudo) no gastan ni exigen la reacción del turno.
   * @returns {Promise<import("../dados.mjs").ResultadoTiradaSistema|null>} Tirada o null.
   */
  async jugarCarta(cartaId, {
    quemar, modo = "usar", accion = null, cartaApuntadoId = null, puntoDebil = false,
    cartaPotenciarId = null, reaccion = false, resolucion = "auto", comoFisico = false, elemento = null
  } = {}) {
    const { mano, enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!mano || !enJuego || !descarte || !quemadas) return null;

    const carta = mano.cards.get(cartaId);
    if (!carta) {
      ui.notifications.error("La carta seleccionada no está en tu mano.");
      return null;
    }

    // Si el modo es "usar-y-quemar", forzar quemado de la carta tras usarla
    if (modo === "usar-y-quemar") quemar = true;
    if (carta.type === "trinket") return this._jugarTrinket(carta, { quemar: quemar === true });

    const quemarExplicito = typeof quemar === "boolean";
    const efectosAgotamiento = this.system.agotamiento?.efectos ?? {};
    const configAccion = accion ? SISTEMA_CONFIG.ACCIONES[accion] ?? null : null;
    const abalorios = this.abaloriosActivos();
    // (v0.15.0) Abalorio Espada: una carta CONS puede usarse como carta de Físico.
    const usaEspada = Boolean(comoFisico) && carta.system.palo === "bastos";
    if (usaEspada && !abalorios.has("espada")
        && !(await this._confirmarExcepcion("Abalorio Espada no activo", ["El Trinket «Espada» no está En Juego: no puedes usar cartas CONS como FISC."]))) {
      return null;
    }
    let claveCaract = usaEspada ? "fisico" : carta.system.caracteristicaAsociada;
    if (configAccion?.abalorio && !abalorios.has(configAccion.abalorio)
        && !(await this._confirmarExcepcion("Abalorio no activo", [`«${configAccion.nombre}» requiere el abalorio En Juego.`]))) {
      return null;
    }
    // (v0.16.0) Elementalismo: elemento elegido para el ataque o la defensa.
    const nombreElemento = elemento ? (SISTEMA_CONFIG.ELEMENTOS[elemento]?.nombre ?? String(elemento).trim()) : "";
    if (nombreElemento && !abalorios.has("elementalismo")
        && !(await this._confirmarExcepcion("Elementalismo no activo", ["El Trinket «Elementalismo» no está En Juego: no puedes cambiar el elemento."]))) {
      return null;
    }

    // --- Validar las cartas adicionales ---------------------------------------------
    const cartaApuntado = cartaApuntadoId ? mano.cards.get(cartaApuntadoId) ?? null : null;
    // (v0.15.0) Ataque apuntado mixto FISC + CONS con el abalorio Espada o Daga.
    const paloEfectivo = usaEspada ? "espadas" : carta.system.palo;
    const apuntadoMixto = Boolean(cartaApuntado) && cartaApuntado.system.palo !== paloEfectivo
      && new Set([paloEfectivo, cartaApuntado.system.palo, "espadas", "bastos"]).size === 2;
    const abalorioMixto = abalorios.has("espada") ? "espada" : abalorios.has("daga") ? "daga" : null;
    if (cartaApuntadoId && (!cartaApuntado || cartaApuntado.id === carta.id || cartaApuntado.type !== "accion"
        || (cartaApuntado.system.palo !== paloEfectivo && !(apuntadoMixto && (abalorioMixto || usaEspada))))) {
      ui.notifications.warn("El Ataque apuntado necesita una segunda carta del mismo palo en tu mano (FISC + CONS con el abalorio Espada o Daga).");
      return null;
    }
    // Con Espada las cartas CONS del Ataque apuntado tiran con Físico; con Daga, cada una con la suya.
    const apuntadoConEspada = apuntadoMixto && (usaEspada || abalorioMixto === "espada");
    if (apuntadoConEspada) claveCaract = "fisico";
    const caractApuntado = cartaApuntado
      ? (apuntadoConEspada ? "fisico" : cartaApuntado.system.caracteristicaAsociada)
      : null;
    const cartaPotenciar = cartaPotenciarId ? mano.cards.get(cartaPotenciarId) ?? null : null;
    if (cartaPotenciarId && (!cartaPotenciar || [carta.id, cartaApuntado?.id].includes(cartaPotenciar.id)
        || cartaPotenciar.type !== "accion" || cartaPotenciar.system.palo !== "copas")) {
      ui.notifications.warn("Para Potenciar necesitas otra carta de Misticismo (MIST) en tu mano.");
      return null;
    }

    // --- Reacción ------------------------------------------------------------------------
    let reaccionPorExcepcion = false;
    const reaccionAdicional = Boolean(reaccion && configAccion?.reaccionAdicional);
    // (v0.15.0) Acciones que no admiten reacción (el compañero de Compañero eterno no reacciona).
    if (reaccion && configAccion?.sinReaccion
        && !(await this._confirmarExcepcion("Sin reacciones", [`«${configAccion.nombre}» no puede realizarse como reacción.`]))) {
      return null;
    }
    if (reaccion) {
      const permiso = await this._autorizarReaccion({ adicional: reaccionAdicional });
      if (!permiso) return null;
      reaccionPorExcepcion = permiso === "excepcion";
    }

    // (v0.17.0) Sellar destino: la acción debe ser de la característica sellada (salvo excepción).
    if (!(await this._cumplirDestinoSellado(claveCaract))) return null;

    // --- Tipo de resolución ----------------------------------------------------------------
    let tipoResolucion = resolucion && resolucion !== "auto"
      ? resolucion
      : cartaApuntado ? "ataque" : configAccion?.resolucion ?? "segunCarta";
    if (tipoResolucion === "segunCarta") tipoResolucion = carta.system.esAtaque ? "ataque" : "dificultad";
    const esAtaque = tipoResolucion === "ataque";

    // --- Tiradas ---------------------------------------------------------------------------------
    /** @type {import("../dados.mjs").ResultadoTiradaSistema|null} */
    let tirada = null;
    let bloqueResolucionHtml = "";
    /** HTML de resolución solo para el Master (Defensa y daño del objetivo). */
    let htmlMaster = "";
    const hayPartes = Boolean(cartaApuntado || cartaPotenciar);

    // (v0.15.0) Abalorio Amistad: +1 dado a la carta principal si coincide con la característica de
    // la última acción del aliado enlazado (no en las acciones del compañero).
    const amistad = configAccion?.mitadAtributos ? null : this._bonoDadoAmistad(claveCaract, abalorios);
    /** (v0.17.0) Alguna carta MIST de la acción tiró con el dado reducido por Mal de ojo. */
    let usaMalDeOjo = false;

    if (tipoResolucion !== "sinTirada") {
      const mitadPorAgotamiento = this._tiradasAMitadPorAgotamiento();
      /** Dados de una característica; con `mitadAtributos` (compañero), la mitad redondeando hacia arriba. */
      const dadosDe = caract => configAccion?.mitadAtributos
        ? Math.max(1, Math.ceil(this._dadosDeCaracteristica(caract) / 2))
        : this._dadosDeCaracteristica(caract);
      const tirarCarta = (c, caract, extra = 0) => {
        // (v0.17.0) Mal de ojo: las cartas MIST del Actor maldito bajan una categoría de dado.
        const malDeOjo = c.system.palo === "copas" ? this._ajusteMalDeOjo(c.system.tipoDado ?? "d6") : null;
        if (malDeOjo) usaMalDeOjo = true;
        return tirarDadosSistema({
          cantidadDados: dadosDe(caract) + extra,
          tipoDado: malDeOjo?.tipoDado ?? c.system.tipoDado ?? "d6",
          bono: Number(c.system.automatizacion?.bonoTirada) || 0,
          rollData: this.getRollData(),
          mitadPorAgotamiento,
          parcial: hayPartes,
          speaker: ChatMessage.getSpeaker({ actor: this }),
          titulo: `${configAccion ? `${configAccion.nombre} · ` : ""}${nombreVisibleCarta(c)}`,
          resultadoFijo: malDeOjo?.resultadoFijo ?? null, motivoFijo: malDeOjo?.motivoFijo ?? ""
        });
      };
      const partes = [{ tirada: await tirarCarta(carta, claveCaract, amistad ? 1 : 0), etiqueta: nombreVisibleCarta(carta) }];
      if (cartaApuntado) {
        partes.push({ tirada: await tirarCarta(cartaApuntado, caractApuntado), etiqueta: `${nombreVisibleCarta(cartaApuntado)} (apuntado)` });
      }
      if (cartaPotenciar) {
        partes.push({ tirada: await tirarCarta(cartaPotenciar, "misticismo"), etiqueta: `${nombreVisibleCarta(cartaPotenciar)} (Potenciar)` });
      }
      tirada = combinarTiradas(partes, { mitad: Boolean(cartaApuntado), motivoMitad: "Ataque apuntado" });
      const res = this._htmlResolucionAccion(tirada, tipoResolucion);
      bloqueResolucionHtml = tirada.html + res.publico;
      htmlMaster = res.master;
    }

    // --- Destino de las cartas -------------------------------------------------------------
    /** Motivos de reglas por los que una carta usada se quema en vez de descartarse. */
    const motivosQuema = c => [
      c.system.palo === "copas" ? "Misticismo" : null,
      c.system.seQuema ? "Se quema" : null,
      efectosAgotamiento.quemarAlUsar ? `Agotamiento ${this.system.agotamiento.nivel}` : null
    ].filter(Boolean);
    const seQuemaCarta = c => quemarExplicito ? quemar : motivosQuema(c).length > 0;
    const etiquetaDestino = c => {
      const motivos = motivosQuema(c);
      if (quemarExplicito && quemar) return motivos.length ? `Carta Quemada · ${motivos.join(", ")}` : "Carta Quemada";
      if (quemarExplicito && !quemar && motivos.length) return "Descarte · excepción: no se quema";
      return motivos.length ? `Carta Quemada · ${motivos.join(", ")}` : "Descarte";
    };

    const lineasCartas = [this._lineaCartaUsada(carta, "Carta", etiquetaDestino(carta))];
    await this._moverCartaEntrePilas(mano, seQuemaCarta(carta) ? quemadas : descarte, carta.id);
    if (cartaApuntado) {
      lineasCartas.push(this._lineaCartaUsada(cartaApuntado, "Ataque apuntado", etiquetaDestino(cartaApuntado)));
      await this._moverCartaEntrePilas(mano, seQuemaCarta(cartaApuntado) ? quemadas : descarte, cartaApuntado.id);
    }
    if (cartaPotenciar) {
      lineasCartas.push(this._lineaCartaUsada(cartaPotenciar, "Potenciar", "Carta Quemada · Misticismo"));
      await this._moverCartaEntrePilas(mano, quemadas, cartaPotenciar.id);
    }

    // --- Automatización de la carta principal -------------------------------------------------
    const resumenEfectosAuto = await this._aplicarAutomatizacionCarta(carta);

    if (reaccion && !reaccionAdicional && this.estaEnCombate()) await this.setFlag("cartas-y-dados", "reaccionUsada", true);
    // (v0.15.0) Última característica jugada (abalorio Amistad de los aliados); el compañero no cuenta.
    if (!configAccion?.mitadAtributos) await this._registrarUltimaCaracteristica(claveCaract);
    await this._marcarAccionMiniTurno();
    await this.retirarDestinoSellado(); // (v0.17.0) Sellar destino: la acción ya se ha realizado
    this.prepareData();

    // --- Chat ----------------------------------------------------------------------------------
    const etiquetas = [];
    if (reaccion) etiquetas.push(`<span class="cyd-tag-accion"><i class="fa-solid fa-bolt"></i> Reacción${reaccionAdicional ? " adicional (no gasta la reacción)" : ""}${reaccionPorExcepcion ? " (excepción)" : ""}</span>`);
    if (usaEspada) etiquetas.push('<span class="cyd-tag-accion"><i class="fa-solid fa-khanda"></i> Espada: CONS como FISC</span>');
    if (apuntadoMixto) etiquetas.push(`<span class="cyd-tag-accion"><i class="fa-solid fa-gem"></i> ${apuntadoConEspada ? "Espada" : "Daga"}: apuntado FISC + CONS</span>`);
    if (configAccion?.mitadAtributos) etiquetas.push('<span class="cyd-tag-accion"><i class="fa-solid fa-paw"></i> Compañero: mitad de dados</span>');
    if (amistad && tipoResolucion !== "sinTirada") etiquetas.push(`<span class="cyd-tag-accion"><i class="fa-solid fa-handshake"></i> Amistad con ${foundry.utils.escapeHTML(amistad.aliado)}: +1 dado</span>`);
    if (configAccion?.adicional) etiquetas.push('<span class="cyd-tag-accion"><i class="fa-solid fa-plus"></i> Acción adicional</span>');
    if (cartaApuntado) etiquetas.push('<span class="cyd-tag-accion"><i class="fa-solid fa-bullseye"></i> Ataque apuntado (÷ 2)</span>');
    if (cartaPotenciar) etiquetas.push('<span class="cyd-tag-accion"><i class="fa-solid fa-moon"></i> Potenciada</span>');
    if (usaMalDeOjo) etiquetas.push(this._etiquetaMalDeOjo());
    if (nombreElemento) etiquetas.push(`<span class="cyd-tag-accion"><i class="fa-solid ${SISTEMA_CONFIG.ELEMENTOS[elemento]?.icono ?? "fa-fire-flame-curved"}"></i> Elementalismo: ${foundry.utils.escapeHTML(nombreElemento)}</span>`);
    if (resolucion && resolucion !== "auto") etiquetas.push(`<span class="cyd-tag-accion"><i class="fa-solid fa-sliders"></i> ${SISTEMA_CONFIG.RESOLUCIONES_ACCION[resolucion] ?? resolucion}</span>`);

    const lineasExtra = [];
    if (accion === "correr") {
      const mov = Number(this.system.movimiento?.max) || 0;
      lineasExtra.push(`<p><i class="fa-solid fa-person-running"></i> Movimiento duplicado: <strong>${mov * 2} m</strong> este turno (${mov} × 2).</p>`);
    }
    if (cartaApuntado && puntoDebil) {
      lineasExtra.push('<p><i class="fa-solid fa-crosshairs"></i> Apunta al <strong>punto débil</strong>: si impacta, explota su debilidad (efecto a criterio del Master).</p>');
    }

    const efectoHtml = carta.system.efecto;
    const titulo = configAccion ? `${configAccion.nombre} · ${nombreVisibleCarta(carta)}` : nombreVisibleCarta(carta);
    const icono = configAccion ? configAccion.icono : esAtaque ? "fa-crosshairs" : "fa-diamond";
    const htmlEfectosAuto = resumenEfectosAuto.length > 0
      ? `<p class="cyd-tags-auto"><strong>Efectos aplicados:</strong> ${resumenEfectosAuto.join(" · ")}</p>`
      : "";
    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid ${icono}"></i> ${titulo}</h3>
        ${etiquetas.length ? `<p class="cyd-tags-accion-fila">${etiquetas.join(" ")}</p>` : ""}
        ${lineasCartas.join("")}
        ${lineasExtra.join("")}
        ${bloqueResolucionHtml}
        ${tipoResolucion === "sinTirada" ? '<p><small><i class="fa-solid fa-circle-info"></i> Acción sin tirada: su efecto se aplica directamente.</small></p>' : ""}
        ${htmlEfectosAuto}
        ${efectoHtml ? `<div class="cyd-efecto">${efectoHtml}</div>` : ""}
        ${tirada ? this._htmlBotonVisionFuturo([claveCaract, caractApuntado, cartaPotenciar ? "misticismo" : null]) : ""}
      </div>
    `;

    if (tirada) {
      await publicarTirada(tirada, {
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: saborChat,
        htmlMaster,
        // «Espera un momento» solo repite tiradas simples (una carta).
        repeticion: hayPartes ? null : this._datosRepeticionTirada(tirada, { titulo, esAtaque })
      });
    } else {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: saborChat });
    }

    return tirada;
  }

  /**
   * Juega un Trinket de la mano (sin tirada): va a `enJuego`, o a `quemadas` si se quema.
   * Con Agotamiento 5+ solo puede haber un Trinket activo.
   * @param {Card} carta - Trinket en la mano.
   * @param {{quemar: boolean}} opciones
   * @returns {Promise<null>}
   */
  async _jugarTrinket(carta, { quemar = false } = {}) {
    const { mano, enJuego, quemadas } = this.system.pilasDocumentos;
    const efectosAgotamiento = this.system.agotamiento?.efectos ?? {};
    const seQuema = quemar || Boolean(carta.system.seQuema);

    // Agotamiento 5+: solo puede haber un Trinket activo en juego.
    if (!seQuema && efectosAgotamiento.unTrinket && enJuego.cards.size >= 1) {
      ui.notifications.warn(`${this.name} tiene Agotamiento ${this.system.agotamiento.nivel}: solo puede tener un Trinket activo. Retira o quema el que está en juego antes de jugar otro.`);
      return null;
    }

    await this._moverCartaEntrePilas(mano, seQuema ? quemadas : enJuego, carta.id);
    const resumenEfectosAuto = await this._aplicarAutomatizacionCarta(carta);

    // (v0.15.0) Abalorio Amistad: al jugarlo se enlaza el destino con un aliado.
    const claveClase = claveClaseDeItem(this.items.find(i => i.type === "clase"));
    if (!seQuema && abalorioDeTrinket(carta, claveClase) === "amistad") {
      const aliado = await this._elegirAliadoAmistad();
      if (aliado) {
        resumenEfectosAuto.push(`<i class="fa-solid fa-handshake"></i> Destino enlazado con <strong>${foundry.utils.escapeHTML(aliado.name)}</strong>`);
      }
    }

    const bonoDefTrinket = Number(carta.system.bonoDefensaEnJuego) || 0;
    if (bonoDefTrinket !== 0 && !seQuema) {
      const signoDef = bonoDefTrinket > 0 ? `+${bonoDefTrinket}` : bonoDefTrinket;
      resumenEfectosAuto.push(`<i class="fa-solid fa-shield-halved"></i> ${signoDef} Defensa (Activo en Juego)`);
    }
    this.prepareData();

    const htmlEfectosAuto = resumenEfectosAuto.length > 0
      ? `<p class="cyd-tags-auto"><strong>Efectos aplicados:</strong> ${resumenEfectosAuto.join(" · ")}</p>`
      : "";
    const efectoHtml = carta.system.efectoAlJugar;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-gem"></i> ${nombreVisibleCarta(carta)} <small>(${seQuema ? "Carta Quemada" : "Trinket En Juego"})</small></h3>
          ${this._infoCartaHtml(carta)}
          ${htmlEfectosAuto}
          ${efectoHtml ? `<div class="cyd-efecto">${efectoHtml}</div>` : ""}
        </div>
      `
    });
    return null;
  }

  /**
   * Aplica la automatización de una carta jugada (curación, Agotamiento y robo de cartas).
   * @param {Card} carta
   * @returns {Promise<string[]>} Resumen HTML de los efectos aplicados.
   */
  async _aplicarAutomatizacionCarta(carta) {
    const auto = carta.system.automatizacion ?? {};
    const resumen = [];
    const updatesActor = {};

    if (auto.curacion > 0) {
      updatesActor["system.salud.value"] = Math.min(this.system.salud.maxTotal, this.system.salud.value + auto.curacion);
      resumen.push(`<i class="fa-solid fa-heart-pulse"></i> +${auto.curacion} Salud`);
    }
    if (auto.cambioCansancio) {
      updatesActor["system.cansancio.value"] = SistemaActor.limitarAgotamiento(this.system.cansancio.value + auto.cambioCansancio);
      const signo = auto.cambioCansancio > 0 ? `+${auto.cambioCansancio}` : auto.cambioCansancio;
      resumen.push(`<i class="fa-solid fa-hourglass-half"></i> ${signo} Agotamiento`);
    }
    if (Object.keys(updatesActor).length > 0) await this.update(updatesActor);

    if (auto.robarCartas > 0) {
      await this.robarCantidadCartas(auto.robarCartas);
      resumen.push(`<i class="fa-solid fa-clone"></i> Roba +${auto.robarCartas} carta(s)`);
    }
    return resumen;
  }

  /**
   * Línea de chat con una carta usada en una acción: nombre, característica, dado y destino.
   * @param {Card} carta
   * @param {string} rol - "Carta", "Ataque apuntado" o "Potenciar".
   * @param {string} destino - Texto del destino (Descarte, Carta Quemada...).
   * @returns {string}
   */
  _lineaCartaUsada(carta, rol, destino) {
    return `<p><i class="fa-solid fa-diamond"></i> <strong>${rol}:</strong> ${nombreVisibleCarta(carta)} · <strong>${abreviadoPalo(carta.system.palo)}</strong> · ${carta.system.tipoDado} <small>(${destino})</small></p>`;
  }

  /**
   * Nº de dados de una característica (total con bonos; mínimo 1).
   * @param {string} clave
   * @returns {number}
   */
  _dadosDeCaracteristica(clave) {
    return Number(this.system.caracteristicasTotales?.[clave]) || Number(this.system.caracteristicas?.[clave]) || 1;
  }

  /**
   * Bloques de resolución de una acción según su tipo (v0.14.0).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @param {string} tipo - `ataque`, `dificultad`, `enfrentada`, `puntoDebil`, `ayuda` o `sinResolucion`.
   * @returns {{publico: string, master: string}}
   */
  _htmlResolucionAccion(tirada, tipo) {
    switch (tipo) {
      case "ataque": return this._htmlResolucionTirada(tirada, true);
      case "dificultad": return { publico: htmlResolucionDificultad(tirada), master: "" };
      case "puntoDebil": return this._htmlResolucionPuntoDebil(tirada);
      case "enfrentada":
        return {
          publico: `
            <div class="cyd-resolucion-caja">
              <p><i class="fa-solid fa-scale-balanced"></i> <strong>Tirada enfrentada: ${tirada.total}</strong></p>
              <p><small>El Master la compara con la tirada rival${tirada.esNegativo ? `; el rival suma +${Math.abs(tirada.total)}` : ""}.</small></p>
            </div>`,
          master: ""
        };
      case "ayuda": {
        const aliado = game.user.targets.first()?.name ?? "su aliado";
        const aporta = tirada.esNegativo ? 0 : tirada.total;
        return {
          publico: `
            <div class="cyd-resolucion-caja ${aporta > 0 ? "cyd-exito" : "cyd-fallo"}">
              <p><i class="fa-solid fa-handshake-angle"></i> <strong>Ayuda a ${aliado}:</strong> ${aporta > 0
                ? `<span class="cyd-resultado-exito">+${aporta}</span> a su tirada`
                : '<span class="cyd-resultado-fallo">no aporta nada</span>'}</p>
              <p><small>Solo se puede aplicar una ayuda por acción.</small></p>
            </div>`,
          master: ""
        };
      }
      default: return { publico: "", master: "" };
    }
  }

  /**
   * Identificar punto débil: lo descubre si el total SUPERA la Defensa Total del objetivo (`T`).
   * El público solo ve si lo encuentra; la Defensa va solo al Master (como en los ataques).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @returns {{publico: string, master: string}}
   */
  _htmlResolucionPuntoDebil(tirada) {
    const token = game.user.targets.first() ?? null;
    const objetivo = token?.actor ?? null;
    if (!objetivo) {
      return {
        publico: `
          <div class="cyd-resolucion-caja">
            <p><i class="fa-solid fa-magnifying-glass"></i> <strong>Resultado: ${tirada.total}</strong></p>
            <p><small><i class="fa-solid fa-circle-info"></i> Marca el objetivo con <strong>T</strong> antes de tirar; si no, el Master lo compara con su Defensa.</small></p>
          </div>`,
        master: ""
      };
    }
    objetivo.prepareData();
    const defensa = objetivo.system.defensaTotal ?? objetivo.system.defensa ?? 0;
    const encontrado = !tirada.esNegativo && tirada.total > defensa;
    const texto = encontrado
      ? '<span class="cyd-resultado-exito">PUNTO DÉBIL ENCONTRADO</span>'
      : '<span class="cyd-resultado-fallo">NO LO ENCUENTRA</span>';
    return {
      publico: `
        <div class="cyd-resolucion-caja ${encontrado ? "cyd-exito" : "cyd-fallo"}">
          <p><i class="fa-solid fa-magnifying-glass"></i> <strong>Objetivo:</strong> ${token.name} · ${texto}</p>
          <p><small><i class="fa-solid fa-eye-slash"></i> ${encontrado ? "El Master revela cuál es su punto débil." : "La Defensa solo la ve el Master."}</small></p>
        </div>`,
      master: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-eye-slash"></i> Punto débil <small>(solo Master)</small></h3>
          <p><strong>${this.name}</strong> → <strong>${token.name}</strong> · Resultado ${tirada.total} vs Defensa ${defensa}: ${texto}</p>
          ${encontrado ? "<p><small>Revela al jugador el punto débil del objetivo.</small></p>" : ""}
        </div>`
    };
  }

  /* ======================================================================== */
  /*  4b. REACCIONES Y MINI TURNO FUERA DE COMBATE (v0.14.0)                   */
  /* ======================================================================== */

  /**
   * El Actor participa en un combate iniciado (compara por `uuid` para Tokens no vinculados).
   * @returns {boolean}
   */
  estaEnCombate() {
    return game.combats?.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === this.uuid)) ?? false;
  }

  /**
   * Comprueba si el Actor puede reaccionar: no con Agotamiento 4+ ni, en combate, si ya usó
   * su reacción antes de volver a su turno. Si no puede, ofrece hacerlo como excepción.
   * @param {Object} [opciones]
   * @param {boolean} [opciones.adicional=false] - (v0.15.0) Reacción adicional: ignora la reacción usada.
   * @returns {Promise<"ok"|"excepcion"|null>} null si se cancela.
   */
  async _autorizarReaccion({ adicional = false } = {}) {
    const motivos = [];
    if (this.system.agotamiento?.efectos?.sinReacciones) {
      motivos.push(`Tiene Agotamiento ${this.system.agotamiento.nivel}: no puede realizar reacciones.`);
    }
    // (v0.15.0) Una reacción adicional (abalorio Escudo) no depende de la reacción del turno.
    if (!adicional && this.estaEnCombate() && this.getFlag("cartas-y-dados", "reaccionUsada")) {
      motivos.push("Ya ha usado su reacción: las reacciones se limitan a una hasta que vuelva a ser su turno.");
    }
    if (!motivos.length) return "ok";
    return (await this._confirmarExcepcion("Reacción no permitida", motivos)) ? "excepcion" : null;
  }

  /**
   * Pide confirmar que se salta una regla como excepción acordada con la mesa.
   * @param {string} titulo - Título de la ventana.
   * @param {string[]} motivos - Reglas que lo impiden (texto plano).
   * @returns {Promise<boolean>}
   */
  async _confirmarExcepcion(titulo, motivos) {
    const escapar = foundry.utils.escapeHTML;
    return foundry.applications.api.DialogV2.confirm({
      ...opcionesDialogoSistema({ width: 460 }),
      window: { title: titulo, icon: "fa-solid fa-triangle-exclamation" },
      content: `
        <p><strong>${escapar(this.name)}</strong>:</p>
        <ul>${motivos.map(m => `<li>${escapar(m)}</li>`).join("")}</ul>
        <p>Continúa solo si la mesa y el Master lo aceptan como excepción.</p>`,
      yes: { label: "Hacerlo igualmente (excepción)", icon: "fa-solid fa-check" },
      no: { label: "Cancelar", icon: "fa-solid fa-xmark" },
      defaultYes: false,
      rejectClose: false
    });
  }

  /**
   * Abalorios de clase activos (v0.15.0): claves (`espada`, `escudo`, `daga`...) de los Trinkets En
   * Juego marcados con `flags.cartas-y-dados.abalorio` (o, si son anteriores a v0.15.0, reconocidos
   * por nombre entre los abalorios de la clase del Actor).
   * @returns {Set<string>}
   */
  abaloriosActivos() {
    const enJuego = this.system.pilasDocumentos?.enJuego;
    if (!enJuego) return new Set();
    const claveClase = claveClaseDeItem(this.items.find(i => i.type === "clase"));
    return new Set(enJuego.cards.contents.map(c => abalorioDeTrinket(c, claveClase)).filter(Boolean));
  }

  /**
   * Aliados posibles para los abalorios de Mendacium Charisma (v0.15.0): el resto de Actores
   * `personaje` del Mundo.
   * @returns {Actor[]}
   */
  aliadosPosibles() {
    return game.actors.filter(a => a.type === "personaje" && a.id !== this.id);
  }

  /**
   * Abalorio Amistad (v0.15.0): pide el aliado con el que se enlaza el destino y lo guarda en
   * `flags.cartas-y-dados.amistad` (`{aliadoUuid, aliadoNombre}`).
   * @returns {Promise<Actor|null>} Aliado elegido o null si no hay o se cancela.
   */
  async _elegirAliadoAmistad() {
    const aliados = this.aliadosPosibles();
    if (!aliados.length) {
      ui.notifications.warn("Amistad: no hay otros personajes con los que enlazar el destino.");
      return null;
    }
    const escapar = foundry.utils.escapeHTML;
    const actual = this.getFlag("cartas-y-dados", "amistad")?.aliadoUuid ?? null;
    const opciones = aliados.map(a => `<option value="${a.uuid}" ${a.uuid === actual ? "selected" : ""}>${escapar(a.name)}</option>`).join("");
    const uuid = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 420 }),
      window: { title: "Amistad", icon: "fa-solid fa-handshake" },
      content: `
        <p>Enlazas tu destino al de un aliado. Si juegas la misma característica que este aliado jugó en su última acción, tiras <strong>1 dado adicional</strong>.</p>
        <div class="form-group"><label>Aliado</label><select name="aliado">${opciones}</select></div>`,
      buttons: [
        { action: "enlazar", label: "Enlazar destino", icon: "fa-solid fa-handshake", default: true,
          callback: (_e, button) => button.form.elements.aliado.value },
        { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
      ],
      rejectClose: false
    });
    const aliado = uuid ? aliados.find(a => a.uuid === uuid) ?? null : null;
    if (!aliado) return null;
    await this.setFlag("cartas-y-dados", "amistad", { aliadoUuid: aliado.uuid, aliadoNombre: aliado.name });
    return aliado;
  }

  /**
   * Abalorio Amistad (v0.15.0): ¿la característica jugada coincide con la última acción del aliado?
   * @param {string} claveCaract - Característica con la que se tira.
   * @param {Set<string>} [abalorios] - Abalorios En Juego (se calculan si no se pasan).
   * @returns {{aliado: string}|null} Nombre del aliado si se gana el dado adicional.
   */
  _bonoDadoAmistad(claveCaract, abalorios = this.abaloriosActivos()) {
    if (!claveCaract || !abalorios.has("amistad")) return null;
    const enlace = this.getFlag("cartas-y-dados", "amistad");
    const aliado = enlace?.aliadoUuid ? fromUuidSync(enlace.aliadoUuid) : null;
    if (!aliado || aliado.getFlag("cartas-y-dados", "ultimaCaracteristica") !== claveCaract) return null;
    return { aliado: aliado.name };
  }

  /**
   * Guarda la característica de la última acción del Actor (v0.15.0, abalorio Amistad).
   * @param {string} claveCaract
   * @returns {Promise<void>}
   */
  async _registrarUltimaCaracteristica(claveCaract) {
    if (this.type !== "personaje" || !claveCaract || !this.isOwner) return;
    if (this.getFlag("cartas-y-dados", "ultimaCaracteristica") === claveCaract) return;
    await this.setFlag("cartas-y-dados", "ultimaCaracteristica", claveCaract);
  }

  /**
   * Abalorio Empatía (v0.15.0): roba una carta del Mazo porque un aliado ha quemado una carta.
   * En combate, una vez por turno (`flags.cartas-y-dados.empatiaUsada`, se restablece al inicio de su
   * turno); las excepciones se confirman.
   * @param {string} [nombreAliado=""] - Quién quemó la carta (para el chat).
   * @returns {Promise<boolean>} true si robó.
   */
  async usarEmpatia(nombreAliado = "") {
    const motivos = [];
    if (!this.abaloriosActivos().has("empatia")) motivos.push("El abalorio «Empatía» no está En Juego.");
    if (this.estaEnCombate() && this.getFlag("cartas-y-dados", "empatiaUsada")) {
      motivos.push("Ya ha usado Empatía este turno (una vez por turno).");
    }
    if (motivos.length && !(await this._confirmarExcepcion("Empatía", motivos))) return false;

    const { mano } = this.system.pilasDocumentos ?? {};
    if (!mano) {
      ui.notifications.warn("Inicializa las pilas de cartas antes de robar.");
      return false;
    }
    const antes = mano.cards.size;
    await this.robarCantidadCartas(1);
    if (mano.cards.size <= antes) return false;
    if (this.estaEnCombate()) await this.setFlag("cartas-y-dados", "empatiaUsada", true);
    this.prepareData();

    const deQuien = nombreAliado ? ` porque <strong>${foundry.utils.escapeHTML(nombreAliado)}</strong> ha quemado una carta` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-heart"></i><p><strong>${this.name}</strong> roba una carta${deQuien} (Empatía).</p></div>`
    });
    return true;
  }

  /**
   * Habilidad Promesa (v0.15.0): el Actor mira las X primeras cartas de su Mazo, elige una, la
   * añade a su mano y baraja el Mazo. Lo lanza el botón del chat de la habilidad (propietario).
   * @param {number} x - Valor X de la tirada de Misticismo.
   * @param {string} [nombreOrigen=""] - Quién usó Promesa.
   * @returns {Promise<boolean>} true si añadió una carta.
   */
  async elegirCartaPromesa(x, nombreOrigen = "") {
    const { mazo, mano } = this.system.pilasDocumentos ?? {};
    if (!mazo || !mano) {
      ui.notifications.warn(`${this.name} no tiene las pilas de cartas inicializadas.`);
      return false;
    }
    const primeras = this._cartasDisponiblesEnOrden(mazo).slice(0, Math.max(0, Number(x) || 0));
    if (!primeras.length) {
      ui.notifications.warn(`No quedan cartas en el Mazo de ${this.name}.`);
      return false;
    }
    const escapar = foundry.utils.escapeHTML;
    const opciones = primeras.map((c, i) => `
      <label class="cyd-opcion-radio">
        <input type="radio" name="carta" value="${c.id}" ${i === 0 ? "checked" : ""} />
        <span>${escapar(nombreVisibleCarta(c))} <small>(${abreviadoPalo(c.system.palo)} · ${c.system.tipoDado ?? ""})</small></span>
      </label>`).join("");
    const cartaId = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 440, lista: true }),
      window: { title: "Promesa", icon: "fa-solid fa-hand-holding-hand" },
      content: `<p>Miras las <strong>${primeras.length}</strong> primeras cartas de tu Mazo: elige una para tu mano. Después se baraja el Mazo.</p>${opciones}`,
      buttons: [
        { action: "elegir", label: "Añadir a la mano", icon: "fa-solid fa-hand", default: true,
          callback: (_e, button) => button.form.elements.carta?.value ?? null },
        { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
      ],
      rejectClose: false
    });
    if (!cartaId) return false;

    const [creada] = await this._extraerCartasDeMazo(mazo, mano, [cartaId]);
    await mazo.shuffle({ chatNotification: false });
    this.prepareData();
    if (!creada) return false;
    const deQuien = nombreOrigen ? ` gracias a la Promesa de <strong>${escapar(nombreOrigen)}</strong>` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-hand-holding-hand"></i><p><strong>${this.name}</strong> mira ${primeras.length} carta(s) de su Mazo${deQuien}, añade una a su mano y baraja el Mazo.</p></div>`
    });
    return true;
  }

  /* ======================================================================== */
  /*  5c. ALTA SCENTIA: ABALORIOS Y HABILIDADES (v0.16.0)                     */
  /* ======================================================================== */

  /**
   * Cartas disponibles de un Mazo en el orden en que se roban (v0.16.0): `Cards#availableCards` no
   * respeta el barajado (Foundry ordena por `sort` al robar, `Cards#sortShuffled`), así que todo robo
   * del sistema y la «primera carta del Mazo» usan este orden.
   * @param {Cards|null} mazo
   * @returns {Card[]} La primera es la carta superior.
   */
  _cartasDisponiblesEnOrden(mazo) {
    if (!mazo) return [];
    return mazo.availableCards.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  /**
   * Carta superior del Mazo de Juego (la próxima que se robaría), o null si no queda ninguna.
   * @returns {Card|null}
   */
  primeraCartaMazo() {
    return this._cartasDisponiblesEnOrden(this.system.pilasDocumentos?.mazo)[0] ?? null;
  }

  /**
   * Trinkets del Actor (en cualquiera de sus 6 pilas) con un abalorio dado.
   * @param {string} claveAbalorio - Clave de abalorio (`artilugio`, `visionFuturo`...).
   * @returns {Card[]}
   */
  _cartasDeAbalorio(claveAbalorio) {
    const claveClase = claveClaseDeItem(this.items.find(i => i.type === "clase"));
    return Object.values(this.system.pilasDocumentos ?? {})
      .flatMap(pila => pila?.cards?.contents ?? [])
      .filter(c => c.type === "trinket" && abalorioDeTrinket(c, claveClase) === claveAbalorio);
  }

  /**
   * Objeto mágico del «Artilugio de primera» del Actor (`flags.cartas-y-dados.artilugio`).
   * @returns {string|null} Clave de `SISTEMA_CONFIG.ARTILUGIOS` o null.
   */
  artilugioActual() {
    for (const carta of this._cartasDeAbalorio("artilugio")) {
      const clave = carta.getFlag("cartas-y-dados", "artilugio");
      if (SISTEMA_CONFIG.ARTILUGIOS[clave]) return clave;
    }
    return null;
  }

  /**
   * Cambia el objeto del «Artilugio de primera» en el Trinket original y todas sus copias (flag y
   * texto del efecto permanente). La regla «una vez por subida de nivel» la aplica `subirDeNivel`.
   * @param {string} claveArtilugio - Clave de `SISTEMA_CONFIG.ARTILUGIOS`.
   * @returns {Promise<void>}
   */
  async cambiarArtilugio(claveArtilugio) {
    if (!SISTEMA_CONFIG.ARTILUGIOS[claveArtilugio]) return;
    const opcion = opcionesTrinketsClase(SISTEMA_CONFIG.CLASES_BASE.altaScentia).find(o => o.clave === "artilugio");
    const porPila = new Map();
    for (const carta of this._cartasDeAbalorio("artilugio")) {
      const lista = porPila.get(carta.parent) ?? [];
      lista.push({
        _id: carta.id,
        "flags.cartas-y-dados.artilugio": claveArtilugio,
        "system.efectoPermanente": efectoPermanenteAbalorio(opcion, claveArtilugio)
      });
      porPila.set(carta.parent, lista);
    }
    for (const [pila, updates] of porPila) await pila.updateEmbeddedDocuments("Card", updates);
    this.prepareData();
  }

  /**
   * Botón de chat «Descartar la primera carta del Mazo» (abalorio Visión del futuro) para una tirada
   * que usa Consciencia o Misticismo. Lo activa `sistema.mjs` (solo el propietario, una vez por mensaje).
   * @param {Iterable<string>} caracteristicas - Características usadas en la tirada.
   * @returns {string} HTML ("" si no aplica).
   */
  _htmlBotonVisionFuturo(caracteristicas) {
    const usadas = new Set(caracteristicas);
    if (!usadas.has("consciencia") && !usadas.has("misticismo")) return "";
    if (!this.abaloriosActivos().has("visionFuturo")) return "";
    return `
      <button type="button" class="cyd-btn-vision-futuro" data-actor-uuid="${this.uuid}">
        <i class="fa-solid fa-eye"></i> Descartar la primera carta del Mazo (Visión del futuro)
      </button>`;
  }

  /**
   * Visión del futuro (v0.16.0): descarta la carta superior del Mazo (Mazo → Descarte, conservando
   * `sourceCardId`). Sin el abalorio En Juego pide confirmar una excepción.
   * @returns {Promise<boolean>} true si descartó una carta.
   */
  async descartarPrimeraCartaMazo() {
    const { mazo, descarte } = this.system.pilasDocumentos ?? {};
    if (!mazo || !descarte) return false;
    if (!this.abaloriosActivos().has("visionFuturo")
        && !(await this._confirmarExcepcion("Visión del futuro no activa", ["El Trinket «Visión del futuro» no está En Juego."]))) {
      return false;
    }
    const carta = this.primeraCartaMazo();
    if (!carta) {
      ui.notifications.warn(`No quedan cartas en el Mazo de ${this.name}.`);
      return false;
    }
    const [descartada] = await this._extraerCartasDeMazo(mazo, descarte, [carta.id]);
    if (!descartada) return false;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-eye"></i><p><strong>${this.name}</strong> descarta la primera carta de su Mazo (Visión del futuro): <strong>${foundry.utils.escapeHTML(nombreVisibleCarta(descartada))}</strong> (${abreviadoPalo(descartada.system.palo)} · ${descartada.system.tipoDado ?? ""}).</p></div>`
    });
    if (this.sheet?.rendered) this.sheet.render();
    return true;
  }

  /**
   * Monóculo indiscreto (Artilugio de primera, v0.16.0): muestra en privado al usuario la carta
   * superior del Mazo del Token objetivo (`T`). Si quien lo usa es un jugador, el Master activo la
   * consulta por socket (los Mazos son privados) y se la susurra (ver `revelarCartaSuperiorMonoculo`).
   * @returns {Promise<boolean>} true si se pidió la carta.
   */
  async usarMonoculo() {
    const motivos = [];
    if (!this.abaloriosActivos().has("artilugio")) motivos.push("El Trinket «Artilugio de primera» no está En Juego.");
    if (this.artilugioActual() !== "monoculo") motivos.push("Tu Artilugio de primera no es el Monóculo indiscreto.");
    if (motivos.length && !(await this._confirmarExcepcion("Monóculo indiscreto", motivos))) return false;

    const token = game.user.targets.first() ?? null;
    const objetivo = token?.actor ?? null;
    if (!objetivo || objetivo.id === this.id) {
      ui.notifications.warn("Marca con T el Token de la criatura cuya carta superior quieres ver (no puedes ser tú).");
      return false;
    }
    const datos = {
      objetivoUuid: objetivo.uuid, nombreObjetivo: token.name ?? objetivo.name,
      observadorUuid: this.uuid, usuarioId: game.user.id
    };
    if (game.user.isGM) {
      await revelarCartaSuperiorMonoculo(datos);
      return true;
    }
    if (!game.users.activeGM) {
      ui.notifications.warn("No hay ningún Master conectado: el Monóculo necesita que un Master consulte el Mazo.");
      return false;
    }
    game.socket.emit(CANAL_SOCKET, { tipo: "monoculo", datos });
    ui.notifications.info(`Miras con el Monóculo a ${datos.nombreObjetivo}...`);
    return true;
  }

  /**
   * Valores embotellados con «Tiempo embotellado» (`flags.cartas-y-dados.tiempoEmbotellado`).
   * @returns {{valores: number[], tipoDado: string}|null}
   */
  tiempoEmbotellado() {
    const datos = this.getFlag("cartas-y-dados", "tiempoEmbotellado");
    return datos?.valores?.length ? datos : null;
  }

  /**
   * Guarda (o borra, si la tirada es un fallo automático) los dados de una tirada de «Tiempo
   * embotellado». Sustituye a los valores que hubiera embotellados.
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @returns {Promise<void>}
   */
  async _guardarTiempoEmbotellado(tirada) {
    if (tirada.esNegativo) {
      await this.unsetFlag("cartas-y-dados", "tiempoEmbotellado");
      return;
    }
    await this.setFlag("cartas-y-dados", "tiempoEmbotellado", {
      valores: [...tirada.resultadosBase], tipoDado: tirada.tipoDado
    });
  }

  /**
   * Descarta los valores embotellados que queden (botón de la ficha).
   * @returns {Promise<void>}
   */
  async descartarTiempoEmbotellado() {
    await this.unsetFlag("cartas-y-dados", "tiempoEmbotellado");
  }

  /**
   * Tiempo embotellado (v0.16.0): lo llama `tirarDadosSistema` (vía el hablante de la tirada) tras
   * lanzar los dados base y antes de evaluar Crítico y Pifia. Si el Actor tiene valores embotellados
   * y el usuario es su propietario, pregunta qué dados sustituir; cada valor se usa una sola vez y
   * no puede superar el máximo del dado («solo puedes afectar el resultado de los dados»).
   * @param {{resultados: number[], caras: number, titulo: string}} datos
   * @returns {Promise<import("../dados.mjs").SustitucionDado[]>}
   */
  async elegirSustitucionesTiempoEmbotellado({ resultados, caras, titulo }) {
    const embotellado = this.isOwner ? this.tiempoEmbotellado() : null;
    if (!embotellado) return [];
    const escapar = foundry.utils.escapeHTML;
    const opcionesValor = embotellado.valores.map((v, i) =>
      `<option value="${i}">${Math.min(v, caras)}${v > caras ? ` (${v}, máx. d${caras})` : ""} · embotellado n.º ${i + 1}</option>`).join("");
    const filas = resultados.map((r, i) => `
      <div class="form-group">
        <label>Dado ${i + 1}: <strong>${r}</strong></label>
        <select name="dado${i}"><option value="">Mantener ${r}</option>${opcionesValor}</select>
      </div>`).join("");
    const eleccion = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 420 }),
      window: { title: "Tiempo embotellado", icon: "fa-solid fa-hourglass-start" },
      content: `
        <p><strong>${escapar(titulo || "Tirada")}</strong> · d${caras}: [${resultados.join(", ")}]</p>
        <p class="hint">Valores embotellados: [${embotellado.valores.join(", ")}] (${escapar(embotellado.tipoDado ?? "")}). Cada uno se usa una sola vez.</p>
        ${filas}`,
      buttons: [
        { action: "sustituir", label: "Sustituir", icon: "fa-solid fa-hourglass-start", default: true,
          callback: (_e, button) => resultados.map((_, i) => button.form.elements[`dado${i}`]?.value ?? "") },
        { action: "no", label: "No sustituir", icon: "fa-solid fa-xmark", callback: () => null }
      ],
      rejectClose: false
    });
    if (!Array.isArray(eleccion)) return [];

    const usados = new Set();
    const sustituciones = [];
    eleccion.forEach((valor, indice) => {
      if (valor === "") return;
      const idx = Number(valor);
      if (usados.has(idx) || !(idx in embotellado.valores)) return; // cada valor, una sola vez
      usados.add(idx);
      const despues = Math.min(Number(embotellado.valores[idx]) || 1, caras);
      if (despues !== resultados[indice]) sustituciones.push({ indice, antes: resultados[indice], despues });
    });
    if (usados.size) {
      const restantes = embotellado.valores.filter((_, i) => !usados.has(i));
      if (restantes.length) await this.setFlag("cartas-y-dados", "tiempoEmbotellado", { ...embotellado, valores: restantes });
      else await this.unsetFlag("cartas-y-dados", "tiempoEmbotellado");
    }
    return sustituciones;
  }

  /**
   * Datos de Alta Scentia para la ficha del PJ (v0.16.0); null si no hay nada que mostrar.
   * @returns {{primeraCarta: object|null, verPrimera: boolean, artilugio: object|null, monoculo: boolean,
   *   tiempoEmbotellado: object|null}|null}
   */
  contextoAltaScentia() {
    const abalorios = this.abaloriosActivos();
    const verPrimera = abalorios.has("visionFuturo");
    const carta = verPrimera ? this.primeraCartaMazo() : null;
    const claveArtilugio = this._cartasDeAbalorio("artilugio").length ? this.artilugioActual() : null;
    const artilugio = claveArtilugio ? { clave: claveArtilugio, ...SISTEMA_CONFIG.ARTILUGIOS[claveArtilugio] } : null;
    const embotellado = this.tiempoEmbotellado();
    if (!verPrimera && !artilugio && !embotellado) return null;
    return {
      verPrimera,
      primeraCarta: carta ? {
        nombre: nombreVisibleCarta(carta), palo: abreviadoPalo(carta.system.palo), tipoDado: carta.system.tipoDado ?? ""
      } : null,
      artilugio,
      artilugioEnJuego: abalorios.has("artilugio"),
      monoculo: claveArtilugio === "monoculo",
      tiempoEmbotellado: embotellado
    };
  }

  /**
   * Diálogo previo de una Descarga elemental (v0.16.0): cartas CONS de la mano con las que potenciar
   * el ataque (tantas como se quiera) y, con el abalorio Elementalismo En Juego, el elemento.
   * Sin cartas CONS ni Elementalismo no pregunta nada.
   * @param {Item} item - Habilidad con `flags.cartas-y-dados.elemento`.
   * @param {string} elementoBase - Elemento de la habilidad.
   * @returns {Promise<{cartasIds: string[], elemento: string, elementoLibre: string}|null>} null si se cancela.
   */
  async _dialogoDescargaElemental(item, elementoBase) {
    const mano = this.system.pilasDocumentos?.mano;
    const cartasCons = (mano?.cards.contents ?? []).filter(c => c.type === "accion" && c.system.palo === "bastos");
    const elementalismo = this.abaloriosActivos().has("elementalismo");
    if (!cartasCons.length && !elementalismo) return { cartasIds: [], elemento: elementoBase, elementoLibre: "" };

    const escapar = foundry.utils.escapeHTML;
    const dadosCons = this._dadosDeCaracteristica("consciencia");
    const casillas = cartasCons.map(c => `
      <label class="cyd-opcion-radio"><input type="checkbox" name="cons" value="${c.id}" />
        <span>${escapar(nombreVisibleCarta(c))} <small>(CONS · ${dadosCons}${c.system.tipoDado})</small></span></label>`).join("");
    const opcionesElemento = Object.entries(SISTEMA_CONFIG.ELEMENTOS).map(([clave, e]) =>
      `<option value="${clave}" ${clave === elementoBase ? "selected" : ""}>${escapar(e.nombre)} (${escapar(nombreEstadoElemento(clave))})</option>`).join("");
    const eleccion = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 440 }),
      window: { title: item.name, icon: "fa-solid fa-wand-magic-sparkles" },
      content: `
        <fieldset>
          <legend><i class="fa-solid fa-book"></i> Potenciar con cartas de Consciencia</legend>
          ${casillas || '<p class="hint">No tienes cartas CONS en la mano.</p>'}
          ${casillas ? '<p class="hint">Cada carta suma su tirada de Consciencia al ataque y se descarta.</p>' : ""}
        </fieldset>
        ${elementalismo ? `
        <fieldset>
          <legend><i class="fa-solid fa-fire-flame-curved"></i> Elementalismo</legend>
          <div class="form-group"><label>Elemento</label>
            <select name="elemento">${opcionesElemento}<option value="otro">Otro elemento</option></select></div>
          <div class="form-group"><label>Otro elemento</label><input type="text" name="elementoLibre" placeholder="Ácido, sombra..." /></div>
          <p class="hint">Con «Otro elemento», el Master decide y aplica su estado alterado.</p>
        </fieldset>` : ""}`,
      buttons: [
        { action: "lanzar", label: "Lanzar descarga", icon: "fa-solid fa-wand-magic-sparkles", default: true,
          callback: (_e, button) => {
            const f = button.form;
            return {
              cartasIds: [...f.querySelectorAll("input[name='cons']:checked")].map(i => i.value),
              elemento: f.elements.elemento?.value ?? elementoBase,
              elementoLibre: String(f.elements.elementoLibre?.value ?? "").trim()
            };
          } },
        { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
      ],
      rejectClose: false
    });
    return eleccion && typeof eleccion === "object" ? eleccion : null;
  }

  /**
   * Bloques del estado alterado de una Descarga elemental (v0.16.0): «siempre aplicas el estado
   * alterado relacionado» salvo fallo automático. Público: elemento y estado; Master: botón para
   * aplicarlo al objetivo (`.cyd-btn-aplicar-estado`, ver `sistema.mjs`).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @param {string} elemento - Clave de `SISTEMA_CONFIG.ELEMENTOS` u "otro".
   * @param {string} elementoLibre - Nombre del elemento si es "otro".
   * @param {Token|null} tokenObjetivo
   * @returns {{publico: string, master: string}}
   */
  _htmlEstadoDescarga(tirada, elemento, elementoLibre, tokenObjetivo) {
    const escapar = foundry.utils.escapeHTML;
    const config = SISTEMA_CONFIG.ELEMENTOS[elemento] ?? null;
    const nombreElemento = config?.nombre ?? (elementoLibre || "Otro");
    const nombreEstado = config ? nombreEstadoElemento(elemento) : "";
    const icono = config?.icono ?? "fa-fire-flame-curved";
    if (tirada.esNegativo) {
      return { publico: `<p><i class="fa-solid ${icono}"></i> Elemento: <strong>${escapar(nombreElemento)}</strong> · fallo automático: sin estado alterado.</p>`, master: "" };
    }
    const textoEstado = nombreEstado
      ? `aplica <strong>${escapar(nombreEstado)}</strong>`
      : "aplica su estado alterado (lo decide el Master)";
    const publico = `<p><i class="fa-solid ${icono}"></i> Elemento: <strong>${escapar(nombreElemento)}</strong> · ${textoEstado}${tokenObjetivo ? ` a <strong>${escapar(tokenObjetivo.name)}</strong>` : ""}.</p>`;
    const actorObjetivo = tokenObjetivo?.actor ?? null;
    const master = config && actorObjetivo ? `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid ${icono}"></i> Estado alterado <small>(solo Master)</small></h3>
        <button type="button" class="cyd-btn-aplicar-estado" data-actor-uuid="${actorObjetivo.uuid}" data-estado="${config.estado}" data-nombre="${escapar(nombreEstado)}">
          <i class="fa-solid ${icono}"></i> Aplicar ${escapar(nombreEstado)} a ${escapar(tokenObjetivo.name)}
        </button>
      </div>` : "";
    return { publico, master };
  }

  /* ======================================================================== */
  /*  5d. POTENS MYSTICA: ABALORIOS Y HABILIDADES (v0.17.0)                   */
  /* ======================================================================== */

  /**
   * Usuarios que deben ver los avisos privados de este Actor: el Master y sus propietarios.
   * @returns {string[]} IDs de usuario.
   */
  _destinatariosPrivados() {
    return game.users.filter(u => u.isGM || this.testUserPermission(u, "OWNER")).map(u => u.id);
  }

  /**
   * Avisos de chat al quemar una carta MIST (v0.17.0): con «Ojo por ojo» y/o «Preservación
   * espiritual» En Juego, susurra al dueño (y al Master) los botones de cada abalorio para esa carta.
   * Lo llama el hook `createCard` de `sistema.mjs` (pila de Quemadas del Actor).
   * @param {Card} carta - Carta recién creada en Quemadas.
   * @returns {Promise<void>}
   */
  async avisarQuemaMisticismo(carta) {
    if (carta?.type !== "accion" || carta.system.palo !== "copas") return;
    const abalorios = this.abaloriosActivos();
    const ojo = abalorios.has("ojoPorOjo");
    const preservacion = abalorios.has("preservacion");
    if (!ojo && !preservacion) return;
    const escapar = foundry.utils.escapeHTML;
    const valor = valorCarta(carta);
    const nombre = escapar(nombreVisibleCarta(carta));
    const botones = [
      ojo ? `<button type="button" class="cyd-btn-ojo-por-ojo" data-actor-uuid="${this.uuid}" data-carta-id="${carta.id}" data-valor="${valor}">
        <i class="fa-solid fa-scale-balanced"></i> Ojo por ojo (descartar una carta: los enemigos pierden ${valor})
      </button>` : "",
      preservacion ? `<button type="button" class="cyd-btn-preservacion" data-actor-uuid="${this.uuid}" data-carta-id="${carta.id}" data-valor="${valor}">
        <i class="fa-solid fa-recycle"></i> Preservación espiritual (tirada CONS ≥ ${valor})
      </button>` : ""
    ].join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      whisper: this._destinatariosPrivados(),
      content: `
        <div class="cyd-chat-aviso"><i class="fa-solid fa-fire"></i><p><strong>${escapar(this.name)}</strong> ha quemado <strong>${nombre}</strong> (MIST · ${escapar(carta.system.tipoDado ?? "")}, valor ${valor}).</p></div>
        ${botones}`
    });
  }

  /**
   * Ojo por ojo (v0.17.0): tras quemar una carta MIST, descarta otra carta de la mano para que los
   * enemigos que puedas ver (los Tokens marcados con T) pierdan vida igual al valor de la carta MIST.
   * La pérdida de vida no es daño (no la mitiga la Barrera espiritual); la aplica el Master con el
   * botón `.cyd-btn-perder-vida`.
   * @param {number} valor - Valor de la carta MIST quemada (caras de su dado).
   * @returns {Promise<boolean>} true si se descartó la carta.
   */
  async usarOjoPorOjo(valor) {
    if (!this.abaloriosActivos().has("ojoPorOjo")
        && !(await this._confirmarExcepcion("Ojo por ojo no activo", ["El Trinket «Ojo por ojo» no está En Juego."]))) {
      return false;
    }
    const { mano, descarte } = this.system.pilasDocumentos ?? {};
    const cartas = mano?.cards.contents ?? [];
    if (!cartas.length || !descarte) {
      ui.notifications.warn(`${this.name} no tiene cartas en la mano para descartar.`);
      return false;
    }
    const escapar = foundry.utils.escapeHTML;
    const objetivos = [...game.user.targets].filter(t => t.actor && t.actor.id !== this.id);
    const cartaId = await this._elegirCartaDeMano(cartas, {
      titulo: "Ojo por ojo", icono: "fa-solid fa-scale-balanced",
      texto: `<p>Elige la carta de tu mano que <strong>descartas</strong>: los enemigos que puedas ver pierden <strong>${valor}</strong> de vida.</p>
        <p class="hint">${objetivos.length
          ? `Objetivos marcados (T): ${objetivos.map(t => escapar(t.name)).join(", ")}.`
          : "No has marcado objetivos con T: el Master lo aplicará a los Tokens que tenga marcados."}</p>`
    });
    if (!cartaId) return false;
    const descartada = mano.cards.get(cartaId);
    await this._moverCartaEntrePilas(mano, descarte, cartaId);
    this.prepareData();
    const uuids = objetivos.map(t => t.actor.uuid).join(",");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-scale-balanced"></i> Ojo por ojo</h3>
          ${this._lineaCartaUsada(descartada, "Descarta", "Descarte")}
          <p><i class="fa-solid fa-droplet"></i> ${objetivos.length
            ? `${objetivos.map(t => `<strong>${escapar(t.name)}</strong>`).join(", ")} pierden <strong>${valor}</strong> de vida.`
            : `Todos los enemigos que ${escapar(this.name)} puede ver pierden <strong>${valor}</strong> de vida.`}</p>
          <button type="button" class="cyd-btn-perder-vida" data-uuids="${uuids}" data-cantidad="${valor}">
            <i class="fa-solid fa-droplet"></i> Restar ${valor} de Salud ${objetivos.length ? "a los objetivos" : "a los Tokens que tengas marcados"}
          </button>
        </div>`
    });
    if (this.sheet?.rendered) this.sheet.render();
    return true;
  }

  /**
   * Preservación espiritual (v0.17.0): una vez por turno (en combate), tras quemar una carta MIST,
   * tira Consciencia con una carta CONS de la mano (que se descarta como en cualquier acción); si el
   * total iguala o supera el valor máximo de la carta MIST (las caras de su dado), la carta vuelve
   * de Quemadas al Mazo y se baraja.
   * @param {string} cartaQuemadaId - ID de la carta en la pila de Quemadas.
   * @returns {Promise<boolean>} true si se hizo la tirada.
   */
  async usarPreservacionEspiritual(cartaQuemadaId) {
    const motivos = [];
    if (!this.abaloriosActivos().has("preservacion")) motivos.push("El Trinket «Preservación espiritual» no está En Juego.");
    if (this.estaEnCombate() && this.getFlag("cartas-y-dados", "preservacionUsada")) {
      motivos.push("Ya has usado Preservación espiritual este turno.");
    }
    if (motivos.length && !(await this._confirmarExcepcion("Preservación espiritual", motivos))) return false;

    const { mano, mazo, quemadas, descarte } = this.system.pilasDocumentos ?? {};
    const cartaMist = quemadas?.cards.get(cartaQuemadaId) ?? null;
    if (!cartaMist) {
      ui.notifications.warn("La carta ya no está en tus Cartas Quemadas.");
      return false;
    }
    const cartasCons = (mano?.cards.contents ?? []).filter(c => c.type === "accion" && c.system.palo === "bastos");
    if (!cartasCons.length) {
      ui.notifications.warn("Necesitas una carta de Consciencia (CONS) en la mano para la tirada de Preservación espiritual.");
      return false;
    }
    const objetivo = valorCarta(cartaMist);
    const dadosCons = this._dadosDeCaracteristica("consciencia");
    const cartaId = await this._elegirCartaDeMano(cartasCons, {
      titulo: "Preservación espiritual", icono: "fa-solid fa-recycle",
      texto: `<p>Elige la carta CONS con la que tiras Consciencia (${dadosCons} dados). Si sacas <strong>${objetivo}</strong> o más, <strong>${foundry.utils.escapeHTML(nombreVisibleCarta(cartaMist))}</strong> vuelve a tu Mazo en vez de quedarse quemada.</p>`
    });
    if (!cartaId) return false;
    const cartaCons = mano.cards.get(cartaId);

    const tirada = await tirarDadosSistema({
      cantidadDados: dadosCons, tipoDado: cartaCons.system.tipoDado ?? "d6",
      bono: Number(cartaCons.system.automatizacion?.bonoTirada) || 0, rollData: this.getRollData(),
      mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento(),
      speaker: ChatMessage.getSpeaker({ actor: this }), titulo: `Preservación espiritual · ${nombreVisibleCarta(cartaCons)}`
    });
    const exito = !tirada.esNegativo && tirada.total >= objetivo;
    const quemarCons = Boolean(cartaCons.system.seQuema || this.system.agotamiento?.efectos?.quemarAlUsar);
    await this._moverCartaEntrePilas(mano, quemarCons ? quemadas : descarte, cartaCons.id);
    if (exito) await this._devolverCartaQuemadaAlMazo(cartaMist, { quemadas, mazo });
    if (this.estaEnCombate()) await this.setFlag("cartas-y-dados", "preservacionUsada", true);
    this.prepareData();

    const nombreMist = foundry.utils.escapeHTML(nombreVisibleCarta(cartaMist));
    await publicarTirada(tirada, {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `
        <div class="cyd-carta-jugada">
          <h3><i class="fa-solid fa-recycle"></i> Preservación espiritual</h3>
          ${this._lineaCartaUsada(cartaCons, "Carta", quemarCons ? "Carta Quemada" : "Descarte")}
          <p><strong>Tirada:</strong> Consciencia × ${cartaCons.system.tipoDado} · necesita <strong>${objetivo}</strong> (valor máximo de ${nombreMist})</p>
          ${tirada.html}
          <div class="cyd-resolucion-caja ${exito ? "cyd-exito" : "cyd-fallo"}">
            <p>${exito
              ? `<i class="fa-solid fa-recycle"></i> <span class="cyd-resultado-exito">ÉXITO</span>: <strong>${nombreMist}</strong> se baraja en el Mazo en vez de quedarse quemada.`
              : `<i class="fa-solid fa-fire"></i> <span class="cyd-resultado-fallo">FALLO</span>: <strong>${nombreMist}</strong> sigue en Cartas Quemadas.`}</p>
          </div>
        </div>`
    });
    if (this.sheet?.rendered) this.sheet.render();
    return true;
  }

  /**
   * Devuelve una carta de Quemadas a su Mazo y lo baraja (Preservación espiritual), reactivando la
   * original por `sourceCardId` (motor de pilas propio, sin `Cards#pass()`).
   * @param {Card} carta - Carta en Quemadas.
   * @param {{quemadas: Cards, mazo: Cards}} pilas
   * @returns {Promise<void>}
   */
  async _devolverCartaQuemadaAlMazo(carta, { quemadas, mazo }) {
    if (!carta || !quemadas || !mazo) return;
    const sourceId = carta.getFlag("cartas-y-dados", "sourceCardId");
    const original = sourceId ? mazo.cards.get(sourceId) : null;
    if (original?.drawn) {
      await mazo.updateEmbeddedDocuments("Card", [{ _id: original.id, drawn: false }]);
      await quemadas.deleteEmbeddedDocuments("Card", [carta.id]);
    } else {
      const datos = carta.toObject();
      delete datos._id;
      datos.drawn = false;
      datos.origin = null;
      await mazo.createEmbeddedDocuments("Card", [this._normalizarPayloadCarta(datos)]);
      await quemadas.deleteEmbeddedDocuments("Card", [carta.id]);
    }
    await mazo.shuffle({ chatNotification: false });
  }

  /**
   * Diálogo para elegir una carta de una lista (v0.17.0; Ojo por ojo, Preservación, Sellar destino).
   * @param {Card[]} cartas
   * @param {{titulo: string, icono: string, texto: string}} opciones
   * @returns {Promise<string|null>} ID de la carta elegida o null si se cancela.
   */
  async _elegirCartaDeMano(cartas, { titulo, icono, texto }) {
    const escapar = foundry.utils.escapeHTML;
    const botones = cartas.map(c => ({
      action: c.id,
      label: c.type === "trinket"
        ? `${nombreVisibleCarta(c)} (Trinket)`
        : `${nombreVisibleCarta(c)} · ${abreviadoPalo(c.system.palo)} ${c.system.tipoDado ?? ""}`,
      callback: () => c.id
    }));
    botones.push({ action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null });
    const eleccion = await foundry.applications.api.DialogV2.wait({
      ...opcionesDialogoSistema({ width: 440, lista: true }),
      window: { title: escapar(titulo), icon: icono },
      content: texto,
      buttons: botones,
      rejectClose: false
    });
    return typeof eleccion === "string" && eleccion !== "cancelar" ? eleccion : null;
  }

  /**
   * Barrera espiritual (v0.17.0): si el Actor va a recibir daño con el abalorio En Juego, quema cartas
   * de la parte superior de su Mazo; cada una resta la mitad de su valor (caras del dado, redondeo
   * hacia arriba) hasta anular el daño o vaciar el Mazo (vaciarlo no baraja el Descarte).
   * @param {number} dano - Daño entrante.
   * @returns {Promise<{restante: number, quemadas: Card[], mitigado: number}>}
   */
  async _mitigarConBarrera(dano) {
    const { mazo, quemadas } = this.system.pilasDocumentos ?? {};
    const resultado = { restante: dano, quemadas: [], mitigado: 0 };
    if (!mazo || !quemadas) return resultado;
    while (resultado.restante > 0) {
      const carta = this.primeraCartaMazo();
      if (!carta) break;
      const [quemada] = await this._extraerCartasDeMazo(mazo, quemadas, [carta.id]);
      if (!quemada) break;
      const mitiga = Math.ceil(valorCarta(quemada) / 2);
      resultado.quemadas.push({ carta: quemada, mitiga });
      resultado.mitigado += Math.min(mitiga, resultado.restante);
      resultado.restante = Math.max(0, resultado.restante - mitiga);
    }
    return resultado;
  }

  /**
   * Aplica daño a la Salud del Actor (v0.17.0; botón «Aplicar daño» del Master). Con la Barrera
   * espiritual En Juego y cartas en el Mazo pregunta antes si se usa (excepción) y publica, en privado
   * para el Master y los dueños, las cartas quemadas y el daño mitigado.
   * (v0.18.0) Fortis Corpore · Custodio, en este orden:
   * 1. Mártir: el daño del Custodio se duplica; el de un aliado PJ se reduce a la mitad (↑) si el
   *    Master confirma que está en el rango de visión de un Custodio con Mártir En Juego.
   * 2. Barrera espiritual (Potens Mystica).
   * 3. Corazón del dragón: el daño queda en 1 como máximo; al recibirlo, +1 Agotamiento.
   * 4. Último aliento: si el daño dejaría la Salud a 0, se ofrece quemar el abalorio y no perder vida.
   * Tras recibir daño: Corazón de espinas (botón del Master para devolver el Físico al atacante) y
   * Mártir (botón del dueño para quemarlo con una carta CONS).
   * @param {number} dano
   * @param {Object} [opciones]
   * @param {string|null} [opciones.atacanteUuid=null] - (v0.18.0) Actor que causa el daño, si se conoce.
   * @returns {Promise<{aplicado: number, mitigado: number, salud: number}|null>} null si se cancela.
   */
  async aplicarDano(dano, { atacanteUuid = null } = {}) {
    let restante = Math.max(0, Number(dano) || 0);
    let mitigado = 0;
    const escaparHtml = foundry.utils.escapeHTML;
    const abalorios = this.abaloriosActivos();
    const notas = [];
    // 1. (v0.18.0) Mártir: propio (×2) o de un aliado Custodio en rango de visión (÷2, hacia arriba).
    if (restante > 0 && abalorios.has("martir")) {
      notas.push(`<i class="fa-solid fa-hand-holding-heart"></i> Mártir: daño duplicado (${restante} → ${restante * 2})`);
      restante *= 2;
    } else if (restante > 0 && this.type === "personaje") {
      const martires = game.actors.filter(a => a.type === "personaje" && a.id !== this.id
        && typeof a.abaloriosActivos === "function" && a.abaloriosActivos().has("martir"));
      for (const martir of martires) {
        const enVision = await foundry.applications.api.DialogV2.confirm({
          ...opcionesDialogoSistema({ width: 420 }),
          window: { title: "Mártir", icon: "fa-solid fa-hand-holding-heart" },
          content: `<p><strong>${escaparHtml(martir.name)}</strong> tiene el abalorio <strong>Mártir</strong> En Juego. ¿Está <strong>${escaparHtml(this.name)}</strong> en su rango de visión?</p><p class="hint">Si es así, el daño se reduce a la mitad (${restante} → ${Math.ceil(restante / 2)}).</p>`,
          yes: { label: "Sí, reducir a la mitad", icon: "fa-solid fa-hand-holding-heart" },
          no: { label: "No" },
          rejectClose: false
        });
        if (enVision) {
          notas.push(`<i class="fa-solid fa-hand-holding-heart"></i> Mártir de ${escaparHtml(martir.name)}: daño a la mitad (${restante} → ${Math.ceil(restante / 2)})`);
          mitigado += restante - Math.ceil(restante / 2);
          restante = Math.ceil(restante / 2);
          break;
        }
      }
    }
    const mazo = this.system.pilasDocumentos?.mazo;
    if (restante > 0 && this.abaloriosActivos().has("barrera") && mazo?.availableCards.length) {
      const usar = await foundry.applications.api.DialogV2.wait({
        ...opcionesDialogoSistema({ width: 420 }),
        window: { title: "Barrera espiritual", icon: "fa-solid fa-shield-heart" },
        content: `<p><strong>${foundry.utils.escapeHTML(this.name)}</strong> tiene la Barrera espiritual En Juego: en vez de recibir <strong>${restante}</strong> de daño, quema cartas de la parte superior de su Mazo (cada una resta la mitad de su valor).</p>`,
        buttons: [
          { action: "barrera", label: "Usar la Barrera", icon: "fa-solid fa-shield-heart", default: true, callback: () => "barrera" },
          { action: "dano", label: "Recibir el daño (excepción)", icon: "fa-solid fa-droplet", callback: () => "dano" },
          { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
        ],
        rejectClose: false
      });
      if (!usar) return null;
      if (usar === "barrera") {
        const barrera = await this._mitigarConBarrera(restante);
        restante = barrera.restante;
        mitigado = barrera.mitigado;
        const escapar = foundry.utils.escapeHTML;
        const lineas = barrera.quemadas.map(({ carta, mitiga }) =>
          `<li>${escapar(nombreVisibleCarta(carta))} · ${abreviadoPalo(carta.system.palo)} ${carta.system.tipoDado ?? ""} <strong>−${mitiga}</strong></li>`).join("");
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          whisper: this._destinatariosPrivados(),
          content: `
            <div class="cyd-carta-jugada">
              <h3><i class="fa-solid fa-shield-heart"></i> Barrera espiritual</h3>
              <p>Quema ${barrera.quemadas.length} carta(s) de la parte superior del Mazo:</p>
              <ul>${lineas}</ul>
              <p><strong>${mitigado}</strong> de daño mitigado${restante > 0 ? ` · recibe <strong>${restante}</strong> (Mazo vacío)` : " · daño anulado por completo"}.</p>
            </div>`
        });
      }
    }
    // 3. (v0.18.0) Corazón del dragón: como máximo 1 de daño.
    const corazonDragon = this.corazonDragon();
    if (corazonDragon && restante > 1) {
      notas.push(`<i class="fa-solid fa-dragon"></i> Corazón del dragón: daño limitado a 1 (${restante} → 1)`);
      mitigado += restante - 1;
      restante = 1;
    }
    const antes = Number(this.system.salud?.value) || 0;
    // 4. (v0.18.0) Último aliento: caer por daño → se quema el abalorio y no se pierde la vida.
    if (restante > 0 && antes - restante <= 0 && abalorios.has("ultimoAliento")) {
      const usar = await foundry.applications.api.DialogV2.wait({
        ...opcionesDialogoSistema({ width: 420 }),
        window: { title: "Último aliento", icon: "fa-solid fa-heart-crack" },
        content: `<p><strong>${escaparHtml(this.name)}</strong> caería con <strong>${restante}</strong> de daño (Salud ${antes}). Tiene <strong>Último aliento</strong> En Juego: quémalo y no pierde la vida.</p><p class="hint">Solo se aplica al caer en combate por daño.</p>`,
        buttons: [
          { action: "aliento", label: "Quemar Último aliento", icon: "fa-solid fa-heart-crack", default: true, callback: () => "aliento" },
          { action: "dano", label: "Recibir el daño", icon: "fa-solid fa-droplet", callback: () => "dano" },
          { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
        ],
        rejectClose: false
      });
      if (!usar) return null;
      if (usar === "aliento") {
        const trinket = this._cartasDeAbalorio("ultimoAliento").find(c => c.parent?.id === this.system.pilasDocumentos?.enJuego?.id);
        if (trinket) await this.retirarTrinketEnJuego(trinket.id, { quemar: true });
        notas.push(`<i class="fa-solid fa-heart-crack"></i> Último aliento: quema el abalorio y no pierde los ${restante} de vida`);
        mitigado += restante;
        restante = 0;
      }
    }
    const salud = Math.max(0, antes - restante);
    if (salud !== antes) await this.update({ "system.salud.value": salud });
    if (notas.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        whisper: this._destinatariosPrivados(),
        content: `<div class="cyd-carta-jugada"><h3><i class="fa-solid fa-shield-heart"></i> Daño a ${escaparHtml(this.name)}</h3>${notas.map(n => `<p>${n}</p>`).join("")}<p>Recibe <strong>${restante}</strong> de daño.</p></div>`
      });
    }
    if (restante > 0) await this._trasRecibirDano(restante, { atacanteUuid, corazonDragon: Boolean(corazonDragon), abalorios });
    this.prepareData();
    return { aplicado: restante, mitigado, salud };
  }

  /**
   * Efectos de Custodio tras recibir daño (v0.18.0, lo ejecuta el Master desde `aplicarDano`):
   * - Corazón del dragón: +1 Agotamiento.
   * - Corazón de espinas: mensaje para el Master con el botón para aplicar al atacante tanto daño como
   *   el Físico total del Custodio (solo si estaba a distancia cuerpo a cuerpo).
   * - Mártir: mensaje para el dueño con el botón para quemarlo con una carta CONS (reacción gratuita).
   * @param {number} recibido - Daño recibido.
   * @param {{atacanteUuid: string|null, corazonDragon: boolean, abalorios: Set<string>}} contexto
   * @returns {Promise<void>}
   */
  async _trasRecibirDano(recibido, { atacanteUuid, corazonDragon, abalorios }) {
    const escapar = foundry.utils.escapeHTML;
    if (corazonDragon) {
      await this.cambiarAgotamiento(1);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-dragon"></i><p><strong>${escapar(this.name)}</strong> recibe daño con el <strong>Corazón del dragón</strong>: +1 Agotamiento.</p></div>`
      });
    }
    if (abalorios.has("corazonEspinas")) {
      const atacante = atacanteUuid ? await fromUuid(atacanteUuid) : null;
      const fisico = Number(this.system.caracteristicasTotales?.fisico) || 0;
      const boton = atacante && atacante.id !== this.id
        ? `<button type="button" class="cyd-btn-aplicar-dano" data-actor-uuid="${atacante.uuid}" data-dano="${fisico}">
             <i class="fa-solid fa-seedling"></i> Aplicar ${fisico} de Daño a ${escapar(atacante.name)}
           </button>`
        : `<p class="hint">No se conoce al atacante: aplica el daño a mano a la criatura que estaba cuerpo a cuerpo.</p>`;
      await enviarMensajeSoloMaster({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `
          <div class="cyd-carta-jugada">
            <h3><i class="fa-solid fa-seedling"></i> Corazón de espinas <small>(solo Master)</small></h3>
            <p>Si el atacante${atacante ? ` (<strong>${escapar(atacante.name)}</strong>)` : ""} estaba a distancia cuerpo a cuerpo, recibe <strong>${fisico}</strong> de daño (Físico de ${escapar(this.name)}).</p>
            ${boton}
          </div>`
      });
    }
    if (abalorios.has("martir")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        whisper: this._destinatariosPrivados(),
        content: `
          <div class="cyd-carta-jugada">
            <h3><i class="fa-solid fa-hand-holding-heart"></i> Mártir</h3>
            <p>Tras recibir daño, ${escapar(this.name)} puede usar una carta de Consciencia de su mano para quemar el abalorio (reacción gratuita).</p>
            <button type="button" class="cyd-btn-quemar-martir" data-actor-uuid="${this.uuid}">
              <i class="fa-solid fa-fire"></i> Quemar Mártir (carta CONS)
            </button>
          </div>`
      });
    }
  }

  /**
   * Mártir (v0.18.0): reacción gratuita tras recibir daño. Usa una carta CONS de la mano (al Descarte, o
   * a Quemadas con Agotamiento 7+) y quema el abalorio.
   * @returns {Promise<boolean>} true si se ha quemado.
   */
  async quemarMartir() {
    const trinket = this._cartasDeAbalorio("martir").find(c => c.parent?.id === this.system.pilasDocumentos?.enJuego?.id);
    if (!trinket) {
      ui.notifications.warn(`${this.name} no tiene el abalorio Mártir En Juego.`);
      return false;
    }
    const { mano, descarte, quemadas } = this.system.pilasDocumentos ?? {};
    const cartasCons = (mano?.cards.contents ?? []).filter(c => c.type === "accion" && c.system.palo === "bastos");
    if (!cartasCons.length) {
      ui.notifications.warn("Necesitas una carta de Consciencia (Bastos) en la mano para quemar Mártir.");
      return false;
    }
    const cartaId = await this._elegirCartaDeMano(cartasCons, {
      titulo: "Mártir", icono: "fa-solid fa-hand-holding-heart", texto: "Elige la carta de Consciencia con la que quemas el abalorio Mártir."
    });
    const carta = cartaId ? mano.cards.get(cartaId) : null;
    if (!carta) return false;
    const quemarCarta = Boolean(carta.system.seQuema || this.system.agotamiento?.efectos?.quemarAlUsar);
    await this._moverCartaEntrePilas(mano, quemarCarta ? quemadas : descarte, carta.id);
    await this.retirarTrinketEnJuego(trinket.id, { quemar: true });
    this.prepareData();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-carta-jugada"><h3><i class="fa-solid fa-hand-holding-heart"></i> Mártir</h3>${this._lineaCartaUsada(carta, "Quema el abalorio", quemarCarta ? "Carta Quemada" : "Descarte")}</div>`
    });
    if (this.sheet?.rendered) this.sheet.render();
    return true;
  }

  /**
   * Corazón del dragón activo (v0.18.0, `flags.cartas-y-dados.corazonDragon`).
   * @returns {{turnos: number}|null}
   */
  corazonDragon() {
    const datos = this.getFlag("cartas-y-dados", "corazonDragon");
    return Number(datos?.turnos) > 0 ? datos : null;
  }

  /**
   * Activa (o renueva) el Corazón del dragón durante `turnos` turnos (v0.18.0, al usar la habilidad).
   * @param {number} turnos
   * @returns {Promise<void>}
   */
  async activarCorazonDragon(turnos) {
    const n = Math.max(1, Math.floor(Number(turnos) || 1));
    await this.setFlag("cartas-y-dados", "corazonDragon", { turnos: n });
  }

  /**
   * Retira el Corazón del dragón (ficha o fin de su duración).
   * @returns {Promise<void>}
   */
  async retirarCorazonDragon() {
    if (this.getFlag("cartas-y-dados", "corazonDragon")) await this.unsetFlag("cartas-y-dados", "corazonDragon");
  }

  /**
   * Fin de turno en combate (`SistemaCombat`, v0.18.0): el Corazón del dragón pierde un turno.
   * @returns {Promise<void>}
   */
  async avanzarCorazonDragon() {
    const datos = this.corazonDragon();
    if (!datos || !this.isOwner) return;
    const turnos = Number(datos.turnos) - 1;
    if (turnos > 0) {
      await this.setFlag("cartas-y-dados", "corazonDragon", { ...datos, turnos });
      return;
    }
    await this.retirarCorazonDragon();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-dragon"></i><p>El <strong>Corazón del dragón</strong> de <strong>${foundry.utils.escapeHTML(this.name)}</strong> se apaga.</p></div>`
    });
  }

  /**
   * Maldición «Mal de ojo» activa (`flags.cartas-y-dados.malDeOjo`).
   * @returns {{turnos: number, origen: string}|null}
   */
  malDeOjo() {
    const datos = this.getFlag("cartas-y-dados", "malDeOjo");
    return Number(datos?.turnos) > 0 ? datos : null;
  }

  /**
   * Dado de una carta MIST (o del dado de Misticismo de un PNJ) con «Mal de ojo» (v0.17.0).
   * @param {string} tipoDado - Dado original.
   * @returns {{tipoDado: string, resultadoFijo: number|null, motivoFijo: string}|null} null sin maldición.
   */
  _ajusteMalDeOjo(tipoDado) {
    if (!this.malDeOjo()) return null;
    return { ...dadoReducidoMalDeOjo(tipoDado), motivoFijo: "Mal de ojo (carta d4)" };
  }

  /**
   * Etiqueta de chat de una tirada afectada por «Mal de ojo».
   * @param {string} [dadoOriginal=""] - Dado antes de reducirlo.
   * @returns {string}
   */
  _etiquetaMalDeOjo(dadoOriginal = "") {
    const reducido = dadoOriginal ? dadoReducidoMalDeOjo(dadoOriginal) : null;
    const detalle = reducido
      ? (reducido.resultadoFijo !== null ? `: ${dadoOriginal} → resultado 1` : `: ${dadoOriginal} → ${reducido.tipoDado}`)
      : ": −1 categoría de dado MIST";
    return `<span class="cyd-tag-accion"><i class="fa-solid fa-eye-slash"></i> Mal de ojo${detalle}</span>`;
  }

  /**
   * Aplica (o renueva) «Mal de ojo» durante `turnos` turnos (botón del Master).
   * @param {number} turnos
   * @param {string} [origen=""] - Nombre de quien maldice.
   * @returns {Promise<void>}
   */
  async aplicarMalDeOjo(turnos, origen = "") {
    const n = Math.max(1, Math.floor(Number(turnos) || 1));
    await this.setFlag("cartas-y-dados", "malDeOjo", { turnos: n, origen: String(origen ?? "") });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-eye-slash"></i><p><strong>${foundry.utils.escapeHTML(this.name)}</strong> está bajo el <strong>Mal de ojo</strong>${origen ? ` de ${foundry.utils.escapeHTML(origen)}` : ""} durante <strong>${n} turno(s)</strong>: sus cartas de Misticismo bajan una categoría de dado.</p></div>`
    });
  }

  /**
   * Retira «Mal de ojo» (ficha o fin de su duración).
   * @returns {Promise<void>}
   */
  async retirarMalDeOjo() {
    if (this.getFlag("cartas-y-dados", "malDeOjo")) await this.unsetFlag("cartas-y-dados", "malDeOjo");
  }

  /**
   * Fin de turno en combate (`SistemaCombat`): «Mal de ojo» pierde un turno y, al llegar a 0, termina.
   * @returns {Promise<void>}
   */
  async avanzarMalDeOjo() {
    const datos = this.malDeOjo();
    if (!datos || !this.isOwner) return;
    const turnos = Number(datos.turnos) - 1;
    if (turnos > 0) {
      await this.setFlag("cartas-y-dados", "malDeOjo", { ...datos, turnos });
      return;
    }
    await this.retirarMalDeOjo();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-eye"></i><p>El <strong>Mal de ojo</strong> sobre <strong>${foundry.utils.escapeHTML(this.name)}</strong> se desvanece.</p></div>`
    });
  }

  /**
   * Destino sellado activo (`flags.cartas-y-dados.destinoSellado`, «Sellar destino»).
   * @returns {{palo: string, origen: string}|null}
   */
  destinoSellado() {
    const datos = this.getFlag("cartas-y-dados", "destinoSellado");
    return datos?.palo ? datos : null;
  }

  /**
   * Comprueba el destino sellado antes de una acción (v0.17.0): la siguiente acción debe ser de la
   * característica sellada; otra distinta pide confirmar una excepción. Realizada la acción, el
   * efecto termina (`retirarDestinoSellado`, junto a `_marcarAccionMiniTurno`): cancelar un diálogo
   * posterior no lo consume.
   * @param {string} claveCaract - Característica de la acción.
   * @returns {Promise<boolean>} false si el usuario cancela.
   */
  async _cumplirDestinoSellado(claveCaract) {
    const destino = this.destinoSellado();
    if (!destino || !this.isOwner) return true;
    const caractSellada = SISTEMA_CONFIG.palosCartas[destino.palo]?.caracteristicaAsociada ?? null;
    if (caractSellada && caractSellada !== claveCaract
        && !(await this._confirmarExcepcion("Destino sellado", [
          `${destino.origen || "Alguien"} ha sellado tu destino: tu acción debe ser de ${nombreCaracteristica(caractSellada)} (${abreviadoPalo(destino.palo)}).`
        ]))) {
      return false;
    }
    return true;
  }

  /**
   * Retira el destino sellado (ficha).
   * @returns {Promise<void>}
   */
  async retirarDestinoSellado() {
    if (this.getFlag("cartas-y-dados", "destinoSellado")) await this.unsetFlag("cartas-y-dados", "destinoSellado");
  }

  /**
   * Sellar destino (v0.17.0), antes de consumir la carta MIST: elige la carta de la mano que se
   * descarta (no la MIST de la habilidad) y la descarta. El objetivo es el Token marcado con T.
   * @param {Item} item - Habilidad.
   * @param {Card|null} cartaMist - Carta MIST que se quema (se excluye de la elección).
   * @returns {Promise<{html: string}|null>} HTML del efecto para el chat; null si se cancela.
   */
  async _prepararSellarDestino(item, cartaMist) {
    const { mano, descarte } = this.system.pilasDocumentos ?? {};
    const cartas = (mano?.cards.contents ?? []).filter(c => c.type === "accion" && c.id !== cartaMist?.id);
    if (!cartas.length || !descarte) {
      ui.notifications.warn("Sellar destino necesita otra Carta de Acción en tu mano para descartarla.");
      return null;
    }
    const escapar = foundry.utils.escapeHTML;
    const token = game.user.targets.first() ?? null;
    const objetivo = token?.actor && token.actor.id !== this.id ? token.actor : null;
    const cartaId = await this._elegirCartaDeMano(cartas, {
      titulo: item.name, icono: "fa-solid fa-lock",
      texto: `<p>Elige la carta que <strong>descartas</strong>: ${objetivo
        ? `<strong>${escapar(token.name)}</strong>` : "la criatura objetivo"} deberá realizar una acción de su característica.</p>
        ${objetivo ? "" : '<p class="hint"><i class="fa-solid fa-crosshairs"></i> Marca con <strong>T</strong> el Token objetivo para automatizar el efecto.</p>'}`
    });
    if (!cartaId) return null;
    const carta = mano.cards.get(cartaId);
    const palo = carta.system.palo;
    const caract = nombreCaracteristica(SISTEMA_CONFIG.palosCartas[palo]?.caracteristicaAsociada);
    await this._moverCartaEntrePilas(mano, descarte, cartaId);
    const nombreObjetivo = objetivo ? escapar(token.name ?? objetivo.name) : "";
    const html = `
      ${this._lineaCartaUsada(carta, "Descarta", "Descarte")}
      <div class="cyd-resolucion-caja">
        <p><i class="fa-solid fa-lock"></i> ${objetivo ? `<strong>${nombreObjetivo}</strong>` : "La criatura objetivo"} está obligada a realizar una acción de <strong>${escapar(caract)} (${abreviadoPalo(palo)})</strong>. Si no tiene ninguna carta de ese palo en la mano, descarta la mano, roba una nueva y el efecto desaparece.</p>
        ${objetivo ? `
        <button type="button" class="cyd-btn-sellar-destino" data-actor-uuid="${objetivo.uuid}" data-palo="${palo}" data-origen="${escapar(this.name)}" data-nombre="${nombreObjetivo}">
          <i class="fa-solid fa-lock"></i> Sellar el destino de ${nombreObjetivo}
        </button>` : ""}
      </div>`;
    return { html };
  }

  /**
   * Resuelve «Sellar destino» sobre este Actor (botón del Master, v0.17.0): si tiene mano y ninguna
   * Carta de Acción del palo sellado, descarta la mano y roba una nueva (el efecto desaparece); si no,
   * guarda el destino sellado hasta su siguiente acción. Un PNJ sin Mazo de Jefe queda sellado
   * (el Master comprueba sus opciones).
   * @param {string} palo - Palo de la carta descartada.
   * @param {string} [origen=""] - Quien sella el destino.
   * @returns {Promise<void>}
   */
  async resolverSellarDestino(palo, origen = "") {
    const escapar = foundry.utils.escapeHTML;
    const { mano, descarte } = this.system.pilasDocumentos ?? {};
    const etiqueta = `${nombreCaracteristica(SISTEMA_CONFIG.palosCartas[palo]?.caracteristicaAsociada)} (${abreviadoPalo(palo)})`;
    let texto;
    if (mano && descarte && !mano.cards.some(c => c.type === "accion" && c.system.palo === palo)) {
      for (const id of mano.cards.map(c => c.id)) await this._moverCartaEntrePilas(mano, descarte, id);
      await this.robarHastaLimiteMano();
      await this.retirarDestinoSellado();
      texto = `<strong>${escapar(this.name)}</strong> no tiene cartas de ${etiqueta} en la mano: la descarta, roba una nueva y el destino sellado desaparece.`;
    } else {
      await this.setFlag("cartas-y-dados", "destinoSellado", { palo, origen: String(origen ?? "") });
      texto = `${origen ? `${escapar(origen)} sella` : "Queda sellado"} el destino de <strong>${escapar(this.name)}</strong>: su siguiente acción debe ser de <strong>${etiqueta}</strong>.`;
    }
    this.prepareData();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-lock"></i><p>${texto}</p></div>`
    });
    if (this.sheet?.rendered) this.sheet.render();
  }

  /**
   * Estados de Potens Mystica sobre este Actor para las fichas de PJ y PNJ (v0.17.0).
   * @returns {{malDeOjo: object|null, destinoSellado: object|null}|null} null si no hay ninguno.
   */
  contextoEstadosMisticos() {
    const mal = this.malDeOjo();
    const destino = this.destinoSellado();
    const dragon = this.corazonDragon(); // (v0.18.0) Custodio
    if (!mal && !destino && !dragon) return null;
    return {
      corazonDragon: dragon ? { turnos: Number(dragon.turnos) } : null,
      malDeOjo: mal ? { turnos: Number(mal.turnos), origen: mal.origen ?? "" } : null,
      destinoSellado: destino ? {
        palo: abreviadoPalo(destino.palo),
        caracteristica: nombreCaracteristica(SISTEMA_CONFIG.palosCartas[destino.palo]?.caracteristicaAsociada),
        origen: destino.origen ?? ""
      } : null
    };
  }

  /**
   * Vuelve a dejar disponible la reacción (inicio del turno del Actor, fin de combate,
   * descanso o a mano desde la ficha).
   * @returns {Promise<void>}
   */
  async restablecerReaccion() {
    if (!this.isOwner) return;
    // (v0.15.0) También el uso por turno de los abalorios Empatía y (v0.17.0) Preservación espiritual.
    for (const clave of ["reaccionUsada", "empatiaUsada", "preservacionUsada"]) {
      if (this.getFlag("cartas-y-dados", clave)) await this.unsetFlag("cartas-y-dados", clave);
    }
  }

  /**
   * Estado de acciones para las fichas: combate, reacción y mini turno fuera de combate.
   * @returns {{enCombate: boolean, reaccionUsada: boolean, sinReacciones: boolean,
   *   miniTurno: {manos: number, esReaccion: boolean}|null, cartasMiniTurno: number}}
   */
  contextoAcciones() {
    const mini = this.getFlag("cartas-y-dados", "miniTurno") ?? null;
    return {
      enCombate: this.estaEnCombate(),
      reaccionUsada: Boolean(this.getFlag("cartas-y-dados", "reaccionUsada")),
      sinReacciones: Boolean(this.system.agotamiento?.efectos?.sinReacciones),
      miniTurno: mini?.manos ? { manos: Number(mini.manos) || 0, esReaccion: Boolean(mini.esReaccion) } : null,
      cartasMiniTurno: Math.max(1, Number(this.system.limiteMano) || 1) * 2
    };
  }

  /**
   * Inicia un «mini turno» fuera de combate: roba el doble de su Mano Máx. Si es una reacción
   * (de jugador o PNJ), solo podrá robar esta vez y solo cuando quien inició la acción haya
   * elegido su carta (lo recuerda el chat). En combate pide confirmar como excepción.
   * @param {{reaccion?: boolean}} [opciones]
   * @returns {Promise<boolean>} true si se inició.
   */
  async iniciarMiniTurno({ reaccion = false } = {}) {
    const { mazo, mano, descarte } = this.system.pilasDocumentos ?? {};
    if (!mazo || !mano || !descarte) {
      ui.notifications.warn("Inicializa las pilas de cartas antes de actuar fuera de combate.");
      return false;
    }
    if (this.getFlag("cartas-y-dados", "miniTurno")?.manos) {
      ui.notifications.warn(`${this.name} ya tiene una acción fuera de combate en curso: termínala antes de empezar otra.`);
      return false;
    }
    const motivos = [];
    if (this.estaEnCombate()) motivos.push("Está en combate: en combate las cartas se roban al inicio de su turno.");
    if (reaccion && this.system.agotamiento?.efectos?.sinReacciones) {
      motivos.push(`Tiene Agotamiento ${this.system.agotamiento.nivel}: no puede realizar reacciones.`);
    }
    if (motivos.length && !(await this._confirmarExcepcion("Acción fuera de combate", motivos))) return false;

    const limite = Math.max(1, Number(this.system.limiteMano) || 1);
    const cantidad = limite * 2;
    await this.robarCantidadCartas(cantidad);
    await this.setFlag("cartas-y-dados", "miniTurno", { manos: 2, esReaccion: reaccion });

    const texto = reaccion
      ? `reacciona fuera de combate: roba <strong>${cantidad}</strong> cartas (el doble de su Mano Máx. ${limite}), una sola vez: no puede robar más y, si no tiene la carta adecuada, la reacción falla. Solo puede reaccionar cuando quien inició la acción haya elegido su carta.`
      : `inicia una acción fuera de combate: roba <strong>${cantidad}</strong> cartas (el doble de su Mano Máx. ${limite}). Puede seguir robando manos de ${limite}; cada mano extra tarda un turno más.`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid ${reaccion ? "fa-bolt" : "fa-hourglass-start"}"></i><p><strong>${this.name}</strong> ${texto}</p></div>`
    });
    return true;
  }

  /**
   * Mini turno: roba otra mano (tantas cartas como la Mano Máx.); la acción tarda un turno más.
   * Una reacción fuera de combate solo roba una vez: no puede robar más manos; si no tiene la
   * carta adecuada, la reacción falla (`terminarMiniTurno`).
   * @returns {Promise<boolean>}
   */
  async robarOtraManoMiniTurno() {
    const mini = this.getFlag("cartas-y-dados", "miniTurno");
    if (!mini?.manos) {
      ui.notifications.warn("No hay ninguna acción fuera de combate en curso.");
      return false;
    }
    if (mini.esReaccion) {
      ui.notifications.warn("Una reacción fuera de combate solo roba una mano: si no tienes la carta adecuada, la reacción falla.");
      return false;
    }

    const limite = Math.max(1, Number(this.system.limiteMano) || 1);
    await this.robarCantidadCartas(limite);
    const manos = (Number(mini.manos) || 2) + 1;
    await this.setFlag("cartas-y-dados", "miniTurno", { ...mini, manos });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-clone"></i><p><strong>${this.name}</strong> no está satisfecho y roba otra mano (<strong>${limite}</strong> cartas). La acción ya le lleva <strong>${manos - 1}</strong> turno(s) más de lo normal.</p></div>`
    });
    return true;
  }

  /**
   * Si hay un mini turno en curso, anota que ya se ha usado una carta en él (una reacción que
   * termina sin usar ninguna falla).
   * @returns {Promise<void>}
   */
  async _marcarAccionMiniTurno() {
    const mini = this.getFlag("cartas-y-dados", "miniTurno");
    if (mini?.manos && !mini.accionRealizada) {
      await this.setFlag("cartas-y-dados", "miniTurno", { ...mini, accionRealizada: true });
    }
  }

  /**
   * Termina el mini turno fuera de combate. Pregunta qué hacer con las cartas que quedan en
   * la mano: descartarlas (por defecto), devolverlas al Mazo o conservarlas (excepción).
   * Una reacción que termina sin haber usado ninguna carta (`miniTurno.accionRealizada`) falla.
   * @returns {Promise<boolean>} true si se terminó.
   */
  async terminarMiniTurno() {
    const { mazo, mano, descarte } = this.system.pilasDocumentos ?? {};
    const restantes = mano?.cards.size ?? 0;
    const mini = this.getFlag("cartas-y-dados", "miniTurno") ?? {};
    const reaccionFallida = Boolean(mini.esReaccion && !mini.accionRealizada);
    let destino = "conservar";
    if (restantes > 0) {
      const respuesta = await foundry.applications.api.DialogV2.wait({
        ...opcionesDialogoSistema({ width: 460, lista: true }),
        window: { title: "Terminar acción fuera de combate", icon: "fa-solid fa-hourglass-end" },
        content: `${reaccionFallida ? "<p><strong>No ha usado ninguna carta: la reacción falla.</strong></p>" : ""}<p>Quedan <strong>${restantes}</strong> carta(s) en la mano de <strong>${foundry.utils.escapeHTML(this.name)}</strong>. ¿Qué se hace con ellas?</p>`,
        buttons: [
          { action: "descartar", label: "Descartarlas", icon: "fa-solid fa-box-archive", default: true, callback: () => "descartar" },
          { action: "mazo", label: "Devolverlas al Mazo y barajar", icon: "fa-solid fa-layer-group", callback: () => "mazo" },
          { action: "conservar", label: "Conservarlas en la mano", icon: "fa-solid fa-hand", callback: () => "conservar" },
          { action: "cancelar", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => "cancelar" }
        ],
        rejectClose: false
      });
      if (!["descartar", "mazo", "conservar"].includes(respuesta)) return false;
      destino = respuesta;
    }

    if (destino === "descartar") {
      for (const carta of [...mano.cards]) await this._moverCartaEntrePilas(mano, descarte, carta.id);
    } else if (destino === "mazo") {
      await this._devolverCartasASuMazoOriginal(mano);
      await mazo.shuffle({ chatNotification: false });
      if (this.system.pilasDocumentos.trinkets) await this.system.pilasDocumentos.trinkets.shuffle({ chatNotification: false });
    }
    await this.unsetFlag("cartas-y-dados", "miniTurno");
    this.prepareData();

    const textos = {
      descartar: "y descarta las cartas que no ha usado",
      mazo: "y devuelve a su Mazo las cartas que no ha usado",
      conservar: restantes ? "y conserva en la mano las cartas que no ha usado" : ""
    };
    const mensaje = reaccionFallida
      ? `<div class="cyd-chat-aviso"><i class="fa-solid fa-ban"></i><p><strong>${this.name}</strong> no encuentra la carta adecuada: <strong>la reacción falla</strong>${textos[destino] ? ` (${textos[destino].replace(/^y /, "")})` : ""}.</p></div>`
      : `<div class="cyd-chat-aviso"><i class="fa-solid fa-hourglass-end"></i><p><strong>${this.name}</strong> termina su ${mini.esReaccion ? "reacción" : "acción"} fuera de combate ${textos[destino]}.</p></div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: mensaje });
    return true;
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

    // (v0.15.0) Un Abalorio Eterno que deja de estar en juego siempre se quema.
    const eterno = this._esAbalorioEterno(trinket);
    if (eterno) quemar = true;
    const destino = quemar ? quemadas : descarte;
    const textoAccion = quemar ? "quema" : "descarta";
    const iconoAccion = quemar ? '<i class="fa-solid fa-fire"></i>' : '<i class="fa-solid fa-box-archive"></i>';

    await this._moverCartaEntrePilas(enJuego, destino, trinket.id);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="cyd-chat-aviso">${iconoAccion}<p><strong>${this.name}</strong> ${textoAccion} su Trinket activo <strong>${nombreVisibleCarta(trinket)}</strong>${eterno ? " (Abalorio Eterno: al dejar de estar en juego se quema)" : ""}.</p></div>`
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

    // (v0.15.0) Un Abalorio Eterno sigue En Juego (`_devolverCartasASuMazoOriginal`); por si estaba fuera de sitio.
    await this._asegurarAbaloriosEternos();
    // (v0.14.0) Termina la escena: reacción disponible y sin acción fuera de combate en curso.
    await this._limpiarEstadoAcciones();
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
    // (v0.15.0) Un Abalorio Eterno que sale de Quemadas vuelve directamente a estar En Juego.
    await this._asegurarAbaloriosEternos();
    await this._limpiarEstadoAcciones();
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

  /**
   * (v0.14.0) Restablece la reacción y cierra cualquier acción fuera de combate en curso
   * (fin de escena/combate y descanso: las cartas de la mano ya han vuelto a su mazo).
   * @returns {Promise<void>}
   */
  async _limpiarEstadoAcciones() {
    if (!this.isOwner) return;
    for (const clave of ["reaccionUsada", "miniTurno", "empatiaUsada", "preservacionUsada"]) {
      if (this.getFlag("cartas-y-dados", clave)) await this.unsetFlag("cartas-y-dados", clave);
    }
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
   * @param {boolean} [datos.valorX=false] - (v0.15.0) La tirada fija el valor X de una habilidad.
   * @returns {Object|null}
   */
  _datosRepeticionTirada(tirada, {
    titulo, esAtaque = false, etiquetaDificultad = "Dificultad del Master", valorX = false, efectoX = null, tokenObjetivo = null,
    numeroCarta = null
  }) {
    if (!tieneRasgoRacial(this, "esperaUnMomento")) return null;
    const objetivo = esAtaque ? game.user.targets.first() ?? null : tokenObjetivo;
    return {
      actorUuid: this.uuid,
      titulo: String(titulo ?? "Tirada"),
      cantidadDados: tirada.cantidadDados,
      tipoDado: tirada.tipoDado,
      bono: tirada.bono,
      esAtaque: Boolean(esAtaque),
      etiquetaDificultad,
      objetivoTokenUuid: objetivo?.document?.uuid ?? null,
      // (v0.15.0) La repetición vuelve a mostrar el valor X en vez de compararse con la Dificultad.
      valorX: Boolean(valorX),
      efectoX: efectoX ?? null,
      numeroCarta: numeroCarta ?? null, // (v0.16.0) Manifestar arma
      // (v0.17.0) Mal de ojo sobre una carta d4: la repetición vuelve a dar el resultado fijo.
      resultadoFijo: tirada.resultadosBase?.length === 0 && !tirada.combinada ? tirada.total : null,
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
      rollData: this.getRollData(), mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento(),
      speaker: ChatMessage.getSpeaker({ actor: this }), titulo: `Espera un momento · ${datos.titulo}`,
      resultadoFijo: datos.resultadoFijo ?? null, motivoFijo: "Mal de ojo (carta d4)"
    });
    const tokenObjetivo = datos.objetivoTokenUuid ? (fromUuidSync(datos.objetivoTokenUuid) ?? null) : null;
    // (v0.16.0) Tiempo embotellado: la nueva tirada sustituye a los dados apuntados.
    if (datos.efectoX === "tiempoEmbotellado") await this._guardarTiempoEmbotellado(tirada);
    // (v0.18.0) Corazón del dragón: la repetición fija la nueva duración (o lo retira si falla).
    if (datos.efectoX === "corazonDragon") {
      if (!tirada.esNegativo && Number(tirada.total) > 0) await this.activarCorazonDragon(Number(tirada.total));
      else await this.retirarCorazonDragon();
    }
    const resolucion = datos.valorX
      ? {
        publico: this._htmlValorX(tirada, { efectoX: datos.efectoX ?? null, tokenObjetivo, numeroCarta: datos.numeroCarta ?? null }),
        master: this._htmlMasterValorX(tirada, { efectoX: datos.efectoX ?? null, tokenObjetivo })
      }
      : this._htmlResolucionTirada(tirada, datos.esAtaque, datos.etiquetaDificultad, { tokenObjetivo });

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
    // (v0.17.0) Sellar destino: la acción debe ser de la característica sellada (salvo excepción).
    if (!(await this._cumplirDestinoSellado(caracteristica))) return null;
    const cantidadDados = this.system.caracteristicasTotales?.[caracteristica]
      ?? this.system.caracteristicas?.[caracteristica]
      ?? 1;

    const bono = Number(bonoTirada) || 0;
    // (v0.17.0) Mal de ojo: el dado de Misticismo baja una categoría.
    const malDeOjo = caracteristica === "misticismo" ? this._ajusteMalDeOjo(tipoDado) : null;
    const tirada = await tirarDadosSistema({
      cantidadDados, tipoDado: malDeOjo?.tipoDado ?? tipoDado, bono, rollData: this.getRollData(),
      mitadPorAgotamiento: this._tiradasAMitadPorAgotamiento(),
      speaker: ChatMessage.getSpeaker({ actor: this }), titulo,
      resultadoFijo: malDeOjo?.resultadoFijo ?? null, motivoFijo: malDeOjo?.motivoFijo ?? ""
    });
    const resolucion = this._htmlResolucionTirada(tirada, esAtaque, "Dificultad");
    const bloqueResolucionHtml = tirada.html + resolucion.publico;
    const htmlMaster = resolucion.master;

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3>${esAtaque ? '<i class="fa-solid fa-crosshairs"></i>' : '<i class="fa-solid fa-bolt"></i>'} ${titulo}</h3>
        ${malDeOjo ? `<p class="cyd-tags-accion-fila">${this._etiquetaMalDeOjo(tipoDado)}</p>` : ""}
        <p><strong>Atributo:</strong> ${caracteristica.toUpperCase()} (${cantidadDados}${malDeOjo?.tipoDado ?? tipoDado})</p>
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
    await this.retirarDestinoSellado(); // (v0.17.0) Sellar destino: la acción ya se ha realizado

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
   * @param {Object} [opciones] - (v0.14.0) Desde el diálogo de acción de una carta MIST.
   * @param {string|null} [opciones.cartaId=null] - Carta MIST de la mano ya elegida (sin diálogo de selección).
   * @param {boolean} [opciones.reaccion=false] - Se usa como reacción (ver `_autorizarReaccion`).
   * @returns {Promise<import("../dados.mjs").ResultadoTiradaSistema|null>} Tirada (con Crítico/Pifia) o null.
   */
  async usarHabilidad(itemId, { cartaId = null, reaccion = false } = {}) {
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

    // (v0.14.0) Reacción: Agotamiento 4+ y una por turno en combate (salvo excepción).
    if (reaccion && !(await this._autorizarReaccion())) return null;

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

      cartaElegida = cartasMisticismo.find(c => c.id === cartaId)
        ?? await this._elegirCartaMisticismo(cartasMisticismo, item.name);
      if (!cartaElegida) return null; // El jugador canceló la selección.

      numero = Number(cartaElegida.system.numero) || 1;
      tipoDado = cartaElegida.system.tipoDado || SISTEMA_CONFIG.dadoPorNumeroCarta[numero] || "d6";
    } else {
      // PNJ sin Mazo de Jefe: el dado de Misticismo configurado en su ficha.
      tipoDado = this.system.dadosCaracteristicas?.misticismo || "d6";
    }

    // (v0.17.0) Sellar destino: una habilidad es una acción de Misticismo.
    if (!(await this._cumplirDestinoSellado("misticismo"))) return null;
    // (v0.17.0) Mal de ojo: la carta MIST (o el dado del PNJ) baja una categoría.
    const malDeOjo = this._ajusteMalDeOjo(tipoDado);
    const tipoDadoCarta = tipoDado;
    if (malDeOjo) tipoDado = malDeOjo.tipoDado;

    // (v0.16.0) Descarga elemental (`flags.cartas-y-dados.elemento`): antes de tirar se eligen las
    // cartas CONS con las que potenciarla y, con Elementalismo, el elemento. Cancelar no gasta nada.
    const elementoBase = item.getFlag("cartas-y-dados", "elemento");
    const esDescarga = Boolean(SISTEMA_CONFIG.ELEMENTOS[elementoBase]) && item.system.requiereTirada !== false;
    const descarga = esDescarga ? await this._dialogoDescargaElemental(item, elementoBase) : null;
    if (esDescarga && !descarga) return null;
    const cartasDescarga = (descarga?.cartasIds ?? [])
      .map(id => mano?.cards.get(id) ?? null)
      .filter(c => c && c.type === "accion" && c.system.palo === "bastos");

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
      ? `<p><i class="fa-solid fa-moon"></i> <strong>Carta de Misticismo:</strong> ${nombreCarta} <small>MIST · ${tipoDadoCarta} (Valor ${numero})</small></p>`
      : `<p><small>Sin Mazo de Jefe: habilidad usada sin consumir carta de Misticismo.</small></p>`;
    const lineaQuemada = cartaElegida
      ? `<p class="cyd-nota-quemada"><small><i class="fa-solid fa-fire"></i> La carta <strong>${nombreCarta}</strong> fue <strong>quemada</strong> y enviada a Cartas Quemadas.</small></p>`
      : "";

    // Habilidad sin tirada: efecto directo, consumiendo la carta de Misticismo.
    if (item.system.requiereTirada === false) {
      // (v0.17.0) Sellar destino: antes se elige la carta que se descarta (cancelar no gasta nada).
      const sellar = item.getFlag("cartas-y-dados", "efectoX") === "sellarDestino"
        ? await this._prepararSellarDestino(item, cartaElegida)
        : null;
      if (item.getFlag("cartas-y-dados", "efectoX") === "sellarDestino" && !sellar) return null;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `
          <div class="cyd-carta-jugada">
            <h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.name}</h3>
            ${lineaCartaUsada}
            ${sellar?.html ?? "<p><strong>Efecto:</strong> aplicado directamente sin tirada de dados.</p>"}
            ${item.system.descripcion ? `<div class="cyd-efecto">${item.system.descripcion}</div>` : ""}
            ${lineaQuemada}
          </div>
        `
      });
      // Automatización (curación, cambio de cansancio y robo de cartas) si está configurada.
      await this._aplicarAutomatizacionHabilidad(item);

      if (cartaElegida) await this._moverCartaEntrePilas(mano, quemadas, cartaElegida.id);
      if (reaccion && this.estaEnCombate()) await this.setFlag("cartas-y-dados", "reaccionUsada", true);
      await this._registrarUltimaCaracteristica("misticismo"); // (v0.15.0) abalorio Amistad
    await this._marcarAccionMiniTurno();
    await this.retirarDestinoSellado(); // (v0.17.0) Sellar destino: la acción ya se ha realizado
      this.prepareData();
      if (this.sheet?.rendered) this.sheet.render();
      return null;
    }

    // Habilidad con tirada: XdY de Misticismo (v0.15.0: +1 dado con el abalorio Amistad).
    const bono = bonoTirada;
    const amistad = this._bonoDadoAmistad("misticismo");
    const mitadPorAgotamiento = this._tiradasAMitadPorAgotamiento();
    const hayPartes = cartasDescarga.length > 0;
    const partes = [{
      tirada: await tirarDadosSistema({
        cantidadDados: cantidadDados + (amistad ? 1 : 0), tipoDado, bono, rollData: this.getRollData(),
        mitadPorAgotamiento, parcial: hayPartes,
        speaker: ChatMessage.getSpeaker({ actor: this }), titulo: item.name,
        resultadoFijo: malDeOjo?.resultadoFijo ?? null, motivoFijo: malDeOjo?.motivoFijo ?? ""
      }),
      etiqueta: nombreCarta ? `${nombreCarta} (Misticismo)` : "Misticismo"
    }];
    // (v0.16.0) Descarga elemental: cada carta CONS suma su tirada de Consciencia.
    for (const c of cartasDescarga) {
      partes.push({
        tirada: await tirarDadosSistema({
          cantidadDados: this._dadosDeCaracteristica("consciencia"), tipoDado: c.system.tipoDado ?? "d6",
          bono: Number(c.system.automatizacion?.bonoTirada) || 0, rollData: this.getRollData(),
          mitadPorAgotamiento, parcial: true,
          speaker: ChatMessage.getSpeaker({ actor: this }), titulo: `${item.name} · ${nombreVisibleCarta(c)}`
        }),
        etiqueta: `${nombreVisibleCarta(c)} (Consciencia)`
      });
    }
    const tirada = combinarTiradas(partes);
    // (v0.15.0) `valorX`: el resultado de la tirada fija el valor X del efecto (sin Dificultad ni
    // objetivo); un resultado negativo es fallo automático.
    const usaValorX = Boolean(item.system.valorX) && !esAtaque;
    // (v0.15.0) Efecto automatizado del valor X sobre el Token objetivo (Sanación, Promesa).
    const efectoX = usaValorX ? item.getFlag("cartas-y-dados", "efectoX") ?? null : null;
    const tokenObjetivoX = efectoX ? game.user.targets.first() ?? null : null;
    // (v0.16.0) Manifestar arma: las categorías dependen del dado de la carta (d4 = 1 ... d12 = 5).
    const numeroCarta = numero ?? (Number(Object.entries(SISTEMA_CONFIG.dadoPorNumeroCarta)
      .find(([, dado]) => dado === tipoDado)?.[0]) || null);
    const resolucion = usaValorX
      ? {
        publico: this._htmlValorX(tirada, { efectoX, tokenObjetivo: tokenObjetivoX, numeroCarta }),
        master: this._htmlMasterValorX(tirada, { efectoX, tokenObjetivo: tokenObjetivoX })
      }
      : this._htmlResolucionTirada(tirada, esAtaque || esDescarga, "Dificultad");
    // (v0.16.0) Descarga elemental: elemento y estado alterado (botón del Master).
    if (descarga) {
      const estado = this._htmlEstadoDescarga(tirada, descarga.elemento, descarga.elementoLibre, game.user.targets.first() ?? null);
      resolucion.publico += estado.publico;
      resolucion.master += estado.master;
    }
    // (v0.16.0) Tiempo embotellado: se apuntan los dados para sustituirlos en otras tiradas.
    if (efectoX === "tiempoEmbotellado") await this._guardarTiempoEmbotellado(tirada);
    // (v0.18.0) Custodio · Corazón del dragón: X turnos con daño máximo 1.
    if (efectoX === "corazonDragon" && !tirada.esNegativo && Number(tirada.total) > 0) {
      await this.activarCorazonDragon(Number(tirada.total));
    }
    const bloqueResolucionHtml = resolucion.publico;
    const htmlMaster = resolucion.master;

    // (v0.16.0) Cartas CONS de la Descarga elemental: al Descarte (o Quemadas si se queman).
    const efectosAgotamiento = this.system.agotamiento?.efectos ?? {};
    const lineasDescarga = cartasDescarga.map(c => {
      const quemar = Boolean(c.system.seQuema || efectosAgotamiento.quemarAlUsar);
      return { carta: c, quemar, html: this._lineaCartaUsada(c, "Potencia la descarga", quemar ? "Carta Quemada" : "Descarte") };
    });
    const etiquetasHabilidad = [
      item.system.sinAccion ? '<span class="cyd-tag-accion"><i class="fa-solid fa-plus"></i> No gasta acción</span>' : "",
      amistad ? `<span class="cyd-tag-accion"><i class="fa-solid fa-handshake"></i> Amistad con ${foundry.utils.escapeHTML(amistad.aliado)}: +1 dado</span>` : "",
      cartasDescarga.length ? `<span class="cyd-tag-accion"><i class="fa-solid fa-book"></i> Potenciada con ${cartasDescarga.length} carta(s) CONS</span>` : "",
      descarga && descarga.elemento !== elementoBase ? '<span class="cyd-tag-accion"><i class="fa-solid fa-fire-flame-curved"></i> Elementalismo</span>' : "",
      malDeOjo ? this._etiquetaMalDeOjo(tipoDadoCarta) : "",
      efectoX === "flagelarEsencia" ? '<span class="cyd-tag-accion"><i class="fa-solid fa-crosshairs"></i> Ataque a la esencia</span>' : ""
    ].filter(Boolean);
    const etiquetaSinAccion = etiquetasHabilidad.length
      ? `<p class="cyd-tags-accion-fila">${etiquetasHabilidad.join(" ")}</p>`
      : "";

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.name}</h3>
        ${etiquetaSinAccion}
        ${lineaCartaUsada}
        ${lineasDescarga.map(l => l.html).join("")}
        <p><strong>Tirada:</strong> Misticismo × ${tipoDado}${hayPartes ? " + Consciencia" : ""}</p>
        ${tirada.html}
        ${bloqueResolucionHtml}
        ${item.system.descripcion ? `<div class="cyd-efecto">${item.system.descripcion}</div>` : ""}
        ${lineaQuemada}
        ${this._htmlBotonVisionFuturo(hayPartes ? ["misticismo", "consciencia"] : ["misticismo"])}
      </div>
    `;

    await publicarTirada(tirada, {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: saborChat,
      htmlMaster,
      // «Espera un momento» solo repite tiradas simples (sin cartas CONS de la Descarga).
      repeticion: hayPartes ? null : this._datosRepeticionTirada(tirada, {
        titulo: item.name, esAtaque: esAtaque || esDescarga, etiquetaDificultad: "Dificultad", valorX: usaValorX, efectoX,
        tokenObjetivo: tokenObjetivoX, numeroCarta
      })
    });

    // Quemar la carta usada: mano -> quemadas (motor propio de pilas, sin Cards#pass()).
    if (cartaElegida) await this._moverCartaEntrePilas(mano, quemadas, cartaElegida.id);
    for (const { carta: c, quemar } of lineasDescarga) {
      await this._moverCartaEntrePilas(mano, quemar ? quemadas : pilas.descarte, c.id);
    }

    // Automatización (curación, cambio de cansancio y robo de cartas) si está configurada.
    await this._aplicarAutomatizacionHabilidad(item);

    if (reaccion && this.estaEnCombate()) await this.setFlag("cartas-y-dados", "reaccionUsada", true);
    await this._registrarUltimaCaracteristica("misticismo"); // (v0.15.0) abalorio Amistad
    await this._marcarAccionMiniTurno();
    await this.retirarDestinoSellado(); // (v0.17.0) Sellar destino: la acción ya se ha realizado
    this.prepareData();
    if (this.sheet?.rendered) this.sheet.render();
    return tirada;
  }

  /**
   * Bloque de chat del valor X de una habilidad (v0.15.0): X es el total de la tirada de Misticismo;
   * un total negativo (o 0) no produce efecto.
   * (v0.15.0) Con `efectoX` añade la automatización sobre el Token objetivo, que no puede ser el
   * propio Actor: `curacion` (Sanación) → botón del Master para curar X (`.cyd-btn-aplicar-curacion`);
   * `promesa` (Promesa) → botón para que el dueño del objetivo elija entre sus X primeras cartas
   * (`.cyd-btn-promesa`, ver `sistema.mjs`).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @param {Object} [opciones]
   * @param {string|null} [opciones.efectoX=null] - `curacion`, `promesa` o (v0.16.0) `manifestarArma`
   *   (sin objetivo: categorías del arma según `numeroCarta`) y `tiempoEmbotellado` (sin X: muestra los
   *   dados apuntados, que guarda `_guardarTiempoEmbotellado`).
   * @param {Token|TokenDocument|null} [opciones.tokenObjetivo=null] - Objetivo marcado al usarla.
   * @param {number|null} [opciones.numeroCarta=null] - (v0.16.0) Número (1–5) de la carta MIST usada.
   * @returns {string} HTML público.
   */
  _htmlValorX(tirada, { efectoX = null, tokenObjetivo = null, numeroCarta = null } = {}) {
    const valor = Math.max(0, Number(tirada.total) || 0);
    const exito = !tirada.esNegativo && valor > 0;
    // (v0.16.0) Tiempo embotellado: no hay valor X, se apuntan los dados.
    if (efectoX === "tiempoEmbotellado") {
      return `
        <div class="cyd-resolucion-caja ${tirada.esNegativo ? "cyd-fallo" : "cyd-exito"}">
          <p><i class="fa-solid fa-hourglass-start"></i> ${tirada.esNegativo
            ? '<span class="cyd-resultado-fallo">FALLO AUTOMÁTICO</span>: no se embotella ningún dado.'
            : `<strong>Dados embotellados:</strong> [${tirada.resultadosBase.join(", ")}] (${tirada.tipoDado})`}</p>
          ${tirada.esNegativo ? "" : `<p class="hint">Puedes sustituir hasta ${tirada.resultadosBase.length} dado(s) de cualquier otra tirada tuya por estos valores (se te preguntará al tirar).</p>`}
        </div>`;
    }
    let htmlEfecto = "";
    if (exito && efectoX === "muroVoluntad") {
      // (v0.18.0) Custodio · Muro de voluntad: vida del muro = 3 × X.
      htmlEfecto = `<p><i class="fa-solid fa-dungeon"></i> Muro de voluntad con <strong>${valor * 3} de vida</strong> (3 × X) mientras mantengas la concentración.</p>`;
    } else if (exito && efectoX === "corazonDragon") {
      // (v0.18.0) Custodio · Corazón del dragón: se activa en el propio Actor (`usarHabilidad`).
      htmlEfecto = `<p><i class="fa-solid fa-dragon"></i> Durante <strong>${valor} turno(s)</strong> solo puedes recibir 1 de daño como máximo; cada vez que lo recibas ganas 1 de Agotamiento.</p>`;
    } else if (exito && efectoX === "rencor") {
      // (v0.18.0) Custodio · Rencor: el daño (mitigado + X) lo aplica el Master (`_htmlMasterValorX`).
      htmlEfecto = `<p><i class="fa-solid fa-person-burst"></i> Devuelve al enemigo el daño que acabas de mitigar por completo <strong>+ ${valor}</strong>. <small><i class="fa-solid fa-eye-slash"></i> Lo aplica el Master.</small></p>`;
    } else if (exito && efectoX === "manifestarArma") {
      const categorias = Math.min(5, Math.max(1, Number(numeroCarta) || 1));
      htmlEfecto = `<p><i class="fa-solid fa-khanda"></i> Arma manifestada de <strong>${categorias} categoría(s)</strong> (carta ${SISTEMA_CONFIG.dadoPorNumeroCarta[categorias] ?? ""}) durante <strong>${valor} turno(s)</strong>.</p>`;
    } else if (exito && efectoX) {
      const escapar = foundry.utils.escapeHTML;
      const actorObjetivo = tokenObjetivo?.actor ?? null;
      if (!actorObjetivo || actorObjetivo.id === this.id) {
        htmlEfecto = `<p class="hint"><i class="fa-solid fa-crosshairs"></i> Marca con <strong>T</strong> el Token del objetivo (no puedes ser tú) antes de usar la habilidad para automatizar su efecto.</p>`;
      } else if (efectoX === "curacion") {
        const nombre = escapar(tokenObjetivo.name ?? actorObjetivo.name);
        htmlEfecto = `
          <p><i class="fa-solid fa-heart-pulse"></i> Cura <strong>${valor}</strong> de Salud a <strong>${nombre}</strong> (lo aplica el Master).</p>
          <button type="button" class="cyd-btn-aplicar-curacion" data-actor-uuid="${actorObjetivo.uuid}" data-curacion="${valor}">
            <i class="fa-solid fa-heart-pulse"></i> Aplicar ${valor} de Curación a ${nombre}
          </button>`;
      } else if (efectoX === "promesa") {
        const nombre = escapar(tokenObjetivo.name ?? actorObjetivo.name);
        htmlEfecto = `
          <p><i class="fa-solid fa-hand-holding-hand"></i> <strong>${nombre}</strong> mira las ${valor} primeras cartas de su Mazo y elige una.</p>
          <button type="button" class="cyd-btn-promesa" data-actor-uuid="${actorObjetivo.uuid}" data-x="${valor}" data-origen="${escapar(this.name)}">
            <i class="fa-solid fa-hand-holding-hand"></i> Elegir carta (Promesa)
          </button>`;
      } else if (efectoX === "malDeOjo") {
        // (v0.17.0) Potens Mystica · Mal de ojo: el Master aplica la maldición al objetivo.
        const nombre = escapar(tokenObjetivo.name ?? actorObjetivo.name);
        htmlEfecto = `
          <p><i class="fa-solid fa-eye-slash"></i> <strong>${nombre}</strong> queda maldito <strong>${valor} turno(s)</strong>: sus cartas de Misticismo bajan una categoría de dado (una carta d4 da automáticamente 1).</p>
          <button type="button" class="cyd-btn-mal-de-ojo" data-actor-uuid="${actorObjetivo.uuid}" data-turnos="${valor}" data-origen="${escapar(this.name)}" data-nombre="${nombre}">
            <i class="fa-solid fa-eye-slash"></i> Aplicar Mal de ojo a ${nombre} (${valor} turnos)
          </button>`;
      } else if (efectoX === "flagelarEsencia") {
        // (v0.17.0) Potens Mystica · Flagelar esencia: el daño solo lo ve el Master (`_htmlMasterValorX`).
        const nombre = escapar(tokenObjetivo.name ?? actorObjetivo.name);
        htmlEfecto = `<p><i class="fa-solid fa-crosshairs"></i> Ataque a la esencia de <strong>${nombre}</strong>: X × Agotamiento de ${escapar(this.name)} × nivel de peligro. <small><i class="fa-solid fa-eye-slash"></i> El daño solo lo ve el Master.</small></p>`;
      }
    }
    return `
      <div class="cyd-resolucion-caja ${exito ? "cyd-exito" : "cyd-fallo"}">
        <p><i class="fa-solid fa-moon"></i> <strong>X = ${valor}</strong>${exito ? "" : ` · <span class="cyd-resultado-fallo">${tirada.esNegativo ? "FALLO AUTOMÁTICO" : "SIN EFECTO"}</span>`}</p>
        ${htmlEfecto}
      </div>
    `;
  }

  /**
   * Bloque solo para el Master del valor X de una habilidad (v0.17.0). Hoy solo lo usa «Flagelar
   * esencia» (Potens Mystica): daño = X × Agotamiento del lanzador × nivel de peligro del objetivo
   * (Amenaza si es un PNJ; su nivel si es un PJ), con el botón para aplicarlo (`.cyd-btn-aplicar-dano`,
   * que respeta la Barrera espiritual del objetivo).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @param {Object} [opciones]
   * @param {string|null} [opciones.efectoX=null]
   * @param {Token|TokenDocument|null} [opciones.tokenObjetivo=null]
   * @returns {string} HTML ("" si no aplica).
   */
  _htmlMasterValorX(tirada, { efectoX = null, tokenObjetivo = null } = {}) {
    if (efectoX === "rencor") return this._htmlMasterRencor(tirada, tokenObjetivo);
    if (efectoX !== "flagelarEsencia") return "";
    const valor = Math.max(0, Number(tirada.total) || 0);
    const actorObjetivo = tokenObjetivo?.actor ?? null;
    if (tirada.esNegativo || valor <= 0 || !actorObjetivo || actorObjetivo.id === this.id) return "";
    const escapar = foundry.utils.escapeHTML;
    const nombre = escapar(tokenObjetivo.name ?? actorObjetivo.name);
    const agotamiento = Number(this.system.agotamiento?.nivel ?? this.system.cansancio?.value) || 0;
    const peligro = actorObjetivo.type === "pnj"
      ? Math.max(1, Number(actorObjetivo.system.amenaza) || 1)
      : Math.max(1, Number(actorObjetivo.system.nivelEfectivo) || 1);
    const etiquetaPeligro = actorObjetivo.type === "pnj" ? "Amenaza" : "Nivel";
    const dano = valor * agotamiento * peligro;
    const detalle = dano > 0
      ? `<p><i class="fa-solid fa-burst"></i> <strong>Daño ${dano}</strong> <small>(X ${valor} × Agotamiento ${agotamiento} × ${etiquetaPeligro} ${peligro})</small></p>
         <button type="button" class="cyd-btn-aplicar-dano" data-actor-uuid="${actorObjetivo.uuid}" data-dano="${dano}">
           <i class="fa-solid fa-droplet"></i> Aplicar ${dano} de Daño a ${nombre}
         </button>`
      : `<p><i class="fa-solid fa-shield-halved"></i> <strong>0 Daño:</strong> ${escapar(this.name)} no tiene Agotamiento (X ${valor} × 0 × ${etiquetaPeligro} ${peligro}).</p>`;
    return `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-eye-slash"></i> Flagelar esencia <small>(solo Master)</small></h3>
        <div class="cyd-resolucion-caja ${dano > 0 ? "cyd-exito" : "cyd-fallo"}">
          <p><i class="fa-solid fa-crosshairs"></i> <strong>${escapar(this.name)}</strong> → <strong>${nombre}</strong></p>
          ${detalle}
        </div>
      </div>`;
  }

  /**
   * Bloque solo para el Master de «Rencor» (v0.18.0, Custodio): botón que busca el último ataque
   * BLOQUEADO contra este Actor (`.cyd-registro-bloqueo`) y aplica al atacante (o al Token objetivo)
   * el daño mitigado + X, tras confirmarlo el Master (ver `activarBotonRencor` en `sistema.mjs`).
   * @param {import("../dados.mjs").ResultadoTiradaSistema} tirada
   * @param {Token|TokenDocument|null} tokenObjetivo - Objetivo marcado al usarla (respaldo).
   * @returns {string} HTML ("" si la tirada falla).
   */
  _htmlMasterRencor(tirada, tokenObjetivo) {
    const valor = Math.max(0, Number(tirada.total) || 0);
    if (tirada.esNegativo || valor <= 0) return "";
    const escapar = foundry.utils.escapeHTML;
    const actorObjetivo = tokenObjetivo?.actor && tokenObjetivo.actor.id !== this.id ? tokenObjetivo.actor : null;
    return `
      <div class="cyd-carta-jugada">
        <h3><i class="fa-solid fa-person-burst"></i> Rencor <small>(solo Master)</small></h3>
        <p>Daño = daño mitigado por completo + <strong>${valor}</strong>. Se propone el último ataque bloqueado contra ${escapar(this.name)}.</p>
        <button type="button" class="cyd-btn-rencor" data-actor-uuid="${this.uuid}" data-x="${valor}"
                data-objetivo-uuid="${actorObjetivo?.uuid ?? ""}">
          <i class="fa-solid fa-person-burst"></i> Aplicar Rencor
        </button>
      </div>`;
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

/** Canal de socket del sistema (requiere `"socket": true` en `system.json`). */
const CANAL_SOCKET = "system.cartas-y-dados";

/**
 * Monóculo indiscreto (v0.16.0): consulta la carta superior del Mazo de un Actor y la susurra al
 * usuario que usó el Monóculo y a los Masters, sin revelarla al resto. Debe ejecutarlo un Master
 * (los Mazos son privados): directamente si el Master usa el Monóculo, o vía socket.
 * @param {Object} datos
 * @param {string} datos.objetivoUuid - Actor cuyo Mazo se mira.
 * @param {string} datos.nombreObjetivo - Nombre del Token objetivo.
 * @param {string} datos.observadorUuid - Actor que usa el Monóculo.
 * @param {string} datos.usuarioId - Usuario que recibe el susurro.
 * @returns {Promise<void>}
 */
export async function revelarCartaSuperiorMonoculo({ objetivoUuid, nombreObjetivo, observadorUuid, usuarioId }) {
  const escapar = foundry.utils.escapeHTML;
  const objetivo = await fromUuid(objetivoUuid);
  const observador = await fromUuid(observadorUuid);
  const mazo = objetivo?.system?.pilasDocumentos?.mazo ?? null;
  const carta = mazo && typeof objetivo._cartasDisponiblesEnOrden === "function"
    ? objetivo._cartasDisponiblesEnOrden(mazo)[0] ?? null
    : null;
  const nombre = escapar(nombreObjetivo || objetivo?.name || "el objetivo");
  let detalle;
  if (!mazo) detalle = `<strong>${nombre}</strong> no tiene Mazo de cartas.`;
  else if (!carta) detalle = `El Mazo de <strong>${nombre}</strong> está vacío.`;
  else detalle = `Carta superior del Mazo de <strong>${nombre}</strong>: <strong>${escapar(nombreVisibleCarta(carta))}</strong> (${abreviadoPalo(carta.system.palo)} · ${carta.system.tipoDado ?? ""}).`;
  await ChatMessage.create({
    speaker: observador ? ChatMessage.getSpeaker({ actor: observador }) : ChatMessage.getSpeaker(),
    whisper: [...new Set([usuarioId, ...game.users.filter(u => u.isGM).map(u => u.id)])].filter(Boolean),
    content: `<div class="cyd-chat-aviso"><i class="fa-solid fa-magnifying-glass"></i><p>Monóculo indiscreto · ${detalle} <small>(sin revelarla)</small></p></div>`
  });
}

/**
 * Escucha en el socket del sistema las peticiones del Monóculo indiscreto (v0.16.0). Solo el Master
 * activo las atiende. Llamar en `ready`.
 */
export function registrarSocketAltaScentia() {
  game.socket.on(CANAL_SOCKET, async mensaje => {
    if (mensaje?.tipo !== "monoculo") return;
    if (game.user !== game.users.activeGM) return;
    await revelarCartaSuperiorMonoculo(mensaje.datos ?? {});
  });
}
