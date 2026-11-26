/**
 * @file sistema.mjs
 * @description Punto de entrada principal del sistema para Foundry VTT v14.
 */

import { SISTEMA_CONFIG } from "./config.mjs";
import { PersonajeDataModel, PnjDataModel } from "./data/actor-model.mjs";
import { CartaAccionDataModel, CartaTrinketDataModel } from "./data/card-model.mjs";
import {
  RazaDataModel,
  OrigenDataModel,
  ClaseDataModel,
  ObjetoDataModel,
  HabilidadDataModel
} from "./data/item-model.mjs";
import { SistemaActor } from "./documents/actor.mjs";
import { SistemaCombat } from "./documents/combat.mjs";
import { HojaPersonajeActor } from "./applications/actor-sheet.mjs";
import { HojaItemSistema } from "./applications/item-sheet.mjs";
import { HojaCartaSistema } from "./applications/card-sheet.mjs";
import { PanelMasterApp } from "./applications/gm-panel.mjs";
import { HojaPnjActor } from "./applications/npc-sheet.mjs";
import { personalizarBannerPausa } from "./applications/game-pause.mjs";
import { registrarReajusteEnResize } from "./applications/ventana-dinamica.mjs";
import { activarBotonesTiradaPendiente, registrarSocketDados } from "./dados.mjs";
import { leerTamanoBase, registrarAjustesDelSistema } from "./settings.mjs";
import { limpiarNombreCarta, nombreVisibleCarta, tieneRasgoRacial } from "./config.mjs";

const { DocumentSheetConfig } = foundry.applications.apps;

Hooks.once("init", () => {
  console.log("Cartas y Dados | Inicializando el sistema en Foundry VTT v14...");

  CONFIG.CARTASYDADOS = SISTEMA_CONFIG;

  // 1. PRIMERO: registrar los ajustes del mundo ANTES de asignar CONFIG.*.dataModels ni
  //    registrar las fichas. Al reabrir el mundo, Foundry hidrata los Actores desde la base
  //    de datos nada más arrancar; si los ajustes (y sus valores por defecto en los esquemas)
  //    aún no se han registrado, la hidratación falla y la ficha queda colapsada (Bug 1).
  registrarAjustesDelSistema(() => {
    for (const actor of game.actors ?? []) {
      actor.prepareData();
      if (actor.sheet?.rendered) actor.sheet.render();
    }
    if (PanelMasterApp.instancia?.rendered) PanelMasterApp.instancia.render();
  });

  CONFIG.Actor.documentClass = SistemaActor;
  CONFIG.Combat.documentClass = SistemaCombat;

  CONFIG.Combat.initiative = {
    formula: "1d10 + @caracteristicasTotales.consciencia",
    decimals: 2
  };

  // Registrar etiquetas de subtipos de Card para Foundry v14
  CONFIG.Card.typeLabels = {
    accion: "TYPES.Card.accion",
    trinket: "TYPES.Card.trinket"
  };

  // Exponer API global para acceso rápido o macros
  game.cartasYDados = {
    abrirPanelMaster: () => PanelMasterApp.mostrar()
  };

  Object.assign(CONFIG.Actor.dataModels, {
    personaje: PersonajeDataModel,
    pnj: PnjDataModel
  });

  Object.assign(CONFIG.Item.dataModels, {
    raza: RazaDataModel,
    origen: OrigenDataModel,
    clase: ClaseDataModel,
    objeto: ObjetoDataModel,
    habilidad: HabilidadDataModel
  });

  Object.assign(CONFIG.Card.dataModels, {
    accion: CartaAccionDataModel,
    trinket: CartaTrinketDataModel
  });

  // 2. Registro de fichas en `init` (nunca en `ready`): así las fichas existen antes de
  //    que Foundry hidrate y renderice cualquier Actor/Item/Card al reabrir el mundo (Bug 1).
  // Hoja predeterminada para Personajes Jugadores (y opcional para PNJs Jefes)
  DocumentSheetConfig.registerSheet(Actor, "cartas-y-dados", HojaPersonajeActor, {
    types: ["personaje"],
    makeDefault: true,
    label: "Hoja Completa con Mazo (PJ / Jefe)"
  });

  // Hoja táctica simplificada predeterminada para Criaturas / PNJs
  DocumentSheetConfig.registerSheet(Actor, "cartas-y-dados", HojaPnjActor, {
    types: ["pnj"],
    makeDefault: true,
    label: "Ficha Táctica de Criatura / PNJ"
  });

  DocumentSheetConfig.registerSheet(Item, "cartas-y-dados", HojaItemSistema, {
    types: ["raza", "origen", "clase", "objeto", "habilidad"],
    makeDefault: true,
    label: "Hoja de Elemento (Cartas y Dados)"
  });

  DocumentSheetConfig.registerSheet(Card, "cartas-y-dados", HojaCartaSistema, {
    types: ["accion", "trinket"],
    makeDefault: true,
    label: "Editor de Carta (Cartas y Dados)"
  });
});

