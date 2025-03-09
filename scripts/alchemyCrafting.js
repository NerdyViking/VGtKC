/**
 * Handles the core crafting logic and rules for the alchemy system.
 * Includes outcome determination, crafting execution, and resource management.
 */

console.log("alchemyCrafting.js loaded");

import { calculateIPSums } from "./reagents.js";

/**
 * Determines the crafting outcome based on reagent IP sums and actor knowledge.
 * @param {Actor} actor - The actor performing the crafting.
 * @param {Object} craftingState - The current crafting state with selected reagents.
 * @returns {Object} Outcome data including tiebreaker status and category.
 */
export function determineOutcome(actor, craftingState) {
    if (!craftingState || !craftingState.selectedReagents) {
        return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "No reagents selected" };
    }

    const ipSums = calculateIPSums(craftingState);
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);

    // No outcome if all IPs are zero
    if (maxSum === 0) {
        return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "No reagents selected" };
    }

    const categories = [];
    if (ipSums.combat === maxSum) categories.push({ category: "combat", sum: maxSum });
    if (ipSums.utility === maxSum) categories.push({ category: "utility", sum: maxSum });
    if (ipSums.entropy === maxSum) categories.push({ category: "entropy", sum: maxSum });

    if (!actor) return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "Error: Actor data missing" };

    let knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
    knownOutcomes = {
        Combat: knownOutcomes.Combat || [],
        Utility: knownOutcomes.Utility || [],
        Entropy: knownOutcomes.Entropy || []
    };

    if (categories.length > 1) {
        const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
        const tiebreakerOutcomes = categories.map(cat => {
            const categoryKey = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
            const isKnown = knownOutcomes[categoryKey].some(entry => Number(entry.sum) === cat.sum);
            const itemId = outcomes[categoryKey] && outcomes[categoryKey][cat.sum] ? outcomes[categoryKey][cat.sum] : null;
            let itemImg = null;
            if (itemId) {
                const item = game.items.get(itemId) || actor.items.get(itemId);
                if (item) itemImg = item.img;
            }
            let tooltip = isKnown ? `Known ${cat.category} consumable (Sum: ${cat.sum})` : "Unknown Outcome";
            if (itemId) tooltip += " - Click to view item";
            return {
                category: cat.category,
                sum: cat.sum,
                known: isKnown,
                tooltip: tooltip,
                selected: craftingState.selectedOutcome === cat.category,
                itemId: itemId,
                itemImg: itemImg
            };
        });
        // Determine if the selected outcome is known
        const selectedOutcome = tiebreakerOutcomes.find(outcome => outcome.selected);
        const isOutcomeKnown = selectedOutcome ? selectedOutcome.known : false;
        return { hasTiebreaker: true, tiebreakerOutcomes, outcomeKnown: isOutcomeKnown };
    } else if (categories.length === 0) {
        return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "No outcome determined (IP sums are all zero)" };
    } else {
        const category = categories[0].category;
        const sum = categories[0].sum;
        const categoryKey = category.charAt(0).toUpperCase() + category.slice(1);
        const isKnown = knownOutcomes[categoryKey].some(entry => Number(entry.sum) === sum);
        return {
            hasTiebreaker: false,
            outcomeKnown: isKnown,
            outcomeCategory: category,
            outcomeTooltip: isKnown ? `Known ${category} consumable (Sum: ${sum})` : "Unknown Outcome"
        };
    }
}

/**
 * Executes the alchemy crafting process, including checks, rolls, and item creation.
 * @param {Application} app - The actor sheet or app triggering the craft.
 * @param {Object} craftingState - The current crafting state.
 * @param {Function} calculateIPSums - Imported from reagents.js for IP calculations.
 * @param {Function} determineOutcome - Local function for outcome determination.
 * @param {Function} renderCraftingTab - Callback to re-render the crafting tab (from craftingUI.js).
 * @param {jQuery} html - The live HTML element of the app.
 */
