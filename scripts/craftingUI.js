/**
 * Handles rendering and updating the Crafting tab UI.
 */
import { CraftingCompendium } from "./craftingCompendium.js";

export async function renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting, updateCraftingUIExternal) {
    const actor = app.actor;
    const $ = foundry.utils.jQuery || window.jQuery;
    const liveHtml = $(app.element);
    const sheetBody = liveHtml.find('.sheet-body');
    const craftingState = app.craftingState;
    craftingState.actor = actor; // Ensure the actor is available in the crafting state
    const templatePath = "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-tab.hbs";

    if (!sheetBody.length) return;

    const mainContent = ensureElement(sheetBody, '.main-content', '<div class="main-content"></div>');
    const targetTabBody = ensureElement(mainContent, '.tab-body', '<section class="tab-body"></section>');
    let craftingTabContent = targetTabBody.find('.tab.crafting');

    if (!craftingTabContent.length) {
        craftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
        targetTabBody.append(craftingTabContent);
    }

    // Ensure the active class is set on initial render if the crafting tab is active
    const isCraftingTabActive = app._tabs[0]?.active === "crafting";
    if (isCraftingTabActive) {
        craftingTabContent.addClass('active');
    }
    console.log("Debug: renderCraftingTab - Is crafting tab active on initial render?", isCraftingTabActive);
    console.log("Debug: renderCraftingTab - Crafting tab classes on initial render:", craftingTabContent.attr('class'));

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
        let craftingTabContent = targetTabBody.find('.tab.crafting');

        // Ensure the crafting tab content exists
        if (!craftingTabContent.length) {
            craftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
            targetTabBody.append(craftingTabContent);
        }

        // Preserve the active class if the crafting tab is currently active
        const isCraftingTabActive = app._tabs[0]?.active === "crafting";
        if (isCraftingTabActive) {
            craftingTabContent.addClass('active');
        }
        console.log("Debug: updateCraftingUI - Is crafting tab active?", isCraftingTabActive);
        console.log("Debug: updateCraftingUI - Crafting tab classes after update:", craftingTabContent.attr('class'));

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
    const craftingHTML = await renderTemplate(templatePath, templateData);
    craftingTabContent.html(craftingHTML);

    /* === Event Handlers === */
    bindEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);

    /* === Mutation Observer === */
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.removedNodes.length || m.addedNodes.length)) {
            const checkContent = targetTabBody.find('.tab.crafting');
            if (!checkContent.length || !checkContent.children().length) {
                const newCraftingTabContent = $(`<div class="tab crafting" data-tab="crafting"><div class="loading-spinner">Loading Crafting UI...</div></div>`);
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
    const $openCompendiumBtn = craftingTabContent.find('.open-compendium-btn');
    $openCompendiumBtn.html('<span>Ask Vikarov</span><i class="fas fa-book"></i>'); // Add text and keep icon
    $openCompendiumBtn.off("click").on("click", () => {
        if (!craftingState.actor) {
            ui.notifications.error("No valid actor found to open the Crafting Compendium.");
            return;
        }
        new CraftingCompendium(craftingState.actor).render(true);
    });
}