/**
 * Sanea los nombres de todas las cartas existentes en el mundo para eliminar
 * cualquier aparición de "Unknown" y sincronizar name, faces y back.
 * Se ejecuta una sola vez al iniciar el mundo (Hook ready) solo para el GM.
 */
async function sanearNombresCartasExistentes() {
  if (!game.user?.isGM) return;
  const nombreIMG = "icons/svg/card-hand.svg";
  for (const pila of game.cards.contents) {
    if (!pila.cards || pila.cards.size === 0) continue;
    const updates = [];
    for (const carta of pila.cards) {
      const nombreCorregido = nombreVisibleCarta(carta);
      const necesitaActualizacion =
        /^unknown/i.test(String(carta.name ?? "")) ||
        /^unknown/i.test(String(carta._source?.name ?? "")) ||
        carta.face === null ||
        !carta.faces?.[0] ||
        carta.faces[0].name !== nombreCorregido;
      if (!necesitaActualizacion) continue;
      updates.push({
        _id: carta.id,
        name: nombreCorregido,
        face: 0,
        faces: [
          {
            ...(carta.faces?.[0] ?? {}),
            name: nombreCorregido,
            img: carta.img || nombreIMG
          }
        ],
        back: {
          ...(carta.back ?? {}),
          name: nombreCorregido
        }
      });
    }
    if (updates.length > 0) {
      await pila.updateEmbeddedDocuments("Card", updates);
    }
  }
  // Recalcular datos derivados de todos los actores
  for (const actor of game.actors) {
    actor.prepareData();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
}

Hooks.once("ready", async () => {
  // Ventanas dinámicas (v0.9.6): reajusta las ventanas del sistema al cambiar el tamaño del navegador.
  registrarReajusteEnResize();
  // Crítico/Pifia y privacidad de ataques (v0.11.0): mensajes solo Master pedidos por jugadores.
  registrarSocketDados();

  // (v0.14.1) El ajuste "tamanoBase" guardaba índices ("0".."4"): se convierte al nombre del tamaño.
  if (game.user.isGM && game.settings.get("cartas-y-dados", "tamanoBase") !== leerTamanoBase()) {
    await game.settings.set("cartas-y-dados", "tamanoBase", leerTamanoBase());
  }

  try {
    await sanearNombresCartasExistentes();
  } catch (err) {
    console.warn("Cartas y Dados | Error sanando nombres de cartas existentes:", err);
  }

  // (v0.15.0) Abalorio Eterno: los personajes anteriores a la regla lo tienen en el Mazo de Trinkets
  // o en la Mano; el Master lo coloca En Juego (solo puede estar En Juego o Quemado).
  if (game.user.isGM) {
    for (const actor of game.actors?.filter(a => a.type === "personaje") ?? []) {
      try {
        actor.prepareData();
        await actor._asegurarAbaloriosEternos?.();
      } catch (err) {
        console.warn(`Cartas y Dados | Error colocando el Abalorio Eterno de ${actor.name}:`, err);
      }
    }
  }


  // REFRESCO DE SEGURIDAD AL REABRIR EL MUNDO (Bug 1):
  // game.cards y game.actors ya están hidratados. Recalcular los datos derivados
  // de todos los actores y re-renderizar cualquier ficha abierta para que ninguna
  // quede solo con el marco y el título tras recargar (F5) o volver a abrir Foundry.
  for (const actor of game.actors ?? []) {
    actor.prepareData();
    if (actor.sheet?.rendered) {
      actor.sheet.render();
    }
  }
  if (PanelMasterApp.instancia?.rendered) {
    PanelMasterApp.instancia.render();
  }
});

/**
 * Al iniciar el mundo para el Master, añadimos un botón de acceso directo al Panel del Master
 * en los controles de escena (barra izquierda) y abrimos el panel si lo desea.
 */
/** Banner temático de "Partida en Pausa" (ver applications/game-pause.mjs). */
Hooks.on("renderGamePause", personalizarBannerPausa);

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;

  const tokenControls = controls.tokens ?? controls.find?.(c => c.name === "token");
  if (!tokenControls) return;

  const herramientaGM = {
    name: "panelMasterCyD",
    title: "Abrir Panel del Master (Cartas y Dados)",
    icon: "fas fa-crown",
    button: true,
    visible: true,
    onChange: () => PanelMasterApp.mostrar()
  };

  if (Array.isArray(tokenControls.tools)) {
    tokenControls.tools.push(herramientaGM);
  } else if (tokenControls.tools && typeof tokenControls.tools === "object") {
    tokenControls.tools.panelMasterCyD = herramientaGM;
  }
});

