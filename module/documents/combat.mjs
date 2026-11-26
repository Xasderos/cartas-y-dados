/**
 * @file combat.mjs
 * @description Clase extendida de Combat para Foundry VTT v14.
 */

export class SistemaCombat extends Combat {

  /** @override */
  async startCombat() {
    await super.startCombat();
    // (v0.14.0) Todos empiezan el combate con su reacción disponible.
    for (const combatiente of this.combatants) {
      if (combatiente.actor?.isOwner) await combatiente.actor.restablecerReaccion?.();
    }
    await this.#robarCartasCombatienteActivo();
    return this;
  }

  /** @override */
  async nextTurn() {
    await super.nextTurn();
    await this.#robarCartasCombatienteActivo();
    return this;
  }

  /** @override */
  async nextRound() {
    await super.nextRound();
    await this.#robarCartasCombatienteActivo();
    return this;
  }

  /**
   * En Foundry VTT v14, al pulsar "Terminar Combate" y confirmar el diálogo,
   * el documento Combat se elimina disparando `_onDelete`.
   * Ejecutamos el barajado de fin de combate únicamente en el cliente que cerró el encuentro.
   * @override
   */
  _onDelete(options, userId) {
    super._onDelete(options, userId);

    if (game.user.id !== userId) return;

    for (const combatiente of this.combatants) {
      const actor = combatiente.actor;
      if (actor && actor.system.pilasDocumentos?.mazo) {
        actor.finalizarAccionOCombate();
      }
    }
  }

  /**
   * Inicio del turno del combatiente activo: recupera su reacción (v0.14.0; las reacciones se
   * limitan a una hasta que vuelve a ser su turno) y roba hasta su Mano Máxima.
   */
  async #robarCartasCombatienteActivo() {
    const actor = this.combatant?.actor;
    if (!actor) return;
    if (actor.isOwner) await actor.restablecerReaccion?.();

    const pilas = actor.system.pilasDocumentos;
    if (pilas?.mazo && pilas?.mano && pilas?.descarte) {
      await actor.robarHastaLimiteMano();
    }
  }
}