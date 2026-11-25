### ⚠️ IA Assisted Project ⚠️

> **Note:** The main development of this project is currently in Spanish. An English translation is pending.

# Cartas y Dados (Cards & Dice) - Foundry VTT System

A custom game system for Foundry VTT that blends card-based action selection with dice-rolling mechanics.

**Current version:** 0.8.5

## ⚙️ Core Mechanics

1. **Card + Dice Interaction (`XdY`):** the card's Suit determines which Characteristic rolls dice and the card's Number determines the die type (`1 = d4` … `5 = d12`).
2. **Using Skills (PC and NPC):** activating an active Skill requires at least one Mysticism card (`copas` / **MIST**) in the Actor's hand, chosen via `DialogV2`; the used card is moved from the hand to the **Cartas Quemadas** pile. If `system.requiereTirada === true` the skill rolls `Misticismo total`d`tipoDado de la carta` (+ `bonoTirada`); if `false` the effect applies directly with no roll. Attacks can target an enemy and apply damage vs `defensaTotal` via a chat button.
   **Character Creation Assistant (v0.8.5):** when opening a Character without a Class, the assistant opens with `"Elige una de las siguientes clases iniciales:"` and its buttons use plain-text `label` (no HTML).