/* -------------------------------------------------------------------------- */
/*  Organización de Actores en Carpetas (Jugadores / PNJs)                    */
/* -------------------------------------------------------------------------- */

/**
 * Cuando se crea un Actor, lo mueve automáticamente a la carpeta correspondiente:
 *  - tipo "personaje"  → carpeta "Jugadores"
 *  - tipo "pnj"        → carpeta "PNJs"
 * Las carpetas se crean si aún no existen.
 */
/**
 * Vinculación de Tokens por defecto (v0.12.0): los `personaje` nacen con "Link Actor Data"
 * activado (`prototypeToken.actorLink: true`) y los `pnj` desactivado, para que cada Token de
 * criatura sea independiente. Si los datos de creación ya traen `actorLink` (duplicado,
 * importación o compendio) se respeta ese valor.
 */
Hooks.on("preCreateActor", (actor, data) => {
  if (foundry.utils.getProperty(data, "prototypeToken.actorLink") !== undefined) return;
  if (actor.type === "personaje") actor.updateSource({ "prototypeToken.actorLink": true });
  else if (actor.type === "pnj") actor.updateSource({ "prototypeToken.actorLink": false });
});

Hooks.on("createActor", async (actor) => {
  if (!game.user?.isGM) return;

  const folderName = actor.type === "personaje" ? "Jugadores" : "PNJs";
  const folderColor = actor.type === "personaje" ? "#2ecc71" : "#e74c3c";

  let carpeta = game.folders.find(f => f.type === "Actor" && f.name === folderName);
  if (!carpeta) {
    carpeta = await Folder.create({
      name: folderName,
      type: "Actor",
      color: folderColor
    });
  }

  if (actor.folder !== carpeta.id) {
    await actor.update({ folder: carpeta.id });
  }
});

/* -------------------------------------------------------------------------- */
/*  Mantenimiento: limpieza de pilas y carpetas al eliminar un Actor          */
/* -------------------------------------------------------------------------- */

/**
 * Cuando se elimina un Actor del mundo (PJ o PNJ), borra los documentos `Cards`
 * vinculados en `system.pilas` (Mazo, Mano, Descarte, Quemadas, Trinkets y En Juego)
 * y, a continuación, las carpetas `Cards` que los contenían si quedan vacías.
 *
 * Salvaguardas:
 *  - Solo lo ejecuta el GM activo (`game.users.activeGM`) para no duplicar borrados.
 *  - Ignora Actores de compendio (`actor.pack`).
 *  - No borra una pila que siga referenciada por otro Actor (p. ej. un Actor duplicado
 *    que comparte los mismos IDs de pila).
 *  - Solo borra una carpeta si ya no contiene pilas ni subcarpetas.
 * @param {Actor} actor - El Actor eliminado.
 */
