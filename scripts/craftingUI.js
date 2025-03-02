// craftingUI.js
/**
 * Handles rendering and updating the Crafting tab UI.
 */
export async function renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting, updateCraftingUIExternal) {
    const actor = app.actor;
    const sheetBody = html.find('.sheet-body');
    const craftingState = app.craftingState;

    const templatePath = "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-tab.hbs";

    const updateCraftingUI = async () => {
        const ipSums = calculateIPSums(craftingState);
        console.log("Calculated IP Sums:", ipSums); // Debug log
        const outcomeData = determineOutcome(actor, craftingState);
        const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
        const canCraft = allSlotsFilled && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

        const templateData = {
            ...data,
            ipSums,
            ...outcomeData,
            canCraft,
            selectedReagents: craftingState.selectedReagents
        };

        const craftingHTML = await renderTemplate(templatePath, templateData);
        const craftingContent = sheetBody.find('.tab[data-tab="crafting"]');
        craftingContent.html(craftingHTML);

        const reagentSlots = craftingContent.find('.reagent-slot');
        reagentSlots.off("click").on("click", (event) => {
            reagentSlotClickHandler(event, updateCraftingUI);
        });

        const tiebreakerIcons = craftingContent.find('.tiebreaker-options .outcome-icon');
        tiebreakerIcons.off("click").on("click", (event) => {
            craftingState.selectedOutcome = event.currentTarget.dataset.category;
            updateCraftingUI();
        });

        const craftBtn = craftingContent.find('.craft-btn');
        craftBtn.off("click").on("click", async () => {
            await handleCrafting();
        });

        const clearBtn = craftingContent.find('.clear-slots-btn');
        clearBtn.off("click").on("click", () => {
            console.log("Clear Slots button clicked.");
            craftingState.selectedReagents = [null, null, null];
            craftingState.selectedOutcome = null;
            setTimeout(() => updateCraftingUI(), 0);
        });
    };

    app.updateCraftingUI = updateCraftingUI;

    const ipSums = calculateIPSums(craftingState);
    console.log("Initial Calculated IP Sums:", ipSums); // Debug log
    const outcomeData = determineOutcome(actor, craftingState);
    const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
    const canCraft = allSlotsFilled && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

    const templateData = {
        ...data,
        ipSums,
        ...outcomeData,
        canCraft,
        selectedReagents: craftingState.selectedReagents
    };

    const craftingHTML = await renderTemplate(templatePath, templateData);
    let craftingContent = sheetBody.find('.tab[data-tab="crafting"]');
    if (!craftingContent.length) {
        console.log("🛠️ Crafting Tab Not Found, Creating One...");
        craftingContent = $('<div class="tab crafting-tab" data-tab="crafting" style="display: none;"></div>');
        sheetBody.append(craftingContent);
    } else {
        console.log("✅ Crafting Tab Found!");
    }

    craftingContent.html(craftingHTML);
    console.log("✅ Crafting Tab Content Injected");

    const reagentSlots = craftingContent.find('.reagent-slot');
    console.log(`🔍 Found ${reagentSlots.length} reagent slots`);
    reagentSlots.off("click").on("click", (event) => {
        reagentSlotClickHandler(event, updateCraftingUI);
    });

    const tiebreakerIcons = craftingContent.find('.tiebreaker-options .outcome-icon');
    tiebreakerIcons.off("click").on("click", (event) => {
        craftingState.selectedOutcome = event.currentTarget.dataset.category;
        updateCraftingUI();
    });

    const craftBtn = craftingContent.find('.craft-btn');
    craftBtn.off("click").on("click", async () => {
        await handleCrafting();
    });

    const clearBtn = craftingContent.find('.clear-slots-btn');
    clearBtn.off("click").on("click", () => {
        console.log("Clear Slots button clicked.");
        craftingState.selectedReagents = [null, null, null];
        craftingState.selectedOutcome = null;
        setTimeout(() => updateCraftingUI(), 0);
    });
}