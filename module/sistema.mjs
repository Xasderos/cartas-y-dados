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
import { registrarAjustesDelSistema } from "./settings.mjs";

const { DocumentSheetConfig } = foundry.applications.apps;

Hooks.once("init", () => {
  console.log("Cartas y Dados | Inicializando el sistema en Foundry VTT v14...");

  CONFIG.CARTASYDADOS = SISTEMA_CONFIG;

  CONFIG.Actor.documentClass = SistemaActor;
  CONFIG.Combat.documentClass = SistemaCombat;

  CONFIG.Combat.initiative = {
    formula: "1d10 + @caracteristicasTotales.consciencia",
    decimals: 2
  };

  // Registrar todas las opciones configurables del sistema (Salud, Defensa, Cansancio PJ/PNJ, Mano, etc.)
  registrarAjustesDelSistema(() => {
    for (const actor of game.actors ?? []) {
      actor.prepareData();
      if (actor.sheet?.rendered) actor.sheet.render();
    }
    if (PanelMasterApp.instancia?.rendered) PanelMasterApp.instancia.render();
  });

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

  // Hoja predeterminada para Personajes Jugadores (y opcional para PNJs Jefes)
  DocumentSheetConfig.registerSheet(Actor, "cartas-y-dados", HojaPersonajeActor, {
    types: ["personaje", "pnj"],
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
 * Al iniciar el mundo para el Master, añadimos un botón de acceso directo al Panel del Master
 * en los controles de escena (barra izquierda) y abrimos el panel si lo desea.
 */
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
/*  Interactividad en Mensajes de Chat (Foundry v14 renderChatMessageHTML)    */
/* -------------------------------------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const btnDano = html.querySelector(".cyd-btn-aplicar-dano");
  if (!btnDano) return;

  btnDano.addEventListener("click", async ev => {
    ev.preventDefault();
    const uuid = btnDano.dataset.actorUuid;
    const dano = Number(btnDano.dataset.dano) || 0;

    const actorObjetivo = await fromUuid(uuid);
    if (!actorObjetivo) {
      ui.notifications.warn("No se encontró la criatura objetivo.");
      return;
    }

    if (!actorObjetivo.isOwner) {
      ui.notifications.warn("Solo el Master o el propietario de la criatura puede aplicar el daño.");
      return;
    }

    const saludActual = actorObjetivo.system.salud.value;
    const nuevaSalud = Math.max(0, saludActual - dano);
    await actorObjetivo.update({ "system.salud.value": nuevaSalud });

    btnDano.disabled = true;
    btnDano.textContent = `✅ ${dano} de Daño Aplicado (Salud: ${nuevaSalud})`;
  });
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