export async function handleCrafting(app, craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html) {
    if (!craftingState || !craftingState.selectedReagents) {
        ui.notifications.error("Crafting failed: No crafting state or reagents defined.");
        return;
    }

    let actor = null;
    if (app instanceof ActorSheet) actor = app.actor;
    else if (app?.object?.actor) actor = app.object.actor;
    else {
        const actorSheet = Object.values(ui.windows).find(w => w instanceof ActorSheet && w.actor);
        actor = actorSheet?.actor || null;
    }

    if (!actor) {
        ui.notifications.error("Crafting failed: No valid actor detected.");
        return;
    }

    if (craftingState.selectedReagents.length !== 3 || craftingState.selectedReagents.some(r => !r)) {
        ui.notifications.error("You must select exactly 3 reagents to craft!");
        return;
    }

    const outcomeData = determineOutcome(actor, craftingState);
    if (!outcomeData || typeof outcomeData !== "object") {
        ui.notifications.error("Crafting failed: Outcome could not be determined.");
        return;
    }

    const selectedCategory = outcomeData.hasTiebreaker ? craftingState.selectedOutcome : outcomeData.outcomeCategory;
    if (!selectedCategory) {
        ui.notifications.error("Please select a crafting outcome!");
        return;
    }

    const ipSums = calculateIPSums(craftingState);
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
    const initialRarity = getRarity(maxSum);

    const baseCost = { common: 50, uncommon: 200, rare: 2000, veryRare: 20000, legendary: 100000 }[initialRarity];
    const reagentCost = craftingState.selectedReagents.reduce((total, r) => {
        const rarity = (r.system.rarity || "common").toLowerCase();
        const cost = { common: 10, uncommon: 50, rare: 600, veryRare: 6000, legendary: 50000 }[rarity];
        return total + (cost || 0);
    }, 0);

    const minimumGoldCost = Math.floor(baseCost * 0.1);
    const baseGoldCost = Math.max(0, baseCost - reagentCost);
    const goldCost = Math.max(minimumGoldCost, baseGoldCost);
    const currentGold = Number(actor.system.currency?.gp) || 0;

    if (currentGold < goldCost) {
        ui.notifications.error(`Insufficient gold! Need ${goldCost} gp, have ${currentGold} gp.`);
        return;
    }

    const dc = { common: 10, uncommon: 15, rare: 20, veryRare: 25, legendary: 30 }[initialRarity];
    const toolKey = "alchemist";

    if (!CONFIG.DND5E.toolIds[toolKey]) {
        ui.notifications.error("Alchemist's Supplies tool not found in system configuration!");
        return;
    }

    const toolItem = actor.items.find(i => i.type === "tool" && (i.system.identifier === "alchemist" || i.name.toLowerCase() === "alchemist's supplies"));

    if (!toolItem) {
        ui.notifications.error("Alchemist's Supplies tool item not found in inventory! Crafting requires this tool.");
        return;
    }

    const options = { dc: dc, rollMode: "publicroll", fastForward: false };
    if (toolItem) {
        const toolProficiency = actor.system.tools?.[toolKey] || { value: 0 };
        const updatedProficiency = {
            value: toolProficiency.value || 0,
            ability: toolItem.system?.ability || CONFIG.DND5E.toolIds[toolKey]?.ability || "int",
            itemId: toolItem.id
        };
        await actor.update({ [`system.tools.${toolKey}`]: updatedProficiency });
    }

    let rollTotal = null;
    try {
        const rollResult = await toolItem.rollToolCheck(options);
        if (rollResult && Array.isArray(rollResult) && rollResult.length > 0 && rollResult[0]?.total != null) {
            rollTotal = rollResult[0].total;
        } else {
            throw new Error("Invalid roll result returned from rollToolCheck.");
        }
    } catch (err) {
        ui.notifications.error(`Failed to determine tool check result: ${err.message}`);
        return;
    }

    if (rollTotal === null) {
        ui.notifications.error("Failed to determine tool check result. Roll total is null.");
        return;
    }

    let finalSum = maxSum;
    let quantity = 1;
    const margin = rollTotal - dc;

    if (margin >= 10) quantity = 2;
    else if (margin >= 0) quantity = 1;
    else if (margin >= -9) {
        const reduction = new Roll("1d4");
        await reduction.roll();
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure (near miss)" });
    } else {
        const reduction = new Roll("2d4");
        await reduction.roll();
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure (large miss)" });
    }

    let finalCategory = selectedCategory;
    if (finalSum !== maxSum) {
        const newSums = { combat: ipSums.combat, utility: ipSums.utility, entropy: ipSums.entropy };
        if (selectedCategory === "combat") newSums.combat = finalSum;
        else if (selectedCategory === "utility") newSums.utility = finalSum;
        else newSums.entropy = finalSum;

        const newMaxSum = Math.max(newSums.combat, newSums.utility, newSums.entropy);
        const newCategories = [];
        if (newSums.combat === newMaxSum) newCategories.push("combat");
        if (newSums.utility === newMaxSum) newCategories.push("utility");
        if (newSums.entropy === newMaxSum) newCategories.push("entropy");

        if (!newCategories.includes(selectedCategory)) {
            finalCategory = newCategories.length > 0 ? newCategories[0] : selectedCategory;
        }
    }

    const outcomeCategoryKey = finalCategory.charAt(0).toUpperCase() + finalCategory.slice(1);
    let knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
    knownOutcomes = {
        Combat: knownOutcomes.Combat || [],
        Utility: knownOutcomes.Utility || [],
        Entropy: knownOutcomes.Entropy || []
    };

    const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
    const predefinedItemId = outcomes[outcomeCategoryKey][finalSum];
    let consumableData;

    if (predefinedItemId) {
        const predefinedItem = game.items.get(predefinedItemId);
        if (predefinedItem) {
            consumableData = foundry.utils.deepClone(predefinedItem.toObject());
            consumableData.system.quantity = quantity;
        }
    }

    if (!consumableData) {
        const finalRarity = getRarity(finalSum);
        const consumableName = `${finalRarity} ${outcomeCategoryKey} Consumable`;
        consumableData = {
            name: consumableName,
            type: "consumable",
            system: {
                description: { value: `A ${finalRarity.toLowerCase()} ${finalCategory} consumable crafted via alchemy.` },
                quantity,
                rarity: finalRarity.toLowerCase(),
                consumableType: "potion",
                uses: { value: 1, max: 1, per: "charges", autoDestroy: true }
            }
        };
    }

    // Suppress sheet rendering during crafting updates
    app._suppressRender = true;
    console.log("Suppressing sheet render during crafting");

    try {
        const createdItems = await actor.createEmbeddedDocuments("Item", [consumableData]);
        ui.notifications.info(`You crafted ${quantity} ${consumableData.name}(s)!`);

        if (!knownOutcomes[outcomeCategoryKey].some(entry => Number(entry.sum) === finalSum)) {
            const newEntry = { sum: finalSum, itemId: createdItems[0].id };
            knownOutcomes[outcomeCategoryKey] = [...knownOutcomes[outcomeCategoryKey], newEntry];
            await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes", knownOutcomes);
        }
    } catch (error) {
        ui.notifications.error("Failed to create crafted item.");
        app._suppressRender = false;
        return;
    }

    try {
        await consumeReagents(actor, craftingState.selectedReagents);
    } catch (error) {
        ui.notifications.error("Failed to consume reagents.");
        app._suppressRender = false;
        return;
    }

    try {
        const newGold = Math.max(0, currentGold - goldCost);
        const currencyUpdate = { ...actor.system.currency, gp: newGold };
        await actor.update({ "system.currency": currencyUpdate });
        const updatedGold = Number(actor.system.currency?.gp) || 0;
        if (updatedGold !== newGold) {
            ui.notifications.error("Failed to deduct gold cost correctly.");
        }
    } catch (error) {
        ui.notifications.error("Failed to deduct gold cost.");
        app._suppressRender = false;
        return;
    }

    // Re-enable rendering after crafting updates are complete
    app._suppressRender = false;
    console.log("Re-enabled sheet rendering after crafting");

    // Do not reset state or re-render; keep reagents in slots
    ui.notifications.info("Crafting complete! Reagents remain in slots. Use 'Clear Slots' to reset.");
}

