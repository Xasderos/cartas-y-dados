/**
 * @file actor.mjs
 * @description Clase extendida de Actor para Foundry VTT v14.
 * Implementa trazabilidad única por carta mediante `flags.cartas-y-dados.sourceCardId`
 * para garantizar que cada Carta de Acción y cada Trinket se mueva de forma independiente
 * entre Mazo, Mano, En Juego, Descarte y Quemadas, recalculando la Defensa en tiempo real.
 */

import { abreviadoPalo, nombreVisibleCarta } from "../config.mjs";

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
   * Genera un mazo inicial de prueba con 6 Cartas de Acción y 2 Trinkets.
   */
  async generarMazoInicialDePrueba() {
    const { mazo, trinkets } = this.system.pilasDocumentos;
    if (!mazo || !trinkets) return;

    const cartasAccionBase = [
      {
        name: "Estocada Directa",
        type: "accion",
        system: { palo: "espadas", numero: 2, esAtaque: true, seQuema: false, efecto: "<p>Ataque cuerpo a cuerpo estándar.</p>" }
      },
      {
        name: "Tajo Pesado",
        type: "accion",
        system: { palo: "espadas", numero: 3, esAtaque: true, seQuema: false, automatizacion: { bonoTirada: 1 }, efecto: "<p>Suma +1 al resultado del ataque.</p>" }
      },
      {
        name: "Disparo Rápido",
        type: "accion",
        system: { palo: "bastos", numero: 2, esAtaque: true, seQuema: false, efecto: "<p>Ataque ágil a distancia.</p>" }
      },
      {
        name: "Maniobra Táctica",
        type: "accion",
        system: { palo: "oros", numero: 2, esAtaque: false, seQuema: false, automatizacion: { robarCartas: 1 }, efecto: "<p>Analizas el terreno y <strong>robas +1 carta extra</strong>.</p>" }
      },
      {
        name: "Aliento Recuperador",
        type: "accion",
        system: { palo: "copas", numero: 2, esAtaque: false, seQuema: false, automatizacion: { curacion: 3, cambioCansancio: -1 }, efecto: "<p>Recuperas <strong>3 de Salud</strong> y alivias <strong>1 de Cansancio</strong>.</p>" }
      },
      {
        name: "Ejecución Fulminante",
        type: "accion",
        system: { palo: "espadas", numero: 5, esAtaque: true, seQuema: true, automatizacion: { bonoTirada: 2 }, efecto: "<p>Golpe devastador (+2 al ataque). <strong>Se quema tras usarse.</strong></p>" }
      }
    ];

    const trinketsBase = [
      {
        name: "Égida de Hierro",
        type: "trinket",
        system: {
          palo: "espadas",
          numero: 2,
          realizaTirada: false,
          esAtaque: false,
          bonoDefensaEnJuego: 2,
          efectoPermanente: "<p>Portarlo infunde aplomo.</p>",
          efectoAlJugar: "<p>Mientras esté <strong>En Juego</strong>, otorga <strong>+2 a tu Defensa</strong>.</p>"
        }
      },
      {
        name: "Cáliz de Brasas",
        type: "trinket",
        system: {
          palo: "copas",
          numero: 3,
          realizaTirada: true,
          esAtaque: true,
          bonoDefensaEnJuego: 0,
          automatizacion: { curacion: 2 },
          efectoPermanente: "<p>Tibio al tacto.</p>",
          efectoAlJugar: "<p>Realiza un ataque espiritual y te <strong>cura 2 de Salud</strong> al entrar en juego.</p>"
        }
      }
    ];

    await mazo.createEmbeddedDocuments("Card", cartasAccionBase);
    await trinkets.createEmbeddedDocuments("Card", trinketsBase);
    await mazo.shuffle({ chatNotification: false });
    await trinkets.shuffle({ chatNotification: false });

    this.prepareData();
    ui.notifications.info(`Se han añadido 6 Cartas de Acción y 2 Trinkets iniciales a ${this.name}.`);
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
      creadas = await pilaDestino.createEmbeddedDocuments("Card", datosNuevasCartas);
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

    const [cartaCreada] = await pilaDestino.createEmbeddedDocuments("Card", [datosCopia]);
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
      await mazo.createEmbeddedDocuments("Card", nuevasParaMazo);
    }
    if (updatesTrinkets.length > 0 && trinkets) {
      await trinkets.updateEmbeddedDocuments("Card", updatesTrinkets);
    }
    if (nuevasParaTrinkets.length > 0 && trinkets) {
      await trinkets.createEmbeddedDocuments("Card", nuevasParaTrinkets);
    }
    if (idsABorrarDePila.length > 0) {
      await pilaOrigen.deleteEmbeddedDocuments("Card", idsABorrarDePila);
    }

    this.prepareData();
  }

  /* ======================================================================== */
  /*  3. ROBO DE TURNO Y BARAJADO CON CANSANCIO                               */
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
      content: `<p>🎴 <strong>${this.name}</strong> roba cartas hasta completar su mano (${mano.cards.size}/${limite}).</p>`
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

    const nuevoCansancio = this.system.cansancio.value + 1;
    await this.update({ "system.cansancio.value": nuevoCansancio });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `
        <div class="cyd-alerta-cansancio">
          <h4>⚠️ ¡Mazo Agotado!</h4>
          <p><strong>${this.name}</strong> baraja su Descarte para formar un nuevo Mazo y recibe <strong>+1 de Cansancio</strong> (Total: ${nuevoCansancio}/${this.system.cansancio.maxTotal}).</p>
        </div>
      `
    });
  }

  /* ======================================================================== */
  /*  4. JUGAR CARTA, ATAQUE VS DEFENSA Y EFECTOS AUTOMATIZADOS               */
  /* ======================================================================== */

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

    const auto = carta.system.automatizacion ?? {};
    const bonoTirada = Number(auto.bonoTirada) || 0;

    let roll = null;
    let bloqueResolucionHtml = "";
    const debeTirar = carta.type === "accion" || (carta.type === "trinket" && carta.system.realizaTirada);

    if (debeTirar) {
      const claveCaract = carta.system.caracteristicaAsociada;
      const cantidadDados = this.system.caracteristicasTotales?.[claveCaract]
        ?? this.system.caracteristicas[claveCaract]
        ?? 1;
      const tipoDado = carta.system.tipoDado ?? "d6";
      const formula = bonoTirada !== 0
        ? `${cantidadDados}${tipoDado} + ${bonoTirada}`
        : `${cantidadDados}${tipoDado}`;

      roll = new Roll(formula, this.getRollData());
      await roll.evaluate();

      const tokenObjetivo = game.user.targets.first() ?? null;
      const actorObjetivo = tokenObjetivo?.actor ?? null;

      if (carta.system.esAtaque && actorObjetivo) {
        // Asegurar que la Defensa del objetivo tenga calculados sus propios Trinkets en juego
        actorObjetivo.prepareData();
        const defensaObjetivo = actorObjetivo.system.defensaTotal ?? actorObjetivo.system.defensa ?? 0;
        const danoCalculado = Math.max(0, roll.total - defensaObjetivo);

        if (danoCalculado > 0) {
          bloqueResolucionHtml = `
            <div class="cyd-resolucion-caja cyd-exito">
              <p>🎯 <strong>Objetivo:</strong> ${tokenObjetivo.name} (🛡️ Defensa: ${defensaObjetivo})</p>
              <p>💥 <strong>¡IMPACTO! Daño: ${danoCalculado}</strong> <small>(${roll.total} Ataque - ${defensaObjetivo} Defensa)</small></p>
              <button type="button" class="cyd-btn-aplicar-dano"
                      data-actor-uuid="${actorObjetivo.uuid}"
                      data-dano="${danoCalculado}">
                🩸 Aplicar ${danoCalculado} de Daño a ${tokenObjetivo.name}
              </button>
            </div>
          `;
        } else {
          bloqueResolucionHtml = `
            <div class="cyd-resolucion-caja cyd-fallo">
              <p>🎯 <strong>Objetivo:</strong> ${tokenObjetivo.name} (🛡️ Defensa: ${defensaObjetivo})</p>
              <p>🛡️ <strong>Ataque Bloqueado (0 Daño):</strong> La tirada (${roll.total}) no superó la Defensa (${defensaObjetivo}).</p>
            </div>
          `;
        }
      } else if (carta.system.esAtaque && !actorObjetivo) {
        bloqueResolucionHtml = `
          <div class="cyd-resolucion-caja">
            <p>⚔️ <strong>Resultado de Ataque: ${roll.total}</strong></p>
            <p><small>💡 Pulsa <strong>T</strong> sobre un enemigo antes de jugar la carta para restar su Defensa.</small></p>
          </div>
        `;
      } else {
        const dificultadMaster = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;
        if (dificultadMaster > 0) {
          const exito = roll.total >= dificultadMaster;
          const textoExito = exito ? "✅ ¡ÉXITO!" : "❌ FALLO";
          bloqueResolucionHtml = `
            <div class="cyd-resolucion-caja">
              <p>🎲 <strong>Dificultad del Master (${dificultadMaster}):</strong> ${textoExito} (Total: ${roll.total})</p>
            </div>
          `;
        }
      }
    }

    // Determinar pila destino: Quemadas, En Juego (si es Trinket) o Descarte
    const seQuema = quemar || Boolean(carta.system.seQuema);
    let pilaDestino = descarte;
    let etiquetaDestino = "📥 Descarte";

    if (seQuema) {
      pilaDestino = quemadas;
      etiquetaDestino = "🔥 Carta Quemada";
    } else if (carta.type === "trinket") {
      pilaDestino = enJuego;
      etiquetaDestino = "🟢 Trinket En Juego";
    }

    // Mover carta preservando flags y recalcular datos derivados del Actor (incluyendo Defensa)
    await this._moverCartaEntrePilas(mano, pilaDestino, carta.id);

    const resumenEfectosAuto = [];
    const updatesActor = {};

    if (auto.curacion > 0) {
      const nuevaSalud = Math.min(this.system.salud.maxTotal, this.system.salud.value + auto.curacion);
      updatesActor["system.salud.value"] = nuevaSalud;
      resumenEfectosAuto.push(`❤️ +${auto.curacion} Salud`);
    }

    if (auto.cambioCansancio !== 0) {
      const nuevoCansancio = Math.max(0, this.system.cansancio.value + auto.cambioCansancio);
      updatesActor["system.cansancio.value"] = nuevoCansancio;
      const signo = auto.cambioCansancio > 0 ? `+${auto.cambioCansancio}` : auto.cambioCansancio;
      resumenEfectosAuto.push(`⚡ ${signo} Cansancio`);
    }

    if (Object.keys(updatesActor).length > 0) {
      await this.update(updatesActor);
    }

    if (auto.robarCartas > 0) {
      await this.robarCantidadCartas(auto.robarCartas);
      resumenEfectosAuto.push(`✋ Roba +${auto.robarCartas} carta(s)`);
    }

    const bonoDefTrinket = Number(carta.system.bonoDefensaEnJuego) || 0;
    if (carta.type === "trinket" && bonoDefTrinket !== 0 && !seQuema) {
      const signoDef = bonoDefTrinket > 0 ? `+${bonoDefTrinket}` : bonoDefTrinket;
      resumenEfectosAuto.push(`🛡️ ${signoDef} Defensa (Activo en Juego)`);
    }

    // Garantizar que `defensaTotal` quede recalculada en el Actor
    this.prepareData();

    const htmlEfectosAuto = resumenEfectosAuto.length > 0
      ? `<p class="cyd-tags-auto"><strong>Efectos aplicados:</strong> ${resumenEfectosAuto.join(" | ")}</p>`
      : "";

    const efectoHtml = carta.type === "trinket"
      ? carta.system.efectoAlJugar
      : carta.system.efecto;

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3>${carta.system.esAtaque ? "⚔️" : "🃏"} ${nombreVisibleCarta(carta)} <small>(${etiquetaDestino})</small></h3>
        <p><strong>Palo:</strong> ${abreviadoPalo(carta.system.palo)} | <strong>Dado:</strong> ${carta.system.tipoDado}</p>
        ${bloqueResolucionHtml}
        ${htmlEfectosAuto}
        ${efectoHtml ? `<div class="cyd-efecto">${efectoHtml}</div>` : ""}
      </div>
    `;

    if (roll) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: saborChat
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: saborChat
      });
    }

    return roll;
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
          <h3>📥 ${nombreVisibleCarta(carta)}</h3>
          <p><strong>Acción:</strong> Descartada sin tirar</p>
          <p><strong>Palo:</strong> ${abreviadoPalo(carta.system.palo)} | <strong>Dado:</strong> ${carta.system.tipoDado}</p>
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
          <h3>🔥 ${nombreVisibleCarta(carta)}</h3>
          <p><strong>Acción:</strong> Quemada sin tirar</p>
          <p><strong>Palo:</strong> ${abreviadoPalo(carta.system.palo)} | <strong>Dado:</strong> ${carta.system.tipoDado}</p>
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
      content: `<p>✨ <strong>${this.name}</strong> descarta <em>${nombreVisibleCarta(cartaCoste)}</em> y añade el Trinket <strong>${nombreVisibleCarta(cartaTrinket)}</strong> a su mano.</p>`
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
    const textoAccion = quemar ? "quema 🔥" : "descarta 📥";

    await this._moverCartaEntrePilas(enJuego, destino, trinket.id);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p><strong>${this.name}</strong> ${textoAccion} su Trinket activo <strong>${nombreVisibleCarta(trinket)}</strong>.</p>`
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
      content: `<p>🔄 <strong>Fin de Escena / Combate (${this.name}):</strong> Su Mano, su Descarte y sus Trinkets en juego regresan a sus respectivos mazos y se barajan.</p>`
    });
  }

  /**
   * Descanso completo:
   * Devuelve Mano, En Juego, Descarte y Cartas Quemadas a sus mazos originales,
   * los baraja y restablece el Cansancio a 0.
   */
  async realizarDescanso() {
    const { mazo, trinkets, mano, enJuego, descarte, quemadas } = this.system.pilasDocumentos;
    if (!mazo) return;

    for (const pila of [mano, enJuego, descarte, quemadas]) {
      if (pila && pila.cards.size > 0) {
        await this._devolverCartasASuMazoOriginal(pila);
      }
    }

    await mazo.shuffle({ chatNotification: false });
    if (trinkets) await trinkets.shuffle({ chatNotification: false });

    await this.update({ "system.cansancio.value": 0 });
    this.prepareData();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p>🏕️ <strong>${this.name}</strong> descansa: recupera su Mano, su Descarte y sus <strong>Cartas Quemadas</strong>, baraja sus mazos y elimina su Cansancio.</p>`
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
      let etiquetaEstado = "⚪ En Reserva";
      let idEnPilaActual = trinketOriginal.id;

      if (trinketOriginal.drawn) {
        const enMesa = buscarCopiaEnPila(enJuego, trinketOriginal);
        const enLaMano = !enMesa ? buscarCopiaEnPila(mano, trinketOriginal) : null;
        const enElDescarte = !enMesa && !enLaMano ? buscarCopiaEnPila(descarte, trinketOriginal) : null;
        const enQuemadas = !enMesa && !enLaMano && !enElDescarte ? buscarCopiaEnPila(quemadas, trinketOriginal) : null;

        if (enMesa) {
          estado = "enJuego";
          etiquetaEstado = "🟢 Activo en Juego";
          idEnPilaActual = enMesa.id;
        } else if (enLaMano) {
          estado = "enMano";
          etiquetaEstado = "✋ En Mano";
          idEnPilaActual = enLaMano.id;
        } else if (enElDescarte) {
          estado = "descartado";
          etiquetaEstado = "📥 Descartado";
          idEnPilaActual = enElDescarte.id;
        } else if (enQuemadas) {
          estado = "quemado";
          etiquetaEstado = "🔥 Quemado";
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
        palo: trinketOriginal.system.palo,
        numero: trinketOriginal.system.numero,
        tipoDado: trinketOriginal.system.tipoDado,
        bonoDefensaEnJuego: Number(trinketOriginal.system.bonoDefensaEnJuego) || 0,
        efectoPermanente: trinketOriginal.system.efectoPermanente,
        efectoAlJugar: trinketOriginal.system.efectoAlJugar
      };
    });
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
    const formula = bono !== 0
      ? `${cantidadDados}${tipoDado} + ${bono}`
      : `${cantidadDados}${tipoDado}`;

    const roll = new Roll(formula, this.getRollData());
    await roll.evaluate();

    let bloqueResolucionHtml = "";
    const tokenObjetivo = game.user.targets.first() ?? null;
    const actorObjetivo = tokenObjetivo?.actor ?? null;

    if (esAtaque && actorObjetivo) {
      actorObjetivo.prepareData();
      const defensaObjetivo = actorObjetivo.system.defensaTotal ?? actorObjetivo.system.defensa ?? 0;
      const danoCalculado = Math.max(0, roll.total - defensaObjetivo);

      if (danoCalculado > 0) {
        bloqueResolucionHtml = `
          <div class="cyd-resolucion-caja cyd-exito">
            <p>🎯 <strong>Objetivo:</strong> ${tokenObjetivo.name} (🛡️ Defensa: ${defensaObjetivo})</p>
            <p>💥 <strong>¡IMPACTO! Daño: ${danoCalculado}</strong> <small>(${roll.total} Ataque - ${defensaObjetivo} Defensa)</small></p>
            <button type="button" class="cyd-btn-aplicar-dano"
                    data-actor-uuid="${actorObjetivo.uuid}"
                    data-dano="${danoCalculado}">
              🩸 Aplicar ${danoCalculado} de Daño a ${tokenObjetivo.name}
            </button>
          </div>
        `;
      } else {
        bloqueResolucionHtml = `
          <div class="cyd-resolucion-caja cyd-fallo">
            <p>🎯 <strong>Objetivo:</strong> ${tokenObjetivo.name} (🛡️ Defensa: ${defensaObjetivo})</p>
            <p>🛡️ <strong>Ataque Bloqueado (0 Daño):</strong> La tirada (${roll.total}) no superó la Defensa (${defensaObjetivo}).</p>
          </div>
        `;
      }
    } else if (!esAtaque) {
      const dificultadMaster = game.settings.get("cartas-y-dados", "dificultadMaster") || 0;
      if (dificultadMaster > 0) {
        const exito = roll.total >= dificultadMaster;
        bloqueResolucionHtml = `
          <div class="cyd-resolucion-caja">
            <p>🎲 <strong>Dificultad (${dificultadMaster}):</strong> ${exito ? "✅ ¡ÉXITO!" : "❌ FALLO"} (Total: ${roll.total})</p>
          </div>
        `;
      }
    }

    const saborChat = `
      <div class="cyd-carta-jugada">
        <h3>${esAtaque ? "🐾" : "⚡"} ${titulo}</h3>
        <p><strong>Atributo:</strong> ${caracteristica.toUpperCase()} (${cantidadDados}${tipoDado})</p>
        ${bloqueResolucionHtml}
        ${descripcion ? `<div class="cyd-efecto">${descripcion}</div>` : ""}
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: saborChat
    });

    return roll;
  }

  /**
   * Ejecuta un Item de tipo 'habilidad' poseído por el Actor.
   * @param {string} itemId - ID del Item dentro de `this.items`.
   */
  async usarHabilidadItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;

    if (!item.system.esActivable) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="cyd-carta-jugada"><h3>⚡ ${item.name}</h3><div>${item.system.descripcion || ""}</div></div>`
      });
      return;
    }

    return this.realizarAccionRapida({
      titulo: item.name,
      caracteristica: item.system.caracteristica,
      tipoDado: item.system.tipoDado,
      bonoTirada: item.system.bonoTirada,
      esAtaque: item.system.esAtaque,
      descripcion: item.system.descripcion
    });
  }
}