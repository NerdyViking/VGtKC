/**
 * Placeholder for the Crafting Compendium, managing magic item recipes.
 * To be fully implemented with the "Finato" magic item crafting system.
 */

console.log("craftingCompendium.js loaded");

/**
 * Stub class for the Crafting Compendium.
 */
export class CraftingCompendium extends Application {
    constructor(actor = null, options = {}) {
        super(options);
        this.actor = actor; // Null for GM mode, actor for player mode
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "crafting-compendium",
            title: "Magic Item Recipes",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/alchemyCompendium.hbs",
            width: 700,
            height: 700,
            classes: ["dnd5e2", "sheet", "crafting-compendium"]
        });
    }

    getData() {
        console.log("Crafting Compendium not yet implemented.");
        return {};
    }
}