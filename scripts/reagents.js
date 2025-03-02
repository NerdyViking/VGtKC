// reagents.js
/**
 * Handles reagent-related logic for the crafting system, including IP calculations and crafting outcomes.
 */
export function calculateIPSums(craftingState) {
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
    const ipSums = calculateIPSums(craftingState);
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
    const categories = [];
    if (ipSums.combat === maxSum) categories.push({ category: "combat", sum: maxSum });
    if (ipSums.utility === maxSum) categories.push({ category: "utility", sum: maxSum });
    if (ipSums.entropy === maxSum) categories.push({ category: "entropy", sum: maxSum });

    const knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };

    if (categories.length > 1) {
        const tiebreakerOutcomes = categories.map(cat => {
            const isKnown = knownOutcomes[cat.category.charAt(0).toUpperCase() + cat.category.slice(1)].includes(cat.sum);
            return {
                category: cat.category,
                sum: cat.sum,
                known: isKnown,
                tooltip: isKnown ? `Known ${cat.category} consumable (Sum: ${cat.sum})` : "Unknown Outcome",
                selected: craftingState.selectedOutcome === cat.category
            };
        });
        return { hasTiebreaker: true, tiebreakerOutcomes };
    } else {
        const category = categories[0].category;
        const sum = categories[0].sum;
        const isKnown = knownOutcomes[category.charAt(0).toUpperCase() + category.slice(1)].includes(sum);
        return {
            hasTiebreaker: false,
            outcomeKnown: isKnown,
            outcomeCategory: category,
            outcomeTooltip: isKnown ? `Known ${category} consumable (Sum: ${sum})` : "Unknown Outcome"
        };
    }
}

export async function handleCrafting(actor, craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html) {
    const ipSums = calculateIPSums(craftingState);
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
    const outcomeData = determineOutcome(actor, craftingState);
    let selectedCategory = outcomeData.hasTiebreaker ? craftingState.selectedOutcome : outcomeData.outcomeCategory;

    let dc;
    if (maxSum <= 12) dc = 10;
    else if (maxSum <= 21) dc = 15;
    else if (maxSum <= 27) dc = 20;
    else if (maxSum <= 30) dc = 25;
    else dc = 30;

    const toolProf = actor.items.find(item => item.name.toLowerCase().includes("alchemist's supplies"));
    if (!toolProf) {
        ui.notifications.error("Actor does not have Alchemist's Supplies proficiency.");
        return;
    }

    const roll = await actor.rollToolCheck("alchemist", {
        dc: { value: dc },
        ability: "int"
    });

    if (!roll) return;

    let finalSum = maxSum;
    let quantity = 1;
    const margin = roll.total - dc;

    if (margin >= 10) {
        quantity = 2;
    } else if (margin >= 0) {
        quantity = 1;
    } else if (margin >= -9) {
        const reduction = await new Roll("1d4").evaluate({ async: true });
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure" });
    } else {
        const reduction = await new Roll("2d4").evaluate({ async: true });
        finalSum = Math.max(1, maxSum - reduction.total);
        await reduction.toMessage({ flavor: "Reduction to IP sum due to crafting failure" });
    }

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

        selectedCategory = newCategories[0];
    }

    const knownOutcomes = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
    const categoryKey = selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1);
    const isKnown = knownOutcomes[categoryKey].includes(maxSum);

    if (!isKnown) {
        const updatedOutcomes = [...(knownOutcomes[categoryKey] || []), finalSum];
        await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", `knownCraftingOutcomes.${categoryKey}`, updatedOutcomes);
    }

    const rarity = finalSum <= 12 ? "Common" :
                  finalSum <= 21 ? "Uncommon" :
                  finalSum <= 27 ? "Rare" :
                  finalSum <= 30 ? "Very Rare" : "Legendary";
    const consumableName = `${rarity} ${categoryKey} Consumable`;
    const consumableData = {
        name: consumableName,
        type: "consumable",
        system: {
            description: { value: `A ${rarity.toLowerCase()} ${categoryKey.toLowerCase()} consumable crafted via alchemy.` },
            quantity,
            rarity: rarity.toLowerCase()
        }
    };

    const [consumable] = await actor.createEmbeddedDocuments("Item", [consumableData]);
    ui.notifications.info(`You crafted ${quantity} ${consumableName}(s)!`);

    const reagentUpdates = [];
    craftingState.selectedReagents.forEach(reagent => {
        if (reagent) {
            const currentQuantity = reagent.system.quantity || 1;
            if (currentQuantity > 1) {
                reagentUpdates.push({ _id: reagent.id, "system.quantity": currentQuantity - 1 });
            } else {
                reagentUpdates.push({ _id: reagent.id, "system.quantity": 0 });
            }
        }
    });

    await actor.updateEmbeddedDocuments("Item", reagentUpdates);

    const updatedReagents = await Promise.all(craftingState.selectedReagents.map(async reagent => {
        if (reagent) {
            const updatedReagent = actor.items.get(reagent.id);
            return updatedReagent?.system.quantity > 0 ? updatedReagent : null;
        }
        return null;
    }));

    craftingState.selectedReagents = updatedReagents;
    craftingState.selectedOutcome = null;

    const reagentSlots = html.find('.reagent-slot');
    reagentSlots.each((index, slot) => {
        slot.innerHTML = craftingState.selectedReagents[index] ? `<img src="${craftingState.selectedReagents[index].img}" class="item-icon">` : '+';
    });

    await renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting);
}