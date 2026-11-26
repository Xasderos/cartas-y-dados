/**
 * @file actor-sheet.mjs
 * @description Hoja de Personaje ApplicationV2 con soporte integrado para Raza, Origen,
 * Clase, Objetos equipables y creador visual de Cartas/Trinkets.
 */

import { VentanaDinamicaMixin, opcionesDialogoSistema } from "./ventana-dinamica.mjs";
import { RetratoFichaMixin } from "./retrato-ficha.mjs";
import { abrirDialogoAccion } from "./dialogo-accion.mjs";

import { SISTEMA_CONFIG, abreviadoPalo, describirPackCartas, generarNombreUnico, nombreVisibleCarta, contextoAgotamiento, contextoBarraSalud, contextoRasgosRaza, opcionesTrinketsClase } from "../config.mjs";
import { preguntarTipoDescanso } from "../documents/actor.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class HojaPersonajeActor extends VentanaDinamicaMixin(RetratoFichaMixin(HandlebarsApplicationMixin(ActorSheetV2))) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cartas-y-dados", "sheet", "actor"],
    position: {
      width: 860,
      height: 1000
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true,
      title: "Hoja de Personaje"
    },
    actions: {
      fijarAgotamiento: HojaPersonajeActor.#onFijarAgotamiento,
      inicializarPilas: HojaPersonajeActor.#onInicializarPilas,
      robarTurno: HojaPersonajeActor.#onRobarTurno,
      jugarCarta: HojaPersonajeActor.#onJugarCarta,
      accionFueraCombate: HojaPersonajeActor.#onAccionFueraCombate,
      otraManoMiniTurno: HojaPersonajeActor.#onOtraManoMiniTurno,
      terminarMiniTurno: HojaPersonajeActor.#onTerminarMiniTurno,
      restablecerReaccion: HojaPersonajeActor.#onRestablecerReaccion,
      descartarCarta: HojaPersonajeActor.#onDescartarCarta,
      quemarCarta: HojaPersonajeActor.#onQuemarCarta,
      robarTrinket: HojaPersonajeActor.#onRobarTrinket,
      retirarTrinket: HojaPersonajeActor.#onRetirarTrinket,
      finCombate: HojaPersonajeActor.#onFinCombate,
      descansar: HojaPersonajeActor.#onDescansar,
      abrirPila: HojaPersonajeActor.#onAbrirPila,
      crearCartaEnMazo: HojaPersonajeActor.#onCrearCartaEnMazo,
      crearItem: HojaPersonajeActor.#onCrearItem,
      editarItem: HojaPersonajeActor.#onEditarItem,
      eliminarItem: HojaPersonajeActor.#onEliminarItem,
      alternarEquipado: HojaPersonajeActor.#onAlternarEquipado,
      usarHabilidad: HojaPersonajeActor.#onUsarHabilidad,
      subirNivel: HojaPersonajeActor.#onSubirNivel,
      usarAlquimia: HojaPersonajeActor.#onUsarAlquimia
    }
  };

  /**
   * Pestañas de la ficha (v0.13.1). Navegación nativa de ApplicationV2: la plantilla
   * usa `data-action="tab"` y `.tab[data-group="primary"]`; `context.tabs` lo prepara
   * `ApplicationV2#_prepareContext` (una sola agrupación de pestañas).
   * - `principal`: recursos, características, agotamiento, rasgos a mano, cartas y equipo.
   * - `raza`: descripción completa de los rasgos raciales.
   * @override
   */
  static TABS = {
    primary: {
      tabs: [
        { id: "principal", icon: "fa-solid fa-id-card", label: "Principal" },
        { id: "raza", icon: "fa-solid fa-dna", label: "Raza" }
      ],
      initial: "principal"
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: "systems/cartas-y-dados/templates/actor/hoja-personaje.hbs",
      scrollable: [".cyd-cuerpo-hoja"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const pilas = system.pilasDocumentos ?? {};

    const pilasInicializadas = Boolean(
      pilas.mazo && pilas.mano && pilas.enJuego && pilas.descarte && pilas.quemadas && pilas.trinkets
    );

    // Cartas en la mano usando caracteristicasTotales (Base + Raza + Origen + Clase + Equipo).
    // El nombre visible nunca muestra vacíos ni genéricos tipo "Unknown": usa un
    // identificador descriptivo (tipo + palo + dado) como respaldo (v0.8.2).
    const cartasEnMano = pilas.mano
      ? (pilas.mano.cards?.contents ?? []).map(c => {
          const esTrinket = c.type === "trinket";
          // Los Trinkets (v0.8.4+) NO tienen palo, número ni tipoDado: solo Nivel.
          // Nunca se accede a sistema.palo / sistema.tipoDado de un Trinket (protección de datos).
          return {
            id: c.id,
            nombre: nombreVisibleCarta(c),
            tipo: c.type,
            esTrinket,
            nivel: esTrinket ? Number(c.system?.nivel) || 1 : null,
            palo: esTrinket ? null : c.system?.palo,
            paloAbrev: esTrinket ? null : abreviadoPalo(c.system?.palo),
            numero: esTrinket ? null : c.system?.numero,
            tipoDado: esTrinket ? null : c.system?.tipoDado,
            caracteristica: esTrinket ? null : c.system?.caracteristicaAsociada,
            cantidadDados: esTrinket
              ? null
              : system.caracteristicasTotales?.[c.system?.caracteristicaAsociada] ?? 1,
            // (v0.14.0) Las cartas MIST siempre se queman al usarse.
            seQuema: Boolean(c.system?.seQuema) || c.system?.palo === "copas",
            efecto: esTrinket ? c.system?.efectoAlJugar : c.system?.efecto
          };
        })
      : [];

    const todosLosTrinkets = actor.obtenerResumenTrinkets().map(t => {
      const tooltipHtml = `
        <div class='cyd-tooltip-contenido'>
          <strong>${t.nombre}</strong> <em>(${t.etiquetaEstado})</em><hr/>
          <p><strong>Nivel:</strong> ${t.nivel}</p>
          ${t.efectoPermanente ? `<p><strong>Pasivo:</strong> ${t.efectoPermanente}</p>` : ""}
          ${t.efectoAlJugar ? `<p><strong>Al Jugar:</strong> ${t.efectoAlJugar}</p>` : ""}
        </div>
      `;
      return {
        ...t,
        estaEnJuego: t.estado === "enJuego",
        estaDisponible: t.estado === "disponible",
        tooltipHtml
      };
    });

    const contadoresPilas = pilasInicializadas
      ? {
          mazoDisponibles: pilas.mazo.availableCards.length,
          mazoTotal: pilas.mazo.cards.size,
          manoActual: pilas.mano.cards.size,
          enJuegoActual: pilas.enJuego.cards.size,
          descarteActual: pilas.descarte.cards.size,
          quemadasActual: pilas.quemadas.cards.size,
          trinketsDisponibles: pilas.trinkets.availableCards.length,
          trinketsTotal: pilas.trinkets.cards.size
        }
      : null;

    // Clasificar los Items del Actor (Raza, Origen, Clase, Objetos y Habilidades)
    const objetos = actor.items.filter(i => i.type === "objeto");
    const habilidades = actor.items.filter(i => i.type === "habilidad");

    // Subida de nivel disponible (v0.10.0): solo si la clase base tiene progresión para el siguiente nivel
    const opcionesNivel = actor.isOwner ? actor.obtenerOpcionesSubidaNivel() : null;
    const subidaNivel = opcionesNivel ? { nivelDestino: opcionesNivel.nivelDestino } : null;

    return {
      ...context,
      tabs: context.tabs ?? this._prepareTabs("primary"),
      actor,
      system,
      esPropietario: actor.isOwner,
      agotamiento: contextoAgotamiento(system.cansancio?.value),
      barraSalud: contextoBarraSalud(system.salud?.value, system.salud?.maxTotal),
      rasgosRaza: contextoRasgosRaza(system.razaBase),
      pilasInicializadas,
      contadoresPilas,
      cartasEnMano,
      todosLosTrinkets,
      trinketsEnJuego: todosLosTrinkets.filter(t => t.estaEnJuego),
      itemRaza: system.itemRaza,
      itemOrigen: system.itemOrigen,
      itemClase: system.itemClase,
      objetos,
      habilidades,
      subidaNivel,
      estadoAcciones: actor.contextoAcciones()
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const actor = this.document;
    // Auto-asistente (v0.8.4): al abrir la ficha de un Personaje sin Clase, lanzar
    // el Asistente de Creación de Personaje (Paso 1: Clase, Paso 2: Trinket).
    if (actor.type === "personaje" && actor.isOwner && !actor.items.some(i => i.type === "clase")) {
      this.abrirAsistenteClase().catch(err =>
        console.error("Cartas y Dados | Error en el Asistente de Clase:", err)
      );
    }
  }

  /**
   * Asistente de Creación de Personaje (v0.8.4) construido con `foundry.applications.api.DialogV2`:
   * - Paso de Raza (v0.10.1): elección entre las razas de `SISTEMA_CONFIG.RAZAS_BASE`
   *   (se omite si el Actor ya tiene un Item `raza`).
   * - Paso de Clase: elección entre las 5 Clases de `SISTEMA_CONFIG.CLASES_BASE`.
   * - Validación `tabulaRasa`: `DialogV2.confirm` con la advertencia exacta
   *   "Clase avanzada, no es recomendable para jugadores nuevos"; si se cancela,
   *   regresa a la selección de Clase.
   * - Paso 2: elección del Trinket inicial entre los `trinkets` de la clase elegida
   *   (en Tabula Rasa se ofrece "Vasija vacía").
   * Al confirmar, llama a `SistemaActor#inicializarPersonajeConClase` para inicializar
   * las 6 pilas y poblar `mazo` (12 cartas místicas) y `trinkets` (1 Trinket Nv. 1).
   */
  async abrirAsistenteClase() {
    const actor = this.document;
    const clases = SISTEMA_CONFIG.CLASES_BASE;
    if (!clases) return;

    // Numeración de pasos: con paso de Raza son 3 (Raza → Clase → Trinket), sin él 2.
    const razas = SISTEMA_CONFIG.RAZAS_BASE ?? {};
    const pedirRaza = !actor.items.some(i => i.type === "raza") && Object.keys(razas).length > 0;
    const offsetPaso = pedirRaza ? 1 : 0;

    /* ---------------- PASO 1: SELECCIÓN DE RAZA (v0.10.1) ---------------- */
    let claveRaza = null;
    if (pedirRaza) {
      const botonesRazas = Object.entries(razas).map(([clave, cfg]) => ({
        action: clave,
        label: cfg.nombre, // Texto plano (DialogV2 escapa el label)
        icon: "fa-solid fa-dna",
        callback: () => clave
      }));

      claveRaza = await DialogV2.wait({
        ...opcionesDialogoSistema({ width: 460, lista: true }),
        window: { title: `${actor.name} — Paso 1: Elige tu Raza` },
        // (v0.13.0) Resumen de rasgos de cada raza (el detalle está en la ficha del Item de Raza).
        content: "<p>Elige una de las siguientes razas:</p>" + `<ul class="cyd-lista-rasgos">${
          Object.values(razas).map(cfg => {
            const nombres = lista => (lista ?? []).map(r => r.nombre).join(", ");
            const desventajas = nombres(cfg.desventajas) || "ninguna";
            return `<li class="cyd-rasgo"><strong>${cfg.nombre}</strong><p class="cyd-rasgo-texto"><i class="fa-solid fa-circle-plus"></i> ${nombres(cfg.beneficios)} · <i class="fa-solid fa-circle-minus"></i> ${desventajas}</p></li>`;
          }).join("")
        }</ul>`,
        buttons: botonesRazas,
        rejectClose: false
      });

      if (!claveRaza) return; // El jugador canceló el asistente
    }

    /* ---------------- PASO DE CLASE ---------------- */
    let claveClase = null;
    while (!claveClase) {
      const botonesClases = Object.entries(clases).map(([clave, cfg]) => {
        const etiquetaAtributo = cfg.atributo ? cfg.atributo.toUpperCase() : "AVANZADA";
        const etiquetaPalo = cfg.paloPrincipal ? ` · ${abreviadoPalo(cfg.paloPrincipal)}` : "";
        return {
          action: clave,
          // Texto plano sin etiquetas HTML: evita que se vean marcas crudas al elegir la clase en el diálogo.
          label: `${cfg.nombre} (${etiquetaAtributo}${etiquetaPalo})`,
          icon: cfg.paloPrincipal ? "fa-solid fa-scroll" : "fa-solid fa-circle-half-stroke",
          callback: () => clave
        };
      });

      const contenidoPaso1 = `
        <p>Elige una de las siguientes clases iniciales:</p>

      `;

      const seleccion = await DialogV2.wait({
        ...opcionesDialogoSistema({ width: 460, lista: true }),
        window: { title: `${actor.name} — Paso ${1 + offsetPaso}: Elige tu Clase` },
        content: contenidoPaso1,
        buttons: botonesClases,
        rejectClose: false
      });

      if (!seleccion) return; // El jugador canceló el asistente

      // Validación especial para la clase avanzada Tabula Rasa
      if (seleccion === "tabulaRasa") {
        const confirmarAvanzada = await DialogV2.confirm({
          ...opcionesDialogoSistema(),
          window: { title: "Advertencia de Clase Avanzada" },
          content: "<p>Clase avanzada, no es recomendable para jugadores nuevos</p>",
          yes: { label: "Continuar con Tabula Rasa" },
          no: { label: "Volver a elegir Clase" },
          defaultYes: false,
          rejectClose: false
        });
        if (!confirmarAvanzada) continue; // Regresa a la selección de Clase
      }

      claveClase = seleccion;
    }

    const configClase = clases[claveClase];

    /* ---------------- PASO 2: SELECCIÓN DE TRINKET ---------------- */
    // (v0.15.0) Los abalorios de clase muestran su efecto bajo el nombre.
    const escapar = foundry.utils.escapeHTML;
    const opcionesTrinket = opcionesTrinketsClase(configClase).map((opcion, indice) => `
      <label class="cyd-opcion-radio">
        <input type="radio" name="cydTrinketElegido" value="${escapar(opcion.nombre)}" ${indice === 0 ? "checked" : ""} />
        <span>${opcion.icono ? `<i class="fa-solid ${opcion.icono}"></i> ` : ""}<strong>${escapar(opcion.nombre)}</strong>${opcion.texto ? `<br><small>${escapar(opcion.texto)}</small>` : ""}</span>
      </label>`).join("");

    const trinketElegido = await DialogV2.prompt({
      ...opcionesDialogoSistema(),
      window: { title: `${actor.name} — Paso ${2 + offsetPaso}: Elige tu Trinket Inicial` },
      content: `
        <p><strong>${configClase.nombre}</strong> — Trinkets iniciales disponibles (Nivel 1):</p>
        ${opcionesTrinket}
        ${opcionesTrinketsClase(configClase).some(o => o.clave) ? '<p class="hint">El efecto del abalorio se aplica mientras su Trinket está En Juego.</p>' : ""}
      `,
      ok: {
        label: "Confirmar y Generar Mazo",
        icon: "fa-solid fa-wand-sparkles",
        callback: (event, button) => button.form.elements.cydTrinketElegido.value
      },
      rejectClose: false
    });

    if (!trinketElegido) return; // El jugador canceló el Paso 2

    await actor.inicializarPersonajeConClase(claveClase, trinketElegido, claveRaza);
    this.render();
  }

  /**
   * Diálogo de Subida de Nivel (v0.10.0), solo `DialogV2`:
   * - Paso 1 (`DialogV2.prompt`): radios `cydHabilidadNivel` (una habilidad) y `cydPackNivel`
   *   (un pack de cartas) y, desde v0.15.0, `cydEspecializacionNivel`, solo para las listas que
   *   ofrezca `progresion[nivelDestino]` de la clase (con el texto de reglas de cada opción).
   * - Paso 2 (`DialogV2.confirm`): resumen de la elección; la subida no se puede deshacer.
   * Cancelar en cualquier paso sale sin cambios. Aplica con `SistemaActor#subirDeNivel`.
   */
  async abrirSubidaNivel() {
    const actor = this.document;
    const opciones = actor.obtenerOpcionesSubidaNivel();
    if (!opciones) {
      ui.notifications.warn("No hay una subida de nivel disponible para esta Clase.");
      return;
    }
    const { configClase, nivelActual, nivelDestino, habilidades, packs, especializaciones } = opciones;
    const escapar = foundry.utils.escapeHTML;

    /** Radio con nombre y, si lo hay, texto de reglas debajo (v0.15.0). */
    const radio = (nombreCampo, i, nombre, texto) => `
      <label class="cyd-opcion-radio">
        <input type="radio" name="${nombreCampo}" value="${i}" ${i === 0 ? "checked" : ""} />
        <span><strong>${escapar(nombre)}</strong>${texto ? `<br><small>${escapar(texto)}</small>` : ""}</span>
      </label>`;
    const radiosHabilidades = habilidades.map((h, i) => radio("cydHabilidadNivel", i, h.nombre, h.texto)).join("");
    const radiosEspecializaciones = especializaciones.map((e, i) => radio("cydEspecializacionNivel", i, e.nombre, e.texto)).join("");
    const radiosPacks = packs.map((p, i) => `
      <label class="cyd-opcion-radio">
        <input type="radio" name="cydPackNivel" value="${i}" ${i === 0 ? "checked" : ""} />
        Pack ${i + 1}: ${escapar(describirPackCartas(p))}
      </label>`).join("");

    const eleccion = await DialogV2.prompt({
      ...opcionesDialogoSistema({ width: 460 }),
      window: { title: `${actor.name} — Subida a Nivel ${nivelDestino}` },
      content: `
        <p><strong>${escapar(configClase.nombre)}</strong> · Nivel ${nivelActual} → ${nivelDestino}</p>
        ${habilidades.length ? `<fieldset><legend><i class="fa-solid fa-wand-magic-sparkles"></i> Elige una habilidad</legend>${radiosHabilidades}</fieldset>` : ""}
        ${packs.length ? `<fieldset><legend><i class="fa-solid fa-layer-group"></i> Elige un pack de cartas</legend>${radiosPacks}</fieldset>` : ""}
        ${especializaciones.length ? `<fieldset><legend><i class="fa-solid fa-award"></i> Elige una especialización</legend>${radiosEspecializaciones}</fieldset>` : ""}
      `,
      ok: {
        label: "Continuar",
        icon: "fa-solid fa-angles-up",
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            indiceHabilidad: Number(f.cydHabilidadNivel?.value ?? 0),
            indicePack: Number(f.cydPackNivel?.value ?? 0),
            indiceEspecializacion: Number(f.cydEspecializacionNivel?.value ?? 0)
          };
        }
      },
      rejectClose: false
    });
    if (!eleccion) return;

    const habilidad = habilidades[eleccion.indiceHabilidad] ?? null;
    const pack = packs[eleccion.indicePack] ?? null;
    const especializacion = especializaciones[eleccion.indiceEspecializacion] ?? null;
    const confirmado = await DialogV2.confirm({
      ...opcionesDialogoSistema(),
      window: { title: "Confirmar Subida de Nivel" },
      content: `
        <p>${escapar(actor.name)} subirá a <strong>Nivel ${nivelDestino}</strong> y obtendrá:</p>
        ${habilidad ? `<p><i class="fa-solid fa-wand-magic-sparkles"></i> Habilidad: <strong>${escapar(habilidad.nombre)}</strong></p>` : ""}
        ${pack ? `<p><i class="fa-solid fa-layer-group"></i> Cartas: ${escapar(describirPackCartas(pack))}</p>` : ""}
        ${especializacion ? `<p><i class="fa-solid fa-award"></i> Especialización: <strong>${escapar(especializacion.nombre)}</strong></p>` : ""}
        <p>Esta elección no se puede deshacer. ¿Continuar?</p>
      `,
      yes: { label: "Subir de Nivel", icon: "fa-solid fa-angles-up" },
      no: { label: "Cancelar" },
      defaultYes: false,
      rejectClose: false
    });
    if (!confirmado) return;

    await actor.subirDeNivel(eleccion);
    this.render();
  }

  /* ======================================================================== */
  /*  ACCIONES DE CARTAS Y TURNO                                              */
  /* ======================================================================== */

  /**
   * Botón "inicializar pilas/clase" (v0.8.4):
   * - Si el Actor aún NO tiene Clase, abre el Asistente de Creación de Personaje
   *   (Diálogo DialogV2 de 2 pasos: Clase → Trinket) que además crea sus 6 pilas.
   * - Si ya tiene Clase, solo crea/vincula las 6 pilas de cartas.
   */
  static async #onInicializarPilas() {
    const actor = this.document;
    const tieneClase = actor.items.some(i => i.type === "clase");
    if (tieneClase) {
      await actor.inicializarPilasDeJugador();
    } else {
      await this.abrirAsistenteClase();
    }
    this.render();
  }

  /** Botón "Subir de Nivel" de la ranura de Clase (v0.10.0). */
  static async #onSubirNivel() {
    await this.abrirSubidaNivel();
  }

  static async #onRobarTurno() {
    await this.document.robarHastaLimiteMano();
    this.render();
  }

  /**
   * Usar / Usar y Quemar una carta de la mano (v0.14.0): abre el diálogo «Realizar acción»
   * (acción, Ataque apuntado, Potenciar, Reacción y excepciones). Los Trinkets se juegan directamente.
   */
  static async #onJugarCarta(event, target) {
    await abrirDialogoAccion(this.document, target.dataset.cartaId, { quemar: target.dataset.modo === "usar-y-quemar" });
    this.render();
  }

  /**
   * Acción o reacción fuera de combate (v0.14.0): inicia un mini turno robando el doble de la
   * Mano Máx. (`data-reaccion="true"`: reacción, una sola vez).
   */
  static async #onAccionFueraCombate(event, target) {
    await this.document.iniciarMiniTurno({ reaccion: target.dataset.reaccion === "true" });
    this.render();
  }

  /** Mini turno: robar otra mano (la acción tarda un turno más). */
  static async #onOtraManoMiniTurno() {
    await this.document.robarOtraManoMiniTurno();
    this.render();
  }

  /** Mini turno: terminar la acción fuera de combate y decidir qué pasa con las cartas sobrantes. */
  static async #onTerminarMiniTurno() {
    await this.document.terminarMiniTurno();
    this.render();
  }

  /** Vuelve a dejar disponible la reacción (control manual para excepciones). */
  static async #onRestablecerReaccion() {
    await this.document.restablecerReaccion();
    this.render();
  }

  static async #onRobarTrinket(event, target) {
    const actor = this.document;
    const { mano } = actor.system.pilasDocumentos;
    const trinketsDisponibles = actor.obtenerResumenTrinkets().filter(t => t.estado === "disponible");

    if (!mano || mano.cards.size === 0) {
      ui.notifications.warn("Necesitas al menos 1 carta en tu mano para descartarla y robar un Trinket.");
      return;
    }
    if (trinketsDisponibles.length === 0) {
      ui.notifications.warn("No tienes Trinkets disponibles en reserva.");
      return;
    }

    const preId = target.dataset.trinketId || "";
    const opcionesMano = mano.cards.contents
      .map(c => {
        const etiqueta = c.type === "trinket"
          ? `Trinket Nv. ${Number(c.system?.nivel) || 1}`
          : `${abreviadoPalo(c.system.palo)} - ${c.system.tipoDado}`;
        return `<option value="${c.id}">${nombreVisibleCarta(c)} (${etiqueta})</option>`;
      })
      .join("");
    const opcionesTrinkets = trinketsDisponibles
      .map(t => `<option value="${t.idOriginal}" ${t.idOriginal === preId ? "selected" : ""}>${t.nombre} (Nv. ${t.nivel})</option>`)
      .join("");

    const seleccion = await DialogV2.prompt({
      ...opcionesDialogoSistema({ width: 460 }),
      window: { title: "Robar Trinket por Descarte" },
      content: `
        <div class="form-group"><label>1. Carta de tu mano a descartar:</label><select name="cartaManoId">${opcionesMano}</select></div>
        <div class="form-group"><label>2. Trinket a tomar:</label><select name="trinketId">${opcionesTrinkets}</select></div>
      `,
      ok: {
        label: "Descartar y Robar",
        callback: (event, button) => ({
          cartaManoId: button.form.elements.cartaManoId.value,
          trinketId: button.form.elements.trinketId.value
        })
      },
      rejectClose: false
    });

    if (seleccion?.cartaManoId && seleccion?.trinketId) {
      await actor.robarTrinketPorDescarte(seleccion.cartaManoId, seleccion.trinketId);
      this.render();
    }
  }

  static async #onRetirarTrinket(event, target) {
    await this.document.retirarTrinketEnJuego(target.dataset.trinketId, {
      quemar: target.dataset.quemar === "true"
    });
    this.render();
  }

  static async #onFinCombate() {
    await this.document.finalizarAccionOCombate();
    this.render();
  }

  /** Descanso: pregunta si es cómodo y seguro (−1 Agotamiento) antes de realizarlo (v0.12.0). */
  /**
   * Clic en un segmento de la barra de Agotamiento (v0.12.0): fija ese nivel; si se pulsa
   * el segmento del nivel actual, baja uno (permite volver a 0).
   */
  static async #onFijarAgotamiento(event, target) {
    const nivel = Number(target.dataset.nivel) || 0;
    const actual = Number(this.document.system.cansancio?.value) || 0;
    const nuevo = nivel === actual ? nivel - 1 : nivel;
    await this.document.cambiarAgotamiento(nuevo - actual);
  }

  static async #onDescansar() {
    const opciones = await preguntarTipoDescanso(this.document.name);
    if (!opciones) return;
    await this.document.realizarDescanso(opciones);
    this.render();
  }

  static async #onAbrirPila(event, target) {
    const docPila = this.document.system.pilasDocumentos?.[target.dataset.pila];
    if (docPila) docPila.sheet.render(true);
  }

  /**
   * Crea una nueva Carta de Acción (en el Mazo) o un nuevo Trinket (en el Mazo de Trinkets)
   * con un nombre único y personalizable dentro de su pila ("Nuevo Trinket", "Nuevo Trinket 2"...),
   * para que cada Trinket sea diferenciable desde su creación (v0.8.2).
   * Abre inmediatamente su editor visual ApplicationV2 para personalizarlo.
   */
  static async #onCrearCartaEnMazo(event, target) {
    const tipoCarta = target.dataset.tipoCarta || "accion";
    const pilas = this.document.system.pilasDocumentos;
    const pilaDestino = tipoCarta === "trinket" ? pilas?.trinkets : pilas?.mazo;

    if (!pilaDestino) return;

    const base = tipoCarta === "trinket" ? "Nuevo Trinket" : "Nueva Carta de Acción";
    const nombresEnPila = [...pilaDestino.cards].map(c => c.name);
    const nombreUnico = generarNombreUnico(nombresEnPila, base);

    // Payload normalizado (name/face/faces/back sincronizados) para evitar "Unknown"
    const [nuevaCarta] = await pilaDestino.createEmbeddedDocuments("Card", [
      this.document._normalizarPayloadCarta({ name: nombreUnico, type: tipoCarta })
    ]);

    if (nuevaCarta) {
      nuevaCarta.sheet.render(true);
    }
  }

  /* ======================================================================== */
  /*  ACCIONES DE RAZA, ORIGEN, CLASE Y EQUIPO (ITEMS)                        */
  /* ======================================================================== */

  /**
   * Crea un Item de tipo 'raza', 'origen', 'clase', 'objeto' o 'habilidad' dentro del Actor.
   * Si es Raza, Origen o Clase y ya tenía uno, abre el existente para editarlo.
   */
  static async #onCrearItem(event, target) {
    const tipo = target.dataset.tipo;
    const actor = this.document;

    if (["raza", "origen", "clase"].includes(tipo)) {
      const existente = actor.items.find(i => i.type === tipo);
      if (existente) {
        existente.sheet.render(true);
        return;
      }
    }

    const nombresPorDefecto = {
      raza: "Nueva Raza",
      origen: "Nuevo Origen",
      clase: "Nueva Clase",
      objeto: "Nuevo Objeto",
      habilidad: "Nueva Habilidad"
    };

    const [nuevoItem] = await actor.createEmbeddedDocuments("Item", [{
      name: nombresPorDefecto[tipo] ?? "Nuevo Elemento",
      type: tipo
    }]);

    if (nuevoItem) nuevoItem.sheet.render(true);
  }

  static async #onEditarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static async #onEliminarItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) await item.delete();
  }

  static async #onAlternarEquipado(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item && item.type === "objeto") {
      await item.update({ "system.equipado": !item.system.equipado });
    }
  }

  /**
   * Sierpes · Tradición alquímica (v0.13.0): prepara el ungüento curativo.
   * @this {HojaPersonajeActor}
   */
  static async #onUsarAlquimia() {
    await this.document.usarTradicionAlquimica();
  }

  static async #onUsarHabilidad(event, target) {
    const itemId = target.dataset.itemId;
    await this.document.usarHabilidad(itemId);
  }

  static async #onDescartarCarta(event, target) {
    const cartaId = target.dataset.cartaId;
    await this.document.descartarCarta(cartaId);
    this.render();
  }

  static async #onQuemarCarta(event, target) {
    const cartaId = target.dataset.cartaId;
    await this.document.quemarCarta(cartaId);
    this.render();
  }
}