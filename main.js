// main.js
/**
 * Entry point for the module, loads all necessary scripts.
 */
Hooks.once("init", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting | Initializing module");
});

Hooks.once("ready", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting | Module is ready");
});

Hooks.on("renderActorSheet", (app, html, data) => {
    console.log("Vikarov's Crafting | Actor sheet rendered");
});

import "./scripts/hooks.js";