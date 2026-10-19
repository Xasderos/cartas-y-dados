/**
 * @file compendios-base.mjs
 * @description Pobla automáticamente los 4 Compendios del sistema en Foundry VTT v14
 * con Razas, Orígenes, Clases, Equipo, Ataques de Criatura, Mazos de Cartas/Trinkets y Bestiario.
 */

import { nombreVisibleCarta } from "./config.mjs";

/**
 * Normaliza el payload de una Card para asegurar name, face, faces y back sincronizados
 * y sin valores "Unknown".
 * @param {object} datosCarta - Datos crudos de la carta.
 * @returns {object} Payload normalizado.
 */
function normalizarPayloadCarta(datosCarta) {
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

export async function poblarCompendiosDelSistema() {
  if (!game.user.isGM) return;

  ui.notifications.info("Poblando compendios del sistema Cartas y Dados...");

  // 1. COMPENDIO: Razas, Orígenes y Clases
  const packTrasfondos = game.packs.get("cartas-y-dados.trasfondos-y-clases");
  if (packTrasfondos && (await packTrasfondos.getDocuments()).length === 0) {
    await packTrasfondos.configure({ locked: false });
    await Item.createDocuments([
      {
        name: "Humano Versátil",
        type: "raza",
        system: {
          rasgoRacial: "Adaptabilidad Táctica (+1 al Límite de Mano)",
          bonificadores: { fisico: 0, consciencia: 0, social: 1, misticismo: 0, defensa: 0, limiteMano: 1, saludMax: 0, cansancioMax: 1 },
          descripcion: "<p>Los humanos destacan por su capacidad de improvisación, manteniendo una carta adicional en su mano.</p>"
        }
      },
      {
        name: "Enano de Ceniza",
        type: "raza",
        system: {
          rasgoRacial: "Coraza Natural (+1 Defensa, +3 Salud Máx.)",
          bonificadores: { fisico: 1, consciencia: 0, social: 0, misticismo: 0, defensa: 1, limiteMano: 0, saludMax: 3, cansancioMax: 2 },
          descripcion: "<p>Forjados en las profundidades volcánicas, soportan el agotamiento y los golpes como ninguna otra raza.</p>"
        }
      },
      {
        name: "Veterano de la Guardia",
        type: "origen",
        system: {
          beneficioTrasfondo: "Disciplina Marcial (+1 Defensa)",
          bonificadores: { fisico: 1, consciencia: 0, social: 0, misticismo: 0, defensa: 1, limiteMano: 0, saludMax: 2, cansancioMax: 0 },
          descripcion: "<p>Años patrullando las fronteras te han enseñado a mantener la guardia alta.</p>"
        }
      },
      {
        name: "Erudito del Gremio",
        type: "origen",
        system: {
          beneficioTrasfondo: "Mente Analítica (+1 Social, +1 Mano)",
          bonificadores: { fisico: 0, consciencia: 0, social: 1, misticismo: 0, defensa: 0, limiteMano: 1, saludMax: 0, cansancioMax: 0 },
          descripcion: "<p>El estudio de grimorios y tácticas amplía tus opciones cada turno.</p>"
        }
      },
      {
        name: "Maestro de Armas",
        type: "clase",
        system: {
          nivel: 1,
          paloAfin: "espadas",
          bonificadores: { fisico: 1, consciencia: 0, social: 0, misticismo: 0, defensa: 1, limiteMano: 0, saludMax: 4, cansancioMax: 1 },
          descripcion: "<p>Especialista en el palo FISC y el combate directo.</p>"
        }
      },
      {
        name: "Tejedor del Destino",
        type: "clase",
        system: {
          nivel: 1,
          paloAfin: "copas",
          bonificadores: { fisico: 0, consciencia: 0, social: 0, misticismo: 1, defensa: 0, limiteMano: 1, saludMax: 2, cansancioMax: 2 },
          descripcion: "<p>Canalizador espiritual afín al palo MIST y al uso de Trinkets.</p>"
        }
      }
    ], { pack: packTrasfondos.collection });
    await packTrasfondos.configure({ locked: true });
  }

  // 2. COMPENDIO: Equipo y Habilidades
  const packEquipo = game.packs.get("cartas-y-dados.equipo-y-habilidades");
  if (packEquipo && (await packEquipo.getDocuments()).length === 0) {
    await packEquipo.configure({ locked: false });
    await Item.createDocuments([
      {
        name: "Cota de Malla Ligera",
        type: "objeto",
        system: {
          equipado: true,
          cantidad: 1,
          bonificadores: { fisico: 0, consciencia: 0, social: 0, misticismo: 0, defensa: 2, limiteMano: 0, saludMax: 0, cansancioMax: 0 },
          descripcion: "<p>Otorga +2 a la Defensa mientras está equipada.</p>"
        }
      },
      {
        name: "Bolsa Táctica de Cartas",
        type: "objeto",
        system: {
          equipado: true,
          cantidad: 1,
          bonificadores: { fisico: 0, consciencia: 0, social: 0, misticismo: 0, defensa: 0, limiteMano: 1, saludMax: 0, cansancioMax: 0 },
          descripcion: "<p>Aumenta en +1 tu Límite de Mano Máxima.</p>"
        }
      },
      {
        name: "Mordisco Salvaje",
        type: "habilidad",
        system: {
          origenHabilidad: "criatura",
          esActivable: true,
          esAtaque: true,
          caracteristica: "fisico",
          tipoDado: "d8",
          bonoTirada: 1,
          descripcion: "<p>Ataque feroz de criatura que suma +1 al total.</p>"
        }
      }
    ], { pack: packEquipo.collection });
    await packEquipo.configure({ locked: true });
  }

  // 3. COMPENDIO: Biblioteca de Cartas y Trinkets
  const packCartas = game.packs.get("cartas-y-dados.mazos-y-cartas");
  if (packCartas && (await packCartas.getDocuments()).length === 0) {
    await packCartas.configure({ locked: false });
    const [mazoEstandar, mazoTrinkets] = await Cards.createDocuments([
      { name: "Mazo Estándar de Aventurero", type: "deck" },
      { name: "Repertorio de Trinkets Místicos", type: "deck" }
    ], { pack: packCartas.collection });

    await mazoEstandar.createEmbeddedDocuments("Card", [
      normalizarPayloadCarta({ name: "Estocada Directa", type: "accion", system: { palo: "espadas", numero: 2, esAtaque: true, seQuema: false, efecto: "<p>Ataque cuerpo a cuerpo fiable.</p>" } }),
      normalizarPayloadCarta({ name: "Tajo Pesado", type: "accion", system: { palo: "espadas", numero: 3, esAtaque: true, seQuema: false, automatizacion: { bonoTirada: 1 }, efecto: "<p>Golpe contundente (+1 al ataque).</p>" } }),
      normalizarPayloadCarta({ name: "Disparo Rápido", type: "accion", system: { palo: "bastos", numero: 2, esAtaque: true, seQuema: false, efecto: "<p>Ataque veloz a distancia.</p>" } }),
      normalizarPayloadCarta({ name: "Maniobra Táctica", type: "accion", system: { palo: "oros", numero: 2, esAtaque: false, seQuema: false, automatizacion: { robarCartas: 1 }, efecto: "<p>Roba +1 carta adicional.</p>" } }),
      normalizarPayloadCarta({ name: "Aliento Recuperador", type: "accion", system: { palo: "copas", numero: 2, esAtaque: false, seQuema: false, automatizacion: { curacion: 3, cambioCansancio: -1 }, efecto: "<p>Cura 3 de Salud y reduce 1 de Cansancio.</p>" } })
    ]);

    await mazoTrinkets.createEmbeddedDocuments("Card", [
      normalizarPayloadCarta({ name: "Égida de Hierro", type: "trinket", system: { palo: "espadas", numero: 2, realizaTirada: false, esAtaque: false, bonoDefensaEnJuego: 2, efectoPermanente: "<p>Portarlo infunde aplomo.</p>", efectoAlJugar: "<p>Otorga <strong>+2 a tu Defensa</strong> mientras permanezca En Juego.</p>" } }),
      normalizarPayloadCarta({ name: "Cáliz de Brasas", type: "trinket", system: { palo: "copas", numero: 3, realizaTirada: true, esAtaque: true, bonoDefensaEnJuego: 0, automatizacion: { curacion: 2 }, efectoPermanente: "<p>Tibio al tacto.</p>", efectoAlJugar: "<p>Ataca con fuego espiritual y te cura 2 de Salud.</p>" } })
    ]);

    await packCartas.configure({ locked: true });
  }

  // 4. COMPENDIO: Bestiario (Criaturas y PNJs)
  const packBestiario = game.packs.get("cartas-y-dados.bestiario");
  if (packBestiario && (await packBestiario.getDocuments()).length === 0) {
    await packBestiario.configure({ locked: false });
    await Actor.createDocuments([
      {
        name: "Trasgo Escudero",
        type: "pnj",
        system: {
          amenaza: 1,
          salud: { value: 10, max: 10 },
          defensa: 5,
          caracteristicas: { fisico: 2, consciencia: 2, social: 1, misticismo: 1 },
          biografia: "<p>Se oculta tras su escudo de madera y ataca en grupo.</p>"
        },
        items: [
          {
            name: "Lanza Oxidada",
            type: "habilidad",
            system: { esActivable: true, esAtaque: true, caracteristica: "consciencia", tipoDado: "d6", bonoTirada: 1, descripcion: "<p>Estocada rápida (+1 al ataque).</p>" }
          }
        ]
      },
      {
        name: "Gólem de Basalto",
        type: "pnj",
        system: {
          amenaza: 3,
          salud: { value: 24, max: 24 },
          defensa: 8,
          caracteristicas: { fisico: 3, consciencia: 1, social: 1, misticismo: 2 },
          biografia: "<p>Criatura acorazada de alta Defensa. Requiere ataques potentes o cartas quemadas para perforar su armadura.</p>"
        },
        items: [
          {
            name: "Puño Sísmico",
            type: "habilidad",
            system: { esActivable: true, esAtaque: true, caracteristica: "fisico", tipoDado: "d10", bonoTirada: 2, descripcion: "<p>Impacto demoledor de piedra.</p>" }
          }
        ]
      }
    ], { pack: packBestiario.collection });
    await packBestiario.configure({ locked: true });
  }

  ui.notifications.info("¡Compendios del sistema poblados con éxito!");
}