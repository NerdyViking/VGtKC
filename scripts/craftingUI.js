/**
 * Handles rendering and updating the Crafting tab UI.
 */
export async function renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting, updateCraftingUIExternal) {
    const actor = app.actor;
    const $ = foundry.utils.jQuery || window.jQuery;
    const liveHtml = $(app.element);
    const sheetBody = liveHtml.find('.sheet-body');
    const craftingState = app.craftingState;
    const templatePath = "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-tab.hbs";

    if (!sheetBody.length) return;

    /* === UI Update Logic === */
    const updateCraftingUI = async () => {
        const ipSums = calculateIPSums(craftingState);
        const outcomeData = determineOutcome(actor, craftingState);
        const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
        const canCraft = allSlotsFilled && craftingState.selectedReagents.length === 3 && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

        const liveHtml = $(app.element);
        const sheetBody = liveHtml.find('.sheet-body');
        if (!sheetBody.length) return;

        const templateData = { ...data, ipSums, ...outcomeData, canCraft, selectedReagents: craftingState.selectedReagents };
        const mainContent = ensureElement(sheetBody, '.main-content', '<div class="main-content"></div>');
        const targetTabBody = ensureElement(mainContent, '.tab-body', '<section class="tab-body"></section>');
        const craftingTabContent = ensureElement(targetTabBody, '.tab.crafting', '<div class="tab crafting" data-tab="crafting"></div>');

        const craftingHTML = await renderTemplate(templatePath, templateData);
        craftingTabContent.html(craftingHTML);

        bindEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);
    };

    app.updateCraftingUI = updateCraftingUI;

    /* === Initial Render === */
    const ipSums = calculateIPSums(craftingState);
    const outcomeData = determineOutcome(actor, craftingState);
    const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
    const canCraft = allSlotsFilled && craftingState.selectedReagents.length === 3 && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

    const templateData = { ...data, ipSums, ...outcomeData, canCraft, selectedReagents: craftingState.selectedReagents };
    const mainContent = ensureElement(sheetBody, '.main-content', '<div class="main-content"></div>');
    const targetTabBody = ensureElement(mainContent, '.tab-body', '<section class="tab-body"></section>');
    let craftingTabContent = targetTabBody.find('.tab.crafting');

    if (!craftingTabContent.length) {
        craftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
        targetTabBody.append(craftingTabContent);
    }

    const craftingHTML = await renderTemplate(templatePath, templateData);
    craftingTabContent.html(craftingHTML);

    /* === Event Handlers === */
    bindEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);

    /* === Mutation Observer === */
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.removedNodes.length || m.addedNodes.length)) {
            const checkContent = targetTabBody.find('.tab.crafting');
            if (!checkContent.length || !checkContent.children().length) {
                const newCraftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
                newCraftingTabContent.html(craftingHTML);
                targetTabBody.append(newCraftingTabContent);
                bindEventHandlers(newCraftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);
            }
        }
    });
    observer.observe(targetTabBody[0], { childList: true, subtree: true });

    app.element.on('close', () => observer.disconnect());
}

/* === Helper Functions === */
function ensureElement(parent, selector, html) {
    let element = parent.find(selector);
    if (!element.length) {
        element = $(html);
        parent.append(element);
    }
    return element;
}

function bindEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI) {
    const $ = foundry.utils.jQuery || window.jQuery;
    craftingTabContent.find('.reagent-slot').off("click").on("click", (event) => reagentSlotClickHandler(event, updateCraftingUI));
    craftingTabContent.find('.tiebreaker-options .outcome-icon').off("click").on("click", (event) => {
        craftingState.selectedOutcome = event.currentTarget.dataset.category;
        updateCraftingUI();
    });
    craftingTabContent.find('.craft-btn').off("click").on("click", () => handleCrafting());
    craftingTabContent.find('.clear-slots-btn').off("click").on("click", () => {
        craftingState.selectedReagents = [null, null, null];
        craftingState.selectedOutcome = null;
        setTimeout(() => updateCraftingUI(), 0);
    });
}