Hooks.on("deleteActor", async (actor) => {
  if (actor.pack) return;
  if (!game.users.activeGM?.isSelf) return;

  const idsPilas = Object.values(actor.system?.pilas ?? {}).filter(Boolean);
  if (!idsPilas.length) return;

  // IDs de pilas que siguen en uso por otros Actores del mundo.
  const idsEnUso = new Set();
  for (const otro of game.actors) {
    if (otro.id === actor.id) continue;
    for (const id of Object.values(otro.system?.pilas ?? {})) {
      if (id) idsEnUso.add(id);
    }
  }

  const pilasABorrar = idsPilas
    .filter(id => !idsEnUso.has(id))
    .map(id => game.cards.get(id))
    .filter(Boolean);
  if (!pilasABorrar.length) return;

  const idsCarpetas = new Set(pilasABorrar.map(p => p.folder?.id).filter(Boolean));

  try {
    await Cards.deleteDocuments(pilasABorrar.map(p => p.id));

    const carpetasVacias = [...idsCarpetas]
      .map(id => game.folders.get(id))
      .filter(carpeta => carpeta
        && carpeta.type === "Cards"
        && !game.cards.some(c => c.folder?.id === carpeta.id)
        && !game.folders.some(f => f.folder?.id === carpeta.id));
    if (carpetasVacias.length) {
      await Folder.deleteDocuments(carpetasVacias.map(c => c.id));
    }

    console.log(`Cartas y Dados | Eliminadas ${pilasABorrar.length} pilas y ${carpetasVacias.length} carpetas de "${actor.name}".`);
  } catch (err) {
    console.error(`Cartas y Dados | Error al limpiar las pilas de "${actor.name}":`, err);
  }
});

/* -------------------------------------------------------------------------- */
/*  Interactividad en Mensajes de Chat (Foundry v14 renderChatMessageHTML)    */
/* -------------------------------------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  activarBotonesTiradaPendiente(message, html);
  anadirBotonEsperaUnMomento(message, html);
  activarBotonCuracion(html);
  activarBotonesMendacium(message, html);

  const btnDano = html.querySelector(".cyd-btn-aplicar-dano");
  if (!btnDano) return;
  // El daño solo lo ve y aplica el Master (v0.11.0): se quita el botón a cualquier otro usuario.
  if (!game.user.isGM) {
    btnDano.remove();
    return;
  }

  btnDano.addEventListener("click", async ev => {
    ev.preventDefault();
    const uuid = btnDano.dataset.actorUuid;
    const dano = Number(btnDano.dataset.dano) || 0;

    const actorObjetivo = await fromUuid(uuid);
    if (!actorObjetivo) {
      ui.notifications.warn("No se encontró la criatura objetivo.");
      return;
    }

    if (!game.user.isGM) {
      ui.notifications.warn("Solo el Master puede aplicar el daño.");
      return;
    }

    const saludActual = actorObjetivo.system.salud.value;
    const nuevaSalud = Math.max(0, saludActual - dano);
    await actorObjetivo.update({ "system.salud.value": nuevaSalud });

    btnDano.disabled = true;
    btnDano.innerHTML = `<i class="fa-solid fa-check"></i> ${dano} de Daño Aplicado (Salud: ${nuevaSalud})`;
  });
});

/**
 * Humanos · «Espera un momento» (v0.13.0): añade al mensaje de una tirada con
 * `flags.cartas-y-dados.repeticion` un botón para repetirla, solo para el propietario del
 * Actor, si el rasgo no se ha usado desde el último descanso y la tirada no se ha repetido.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function anadirBotonEsperaUnMomento(message, html) {
  const datos = message.getFlag("cartas-y-dados", "repeticion");
  if (!datos || message.getFlag("cartas-y-dados", "repetida")) return;
  const actor = fromUuidSync(datos.actorUuid);
  if (!actor?.isOwner || actor.system?.rasgosRaza?.esperaUnMomentoUsado) return;
  if (!tieneRasgoRacial(actor, "esperaUnMomento")) return;

  const contenedor = html.querySelector(".message-content") ?? html;
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "cyd-btn-espera-momento";
  boton.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Espera un momento (repetir tirada)';
  boton.dataset.tooltip = "Rasgo racial (Humanos): repite esta tirada y usa el nuevo resultado. 1 vez por descanso.";
  boton.addEventListener("click", async ev => {
    ev.preventDefault();
    boton.disabled = true;
    await actor.repetirTiradaEsperaUnMomento(message);
    boton.remove();
  });
  contenedor.append(boton);
}

/**
 * Sierpes · «Tradición alquímica» (v0.13.0): botón para que el Master aplique la curación
 * a una criatura que el jugador no puede modificar. Se elimina para el resto de usuarios.
 * @param {HTMLElement} html
 */
