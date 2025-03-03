/**
 * Handles reagent-related logic for the crafting system, including IP calculations and crafting outcomes.
 */
export function calculateIPSums(craftingState) {
    /* === IP Summation === */
    const sums = { combat: 0, utility: 0, entropy: 0 };
    craftingState.selectedReagents.forEach(reagent => {
        if (reagent) {
            const ipValues = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
            sums.combat += Number(ipValues.combat) || 0;
            sums.utility += Number(ipValues.utility) || 0;
            sums.entropy += Number(ipValues.entropy) || 0;
        }
    });
    return sums;
}

export function determineOutcome(actor, craftingState) {
    /* === Outcome Determination === */
    const ipSums = calculateIPSums(craftingState);
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
    const categories = [];
    if (ipSums.combat === maxSum) categories.push({ category: "combat", sum: maxSum });
    if (ipSums.utility === maxSum) categories.push({ category: "utility", sum: maxSum });
    if (ipSums.entropy === maxSum) categories.push({ category: "entropy", sum: maxSum });

    if (!actor) return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "Error: Actor data missing" };

    let knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };

    // Ensure all categories exist
    knownOutcomes = {
        Combat: knownOutcomes.Combat || [],
        Utility: knownOutcomes.Utility || [],
        Entropy: knownOutcomes.Entropy || []
    };

    if (categories.length > 1) {
        const tiebreakerOutcomes = categories.map(cat => {
            const categoryKey = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
            const isKnown = knownOutcomes[categoryKey].includes(cat.sum);
            return {
                category: cat.category,
                sum: cat.sum,
                known: isKnown,
                tooltip: isKnown ? `Known ${cat.category} consumable (Sum: ${cat.sum})` : "Unknown Outcome",
                selected: craftingState.selectedOutcome === cat.category
            };
        });
        return { hasTiebreaker: true, tiebreakerOutcomes };
    } else if (categories.length === 0) {
        return { hasTiebreaker: false, outcomeKnown: false, outcomeCategory: null, outcomeTooltip: "No outcome determined (IP sums are all zero)" };
    } else {
        const category = categories[0].category;
        const sum = categories[0].sum;
        const categoryKey = category.charAt(0).toUpperCase() + category.slice(1);
        const isKnown = knownOutcomes[categoryKey].includes(sum);
        return {
            hasTiebreaker: false,
            outcomeKnown: isKnown,
            outcomeCategory: category,
            outcomeTooltip: isKnown ? `Known ${category} consumable (Sum: ${sum})` : "Unknown Outcome"
        };
    }
}

