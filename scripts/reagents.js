/**
 * Handles reagent-related data and subtype registration for the alchemy system.
 */

/**
 * Calculates the total Influence Points (IP) sums for selected reagents.
 * @param {Object} craftingState - The current crafting state with selected reagents.
 * @returns {Object} Sums of combat, utility, and entropy IPs.
 */
export function calculateIPSums(craftingState) {
    const sums = { combat: 0, utility: 0, entropy: 0 };
    craftingState.selectedReagents.forEach((reagent, index) => {
        if (reagent) {
            const ipValues = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
            sums.combat += Number(ipValues.combat) || 0;
            sums.utility += Number(ipValues.utility) || 0;
            sums.entropy += Number(ipValues.entropy) || 0;
        } else {
        }
    });
    return sums;
}

/**
 * Determines the crafting outcome based on Influence Points.
 * @param {Object} actor - The actor performing the crafting.
 * @param {Object} craftingState - The current crafting state.
 * @returns {Object} Outcome data including dominant categories and tiebreaker status.
 */
export function determineOutcome(actor, craftingState) {
    const ipSums = calculateIPSums(craftingState);
    const outcome = { combat: 0, utility: 0, entropy: 0, hasTiebreaker: false, outcomes: [], selectedOutcome: craftingState.selectedOutcome };
    const maxPoints = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);

    if (maxPoints === 0) {
        return outcome;
    }

    const dominantCategories = [];
    if (ipSums.combat === maxPoints) dominantCategories.push("combat");
    if (ipSums.utility === maxPoints) dominantCategories.push("utility");
    if (ipSums.entropy === maxPoints) dominantCategories.push("entropy");

    outcome.combat = ipSums.combat;
    outcome.utility = ipSums.utility;
    outcome.entropy = ipSums.entropy;

    if (dominantCategories.length === 1) {
        outcome.outcomes = [dominantCategories[0]];
    } else {
        outcome.hasTiebreaker = true;
        outcome.outcomes = dominantCategories;
    }

    return outcome;
}

/**
 * Handles the crafting process, creating the outcome item and resetting the crafting state.
 * @param {Object} app - The actor sheet application.
 * @param {Object} craftingState - The current crafting state.
 * @param {Function} calculateIPSums - Function to calculate IP sums.
 * @param {Function} determineOutcome - Function to determine the crafting outcome.
 * @param {Function} renderCraftingTab - Function to render the crafting tab.
 * @param {Object} html - The HTML content of the actor sheet.
 */
export async function handleCrafting(app, craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html) {
    const outcomeData = determineOutcome(craftingState.actor, craftingState);
    if (!outcomeData.outcomes.length) {
        ui.notifications.warn("No outcome determined. Please select reagents with Influence Points.");
        return;
    }

    if (outcomeData.hasTiebreaker && !craftingState.selectedOutcome) {
        ui.notifications.warn("Please select an outcome from the tiebreaker options.");
        return;
    }

    const selectedCategory = outcomeData.hasTiebreaker ? craftingState.selectedOutcome : outcomeData.outcomes[0];
    let outcomeItem;

    if (selectedCategory === "combat") {
        outcomeItem = await game.packs.get("vikarovs-guide-to-kaeliduran-crafting.combat-outcomes").getDocument("combatOutcome");
    } else if (selectedCategory === "utility") {
        outcomeItem = await game.packs.get("vikarovs-guide-to-kaeliduran-crafting.utility-outcomes").getDocument("utilityOutcome");
    } else if (selectedCategory === "entropy") {
        outcomeItem = await game.packs.get("vikarovs-guide-to-kaeliduran-crafting.entropy-outcomes").getDocument("entropyOutcome");
    }

    if (outcomeItem) {
        await craftingState.actor.createEmbeddedDocuments("Item", [outcomeItem.toObject()]);
        ui.notifications.info(`Crafted ${outcomeItem.name}!`);
    } else {
        ui.notifications.error("Failed to craft item: Outcome item not found.");
    }

    craftingState.selectedReagents = [null, null, null];
    craftingState.selectedOutcome = null;
    if (app.updateCraftingUI) {
        await app.updateCraftingUI();
    } else {
        await renderCraftingTab(app, html, { actor: craftingState.actor }, calculateIPSums, determineOutcome, () => {}, handleCrafting, app.updateCraftingUI);
    }
}

/**
 * Registers the 'reagent' subtype for loot items during module setup.
 * Called from hooks.js on 'setup'.
 */
export function registerReagentSubtype() {
    // Ensure CONFIG.DND5E is defined and initialized
    if (!CONFIG.DND5E) {
        CONFIG.DND5E = CONFIG.DND5E || {};
    }
    if (!CONFIG.DND5E.itemTypes) {
        CONFIG.DND5E.itemTypes = {};
    }
    if (!CONFIG.DND5E.itemTypes.loot) {
        CONFIG.DND5E.itemTypes.loot = [];
    } else if (!Array.isArray(CONFIG.DND5E.itemTypes.loot)) {
        CONFIG.DND5E.itemTypes.loot = Array.from(new Set(CONFIG.DND5E.itemTypes.loot));
    }
    if (!CONFIG.DND5E.itemTypes.loot.includes("reagent")) {
        CONFIG.DND5E.itemTypes.loot.push("reagent");
    }

    // Ensure the subtype has a label for the UI
    if (!CONFIG.DND5E.itemTypeLabels) {
        CONFIG.DND5E.itemTypeLabels = {};
    }
    if (!CONFIG.DND5E.itemTypeLabels.reagent) {
        CONFIG.DND5E.itemTypeLabels.reagent = "Reagent";
    }

    // Fallback: Attempt to add to CONFIG.Item.type (less likely to work with DND5E)
    if (!CONFIG.Item) {
        CONFIG.Item = {};
    }
    if (!CONFIG.Item.type) {
        CONFIG.Item.type = [];
    } else if (!Array.isArray(CONFIG.Item.type)) {
        CONFIG.Item.type = Array.from(new Set(CONFIG.Item.type));
    }
    if (!CONFIG.Item.type.includes("reagent")) {
        CONFIG.Item.type.push("reagent");
    }

    // Add label for fallback
    if (!CONFIG.Item.typeLabels) {
        CONFIG.Item.typeLabels = {};
    }
    if (!CONFIG.Item.typeLabels.reagent) {
        CONFIG.Item.typeLabels.reagent = "Reagent";
    }
}