function activarBotonCuracion(html) {
  const boton = html.querySelector(".cyd-btn-aplicar-curacion");
  if (!boton) return;
  if (!game.user.isGM) {
    boton.remove();
    return;
  }
  boton.addEventListener("click", async ev => {
    ev.preventDefault();
    const actorObjetivo = await fromUuid(boton.dataset.actorUuid);
    if (!actorObjetivo) {
      ui.notifications.warn("No se encontró la criatura objetivo.");
      return;
    }
    const curacion = Number(boton.dataset.curacion) || 0;
    const antes = Number(actorObjetivo.system.salud?.value) || 0;
    const maximo = Number(actorObjetivo.system.salud?.maxTotal) || antes;
    const despues = Math.min(maximo, antes + curacion);
    await actorObjetivo.update({ "system.salud.value": despues });
    boton.disabled = true;
    boton.innerHTML = `<i class="fa-solid fa-check"></i> Curación aplicada (Salud: ${despues})`;
  });
}

/**
 * Mendacium Charisma (v0.15.0): botones «Robar carta (Empatía)» y «Elegir carta (Promesa)».
 * Solo los ve y usa el propietario del Actor indicado en `data-actor-uuid`; cada mensaje se
 * usa una sola vez por Actor (`flags.cartas-y-dados.ultimaEmpatia` / `ultimaPromesa`).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activarBotonesMendacium(message, html) {
  const botones = [
    { selector: ".cyd-btn-empatia", flag: "ultimaEmpatia",
      usar: (actor, b) => actor.usarEmpatia(b.dataset.origen ?? "") },
    { selector: ".cyd-btn-promesa", flag: "ultimaPromesa",
      usar: (actor, b) => actor.elegirCartaPromesa(Number(b.dataset.x) || 0, b.dataset.origen ?? "") }
  ];
  for (const { selector, flag, usar } of botones) {
    for (const boton of html.querySelectorAll(selector)) {
      const actor = fromUuidSync(boton.dataset.actorUuid);
      if (!actor?.isOwner) {
        boton.remove();
        continue;
      }
      if (actor.getFlag("cartas-y-dados", flag) === message.id) {
        boton.disabled = true;
        continue;
      }
      boton.addEventListener("click", async ev => {
        ev.preventDefault();
        boton.disabled = true;
        const hecho = await usar(actor, boton);
        if (hecho) await actor.setFlag("cartas-y-dados", flag, message.id);
        else boton.disabled = false;
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Abalorio Empatía: aviso cuando un personaje quema una carta (v0.15.0)     */
/* -------------------------------------------------------------------------- */

/** Temporizadores por Actor que quema: varias cartas quemadas a la vez generan un solo aviso. */
const temporizadoresEmpatia = new Map();

/**
 * Cuando el usuario actual crea una carta en la pila de Quemadas de un personaje, avisa (susurro a
 * sus dueños y al Master) a los demás personajes con el abalorio Empatía En Juego, con un botón
 * para robar una carta.
 */
Hooks.on("createCard", (carta, _opciones, userId) => {
  if (userId !== game.user.id) return;
  const pila = carta.parent;
  if (!(pila instanceof Cards)) return;
  const quemador = game.actors.find(a => a.type === "personaje" && a.system.pilas?.quemadasId === pila.id);
  if (!quemador) return;
  clearTimeout(temporizadoresEmpatia.get(quemador.id));
  temporizadoresEmpatia.set(quemador.id, setTimeout(() => {
    temporizadoresEmpatia.delete(quemador.id);
    avisarEmpatia(quemador);
  }, 250));
});

/**
 * Publica el aviso de Empatía para cada aliado de `quemador` con el abalorio En Juego.
 * @param {Actor} quemador - Personaje que ha quemado una o varias cartas.
 * @returns {Promise<void>}
 */