export async function handleCrafting(app, craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html) {
    /* === Crafting Execution === */
    let actor = null;
    if (app instanceof ActorSheet) {
        actor = app.actor;
    } else if (app?.object?.actor) {
        actor = app.object.actor;
    } else {
        // Fallback: Try to find the actor sheet from the current UI context
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
    console.log("Debug: Base cost for rarity", initialRarity, ":", baseCost);
    const reagentCost = craftingState.selectedReagents.reduce((total, r) => {
        const rarity = (r.system.rarity || "common").toLowerCase();
        const cost = { common: 10, uncommon: 50, rare: 600, veryRare: 6000, legendary: 50000 }[rarity];
        console.log("Debug: Reagent", r.name, "rarity:", rarity, "cost:", cost);
        return total + (cost || 0); // Ensure cost is a number
    }, 0);
    console.log("Debug: Total reagent cost:", reagentCost);

    // Calculate the base gold cost, then add a minimum cost (e.g., 10% of baseCost)
    const minimumGoldCost = Math.floor(baseCost * 0.1); // 10% of the base cost as a minimum
    const baseGoldCost = Math.max(0, baseCost - reagentCost);
    const goldCost = Math.max(minimumGoldCost, baseGoldCost);
    const currentGold = Number(actor.system.currency?.gp) || 0;
    console.log("Debug: Minimum gold cost:", minimumGoldCost, "Base gold cost:", baseGoldCost, "Final gold cost:", goldCost);
    console.log("Debug: Current gold before deduction:", currentGold, "Calculated gold cost:", goldCost);

    if (currentGold < goldCost) {
        ui.notifications.error(`Insufficient gold! Need ${goldCost} gp, have ${currentGold} gp.`);
        return;
    }

    const dc = { common: 10, uncommon: 15, rare: 20, veryRare: 25, legendary: 30 }[initialRarity];
    console.log("Debug: CONFIG.DND5E.toolIds:", CONFIG.DND5E.toolIds);
    console.log("Debug: Actor tools:", actor.system.tools);
    console.log("Debug: Actor tool items:", actor.items.filter(i => i.type === "tool" && (i.system.identifier === "alchemist" || i.name.toLowerCase() === "alchemist's supplies")));
    console.log("Debug: Actor spell DC:", actor.system.attributes.spelldc);

    // Validate the tool key
    const toolKey = "alchemist";
    if (!CONFIG.DND5E.toolIds[toolKey]) {
        ui.notifications.error("Alchemist's Supplies tool not found in system configuration!");
        return;
    }

    // Check for the tool item in the actor's inventory
    const toolItem = actor.items.find(i => i.type === "tool" && (i.system.identifier === "alchemist" || i.name.toLowerCase() === "alchemist's supplies"));

    // Build options object with minimal required properties
    const options = {
        dc: dc,
        rollMode: "publicroll",
        fastForward: false,
    };

    // Update tool proficiency to link to the item and set ability
    if (toolItem) {
        const toolProficiency = actor.system.tools?.[toolKey] || { value: 0 };
        const updatedProficiency = {
            value: toolProficiency.value || 0,
            ability: toolItem.system?.ability || CONFIG.DND5E.toolIds[toolKey]?.ability || "int",
            itemId: toolItem.id
        };
        await actor.update({ [`system.tools.${toolKey}`]: updatedProficiency });
    }

    if (!toolItem) {
        ui.notifications.error("Alchemist's Supplies tool item not found in inventory! Crafting requires this tool.");
        return;
    }

    // Trigger the roll and wait for the chat message to populate
    console.log("Debug: Triggering toolItem.rollToolCheck with options:", options);
    await toolItem.rollToolCheck(options);

    // Add a small delay to allow the chat message to populate
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

    // Fetch the most recent chat message with the flavor "Alchemist's Supplies"
    const messages = game.messages.filter(msg => msg.flavor?.includes("Alchemist's Supplies"));
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    let rollTotal = null;
    if (latestMessage && latestMessage.rolls && latestMessage.rolls.length > 0) {
        rollTotal = latestMessage.rolls[0].total;
        console.log("Debug: Roll total from chat message:", rollTotal);
    } else {
        ui.notifications.error("Failed to determine tool check result. No chat message found.");
        console.error("Debug: No chat message found for Alchemist's Supplies roll.");
        return;
    }

    console.log("Debug: Roll total after processing:", rollTotal, "DC:", dc);
    if (rollTotal === null) {
        ui.notifications.error("Failed to determine tool check result. Roll total is null.");
        console.error("Debug: Latest chat message:", latestMessage);
        return;
    }

    console.log("Debug: Proceeding with crafting logic...");
    let finalSum = maxSum;
    let quantity = 1;
    const margin = rollTotal - dc;
    console.log("Debug: Margin (rollTotal - dc):", margin);

    if (margin >= 10) {
        quantity = 2;
        console.log("Debug: Success with large margin (>=10), quantity set to 2");
    } else if (margin >= 0) {
        quantity = 1;
        console.log("Debug: Success with small margin (>=0), quantity set to 1");
    } else if (margin >= -9) {
        const reduction = new Roll("1d4");
        await reduction.roll(); // Evaluates the roll
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure (near miss)" });
        console.log("Debug: Near miss (margin >= -9), reduced IP sum by:", reduction.total);
    } else {
        const reduction = new Roll("2d4");
        await reduction.roll(); // Evaluates the roll
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure (large miss)" });
        console.log("Debug: Large miss (margin < -9), reduced IP sum by:", reduction.total);
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

    const categoryKey = finalCategory.charAt(0).toUpperCase() + finalCategory.slice(1);
    let knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };

    // Ensure all categories exist
    knownOutcomes = {
        Combat: knownOutcomes.Combat || [],
        Utility: knownOutcomes.Utility || [],
        Entropy: knownOutcomes.Entropy || []
    };

    if (!knownOutcomes[categoryKey].includes(finalSum)) {
        knownOutcomes[categoryKey] = [...knownOutcomes[categoryKey], finalSum];
        await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes", knownOutcomes);
    }

    try {
        console.log("Debug: Consuming reagents...");
        await consumeReagents(actor, craftingState.selectedReagents);
        console.log("Debug: Reagents consumed, updated quantities:", craftingState.selectedReagents.map(r => ({ name: r.name, quantity: r.system.quantity })));
    } catch (error) {
        ui.notifications.error("Failed to consume reagents.");
        console.error("Debug: Reagent consumption error:", error);
    }

    try {
        console.log("Debug: Deducting gold cost...");
        const newGold = Math.max(0, currentGold - goldCost);
        const currencyUpdate = { ...actor.system.currency, gp: newGold };
        console.log("Debug: Currency update object:", currencyUpdate);
        await actor.update({ "system.currency": currencyUpdate });
        const updatedGold = Number(actor.system.currency?.gp) || 0;
        console.log("Debug: Gold after deduction (actual):", updatedGold);
        if (updatedGold !== newGold) {
            ui.notifications.error("Failed to deduct gold cost correctly.");
            console.error("Debug: Gold deduction failed. Expected:", newGold, "Actual:", updatedGold);
        }
    } catch (error) {
        ui.notifications.error("Failed to deduct gold cost.");
        console.error("Debug: Gold deduction error:", error);
    }

    try {
        console.log("Debug: Creating crafted item...");
        const finalRarity = getRarity(finalSum);
        const consumableName = `${finalRarity} ${categoryKey} Consumable`;
        const consumableData = {
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
        const createdItems = await actor.createEmbeddedDocuments("Item", [consumableData]);
        console.log("Debug: Created items:", createdItems);
        ui.notifications.info(`You crafted ${quantity} ${consumableName}(s)!`);
    } catch (error) {
        ui.notifications.error("Failed to create crafted item.");
        console.error("Debug: Item creation error:", error);
    }

    try {
        console.log("Debug: Resetting crafting state...");
        craftingState.selectedReagents = [null, null, null];
        craftingState.selectedOutcome = null;

        // Recreate reagentSlotClickHandler if it's not available
        const reagentSlotClickHandler = app.craftingUI?.reagentSlotClickHandler || (async (event, updateCraftingUI) => {
            if (event && typeof event.preventDefault === "function") {
                event.preventDefault();
                event.stopPropagation();
            }
            const slotIndex = event.currentTarget.dataset.slot;
            const actor = game.actors.get(game.user.character?.id);
            if (!actor) {
                ui.notifications.error("No valid actor found.");
                return;
            }

            const app = Object.values(ui.windows).find(w => w.actor === actor && w instanceof ActorSheet);
            if (!app?.craftingState) return;

            new ReagentSelectionDialog(actor, async (selectedItem) => {
                app.craftingState.selectedReagents[slotIndex] = selectedItem;
                if (updateCraftingUI) await updateCraftingUI();
            }, app.craftingState.selectedReagents).render(true);
        });

        await renderCraftingTab(app, html, { actor: app.actor }, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting);
        console.log("Debug: Crafting tab re-rendered.");
    } catch (error) {
        ui.notifications.error("Failed to reset crafting state and re-render tab.");
        console.error("Debug: Crafting state reset error:", error);
    }
}

/* === Helper Functions === */
function getRarity(sum) {
    if (sum <= 12) return "common";
    if (sum <= 21) return "uncommon";
    if (sum <= 27) return "rare";
    if (sum <= 30) return "veryRare";
    return "legendary";
}

async function consumeReagents(actor, reagents) {
    const updates = reagents.map(reagent => ({
        _id: reagent.id,
        "system.quantity": (reagent.system.quantity || 1) - 1
    }));
    await actor.updateEmbeddedDocuments("Item", updates);
}