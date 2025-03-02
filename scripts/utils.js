// utils.js
/**
 * Utility functions for the crafting system.
 */
export function getReagents(actor) {
    if (!actor) {
        console.error("getReagents() Error: No valid actor provided.");
        return [];
    }

    let reagents = actor.items.filter(i => i.type === "loot" && i.system.type?.value === "reagent" && i.system.quantity > 0);
    console.log("✅ getReagents() Found Reagents:", reagents.map(r => ({ id: r.id, name: r.name })));
    return reagents;
}