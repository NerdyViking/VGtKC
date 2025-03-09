/**
 * Entry point for the module, loads all necessary scripts.
 */

console.log("main.js loaded");

Hooks.once("init", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting | Initializing module");
});

Hooks.once("ready", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting | Module is ready");
});

Hooks.on("renderActorSheet", (app, html, data) => {
    console.log("Vikarov's Crafting | Actor sheet rendered for", app.actor.name);
});

import "./scripts/hooks.js";
import "./scripts/alchemyHooks.js";
import "./scripts/magicHooks.js";
import "./scripts/reagents.js";
import "./scripts/alchemyCrafting.js";
import "./scripts/alchemyCraftingUI.js";
import "./scripts/magicCraftingUI.js";
import "./scripts/craftingUI.js";
import "./scripts/alchemyCompendium.js";
import "./scripts/craftingCompendium.js";
import "./scripts/reagentSelectionDialog.js";
import "./scripts/utils.js";