async function avisarEmpatia(quemador) {
  const escapar = foundry.utils.escapeHTML;
  const empaticos = quemador.aliadosPosibles?.().filter(a => a.abaloriosActivos?.().has("empatia")) ?? [];
  for (const aliado of empaticos) {
    const destinatarios = game.users.filter(u => u.isGM || aliado.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: aliado }),
      whisper: destinatarios,
      content: `
        <div class="cyd-chat-aviso"><i class="fa-solid fa-heart"></i><p><strong>${escapar(quemador.name)}</strong> ha quemado una carta: <strong>${escapar(aliado.name)}</strong> puede robar una carta (Empatía, una vez por turno).</p></div>
        <button type="button" class="cyd-btn-empatia" data-actor-uuid="${aliado.uuid}" data-origen="${escapar(quemador.name)}">
          <i class="fa-solid fa-heart"></i> Robar carta (Empatía)
        </button>`
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Rasgos raciales: visión en la oscuridad al asignar la raza (v0.13.0)      */
/* -------------------------------------------------------------------------- */

Hooks.on("createItem", (item, _opciones, userId) => {
  if (userId !== game.user.id || item.type !== "raza" || !(item.parent instanceof Actor)) return;
  item.parent._aplicarVisionRacial?.();
});

Hooks.on("updateItem", (item, cambios, _opciones, userId) => {
  if (userId !== game.user.id || item.type !== "raza" || !(item.parent instanceof Actor)) return;
  if (!("name" in cambios) && cambios.system?.claveRaza === undefined) return;
  item.parent._aplicarVisionRacial?.();
});

/* -------------------------------------------------------------------------- */
/*  Reactividad en Tiempo Real entre Pilas de Cartas, Fichas y Panel GM       */
/* -------------------------------------------------------------------------- */

function refrescarHojasVinculadasAPila(documentoCardOCards) {
  const pilaId = documentoCardOCards instanceof Cards
    ? documentoCardOCards.id
    : documentoCardOCards.parent?.id;

  if (!pilaId) return;

  for (const actor of game.actors) {
    const idsPilasActor = Object.values(actor.system.pilas ?? {});
    if (idsPilasActor.includes(pilaId)) {
      // CRUCIAL: Recalcular datos derivados del Actor (ej. Defensa por Trinkets en juego)
      actor.prepareData();
      if (actor.sheet?.rendered) {
        actor.sheet.render();
      }
    }
  }

  if (PanelMasterApp.instancia?.rendered) {
    PanelMasterApp.instancia.render();
  }
}

Hooks.on("updateCards", refrescarHojasVinculadasAPila);
Hooks.on("createCard", refrescarHojasVinculadasAPila);
Hooks.on("updateCard", refrescarHojasVinculadasAPila);
Hooks.on("deleteCard", refrescarHojasVinculadasAPila);

Hooks.on("updateActor", () => {
  if (PanelMasterApp.instancia?.rendered) {
    PanelMasterApp.instancia.render();
  }
});
/* -------------------------------------------------------------------------- */
/*  AGOTAMIENTO (v0.12.0)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Antes de actualizar un Actor: si cambia `system.cansancio.value` (Agotamiento), lo acota a
 * 0..AGOTAMIENTO_MAXIMO y guarda el nivel anterior en `options` para `updateActor`.
 * Cubre cualquier origen del cambio (ficha, Panel del Master, mazo agotado, automatizaciones).
 */
Hooks.on("preUpdateActor", (actor, changes, options) => {
  const nuevo = foundry.utils.getProperty(changes, "system.cansancio.value");
  if (nuevo === undefined) return;
  foundry.utils.setProperty(changes, "system.cansancio.value", SistemaActor.limitarAgotamiento(nuevo));
  options.cydAgotamientoAnterior = Number(actor.system.cansancio?.value) || 0;
});

/**
 * Tras actualizar un Actor: si su Agotamiento cambió, aplica las consecuencias
 * (`SistemaActor#_alCambiarAgotamiento`) solo en el cliente que hizo el cambio,
 * para que no se dupliquen mensajes ni diálogos.
 */
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id || options.cydAgotamientoAnterior === undefined) return;
  const nuevo = Number(actor.system.cansancio?.value) || 0;
  if (nuevo === options.cydAgotamientoAnterior) return;
  actor._alCambiarAgotamiento(options.cydAgotamientoAnterior, nuevo)
    .catch(error => console.error("[Cartas y Dados] Error aplicando consecuencias de Agotamiento", error));
});
