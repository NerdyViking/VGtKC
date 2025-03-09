/**
 * General utility functions for Vikarov's Guide to Kaeliduran Crafting.
 */

console.log("utils.js loaded");

/**
 * Retrieves reagents from an actor's inventory.
 * @param {Actor} actor - The actor to check.
 * @returns {Array} List of reagent items.
 */
export function getReagents(actor) {
    if (!actor) return [];
    console.log("Getting reagents for actor:", actor.name); // Debug
    const reagents = actor.items.filter(i => i.type === "loot" && i.system.type?.value === "reagent" && i.system.quantity > 0);
    console.log("Found reagents:", reagents.map(item => ({
        name: item.name,
        essence: item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None",
        ipValues: item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 }
    }))); // Debug
    return reagents;
}

/**
 * Ensures an element exists in the DOM, creating it if necessary.
 * @param {jQuery} parent - The parent element.
 * @param {string} selector - The CSS selector to find or create.
 * @param {string} html - The HTML to create if the element doesn't exist.
 * @returns {jQuery} The found or created element.
 */
export function ensureElement(parent, selector, html) {
    const $ = foundry.utils.jQuery || window.jQuery;
    let element = parent.find(selector);
    if (!element.length) {
        element = $(html);
        parent.append(element);
    }
    return element;
}