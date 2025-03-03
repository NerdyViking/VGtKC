/**
 * Utility functions for the crafting system.
 */
export function getReagents(actor) {
    /* === Reagent Retrieval === */
    if (!actor) return [];
    return actor.items.filter(i => i.type === "loot" && i.system.type?.value === "reagent" && i.system.quantity > 0);
}