/**
 * Determines the rarity of a crafted item based on its IP sum.
 * @param {number} sum - The total IP sum.
 * @returns {string} The rarity tier (common, uncommon, rare, veryRare, legendary).
 */
function getRarity(sum) {
    if (sum <= 12) return "common";
    if (sum <= 21) return "uncommon";
    if (sum <= 27) return "rare";
    if (sum <= 30) return "veryRare";
    return "legendary";
}

/**
 * Consumes reagents from the actor's inventory after crafting.
 * @param {Actor} actor - The actor performing the crafting.
 * @param {Array} reagents - The selected reagents to consume.
 */
async function consumeReagents(actor, reagents) {
    const updates = [];
    const deletions = [];
    for (const reagent of reagents) {
        if (!reagent) continue; // Skip null reagents
        const originalData = foundry.utils.deepClone(reagent); // Preserve original data
        const newQuantity = (originalData.system.quantity || 1) - 1;
        if (newQuantity <= 0) {
            deletions.push(reagent.id);
        } else {
            updates.push({
                _id: reagent.id,
                "system.quantity": newQuantity,
                // Preserve custom flags
                "flags.vikarovs-guide-to-kaeliduran-crafting.ipValues": originalData.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 },
                "flags.vikarovs-guide-to-kaeliduran-crafting.essence": originalData.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None",
                "flags.vikarovs-guide-to-kaeliduran-crafting.isReagent": true
            });
        }
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    if (deletions.length) await actor.deleteEmbeddedDocuments("Item", deletions);
}