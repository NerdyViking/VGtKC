/**
 * Handles rendering and updating the Crafting tab UI.
 */

import { AlchemyCompendium } from "./alchemyCompendium.js"; // Updated to match the new class name
import { ReagentSelectionDialog } from "./reagentSelectionDialog.js";

export async function renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting, updateCraftingUIExternal) {
    const actor = app.actor;
    const $ = foundry.utils.jQuery || window.jQuery;
    const liveHtml = $(app.element);
    const sheetBody = liveHtml.find('.sheet-body');
    const craftingState = app.craftingState;
    craftingState.actor = actor; // Ensure the actor is available in the crafting state
    const templatePath = "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-tab.hbs";

    if (!sheetBody.length) {
        return;
    }

    const mainContent = ensureElement(sheetBody, '.main-content', '<div class="main-content"></div>');
    const targetTabBody = ensureElement(mainContent, '.tab-body', '<section class="tab-body"></section>');
    let craftingTabContent = targetTabBody.find('.tab.crafting');

    if (!craftingTabContent.length) {
        craftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
        targetTabBody.append(craftingTabContent);
    }

    /* === UI Update Logic === */
    const updateCraftingUI = async () => {
        const ipSums = calculateIPSums(craftingState);
        const outcomeData = determineOutcome(actor, craftingState);
        const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
        const canCraft = allSlotsFilled && craftingState.selectedReagents.length === 3 && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

        const liveHtml = $(app.element);
        const sheetBody = liveHtml.find('.sheet-body');
        if (!sheetBody.length) return;

        const mainContent = ensureElement(sheetBody, '.main-content', '<div class="main-content"></div>');
        const targetTabBody = ensureElement(mainContent, '.tab-body', '<section class="tab-body"></section>');
        let craftingTabContent = targetTabBody.find('.tab.crafting');

        // Ensure the crafting tab content exists
        if (!craftingTabContent.length) {
            craftingTabContent = $(`<div class="tab crafting" data-tab="crafting"></div>`);
            targetTabBody.append(craftingTabContent);
        }

        // Always render the crafting tab content to ensure it persists across sheet re-renders
        const templateData = { ...data, ipSums, ...outcomeData, canCraft, selectedReagents: craftingState.selectedReagents };
        const craftingHTML = await renderTemplate(templatePath, templateData);
        craftingTabContent.html(craftingHTML);
        console.log("craftingUI.js | Updated crafting tab content with state:", craftingState);
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
    console.log("craftingUI.js | Initially rendered crafting tab content with state:", craftingState);

    /* === Event Handlers === */
    bindEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);

    /* === Mutation Observer === */
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.removedNodes.length || m.addedNodes.length)) {
            const checkContent = targetTabBody.find('.tab.crafting');
            if (checkContent.length && checkContent.find('.alchemy-crafting').length === 0) {
                const ipSums = calculateIPSums(craftingState);
                const outcomeData = determineOutcome(actor, craftingState);
                const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
                const canCraft = allSlotsFilled && craftingState.selectedReagents.length === 3 && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);
                const templateData = { ...data, ipSums, ...outcomeData, canCraft, selectedReagents: craftingState.selectedReagents };
                renderTemplate(templatePath, templateData).then(craftingHTML => {
                    checkContent.html(craftingHTML);
                    console.log("craftingUI.js | MutationObserver re-injected crafting tab content with state:", craftingState);
                    bindEventHandlers(checkContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI);
                });
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
        const $target = $(event.currentTarget);
        const category = $target.data('category');
        const itemId = $target.data('itemId');
        
        // If the icon is already selected, open the item sheet
        if ($target.hasClass('selected') && itemId) {
            const item = game.items.get(itemId) || craftingState.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            } else {
                ui.notifications.error("Item not found.");
            }
        } else {
            // Otherwise, select the outcome
            craftingState.selectedOutcome = category;
            updateCraftingUI();
        }
    });

    // Add hover event listener for custom tooltip (item name and description only)
    craftingTabContent.find('.tiebreaker-options .outcome-icon').off("mouseenter mouseleave").on("mouseenter", async (event) => {
        const $target = $(event.currentTarget);
        const itemId = $target.data('itemId');
        let tooltipContent = '';

        if (itemId) {
            const item = game.items.get(itemId) || craftingState.actor.items.get(itemId);
            if (item) {
                const name = item.name || "Unknown Item";
                const description = item.system?.description?.value ? item.system.description.value.replace(/<[^>]+>/g, ' ').trim() : "";
                tooltipContent = `
                    <h4>${name}</h4>
                    ${description ? `<div>${description}</div>` : ""}
                `;
            } else {
                tooltipContent = `<h4>Unknown Item</h4>`;
            }
        } else {
            const category = $target.data('category');
            tooltipContent = `<h4>Unknown ${category.charAt(0).toUpperCase() + category.slice(1)} Outcome</h4>`;
        }

        let tooltip = $(".custom-tooltip");
        if (!tooltip.length) {
            tooltip = $('<div class="custom-tooltip"></div>').appendTo(document.body);
        }
        tooltip.empty().html(tooltipContent).css({
            position: 'absolute',
            background: '#1c2526',
            border: '1px solid #4b4a44',
            padding: '5px',
            borderRadius: '3px',
            color: '#f0f0e0',
            zIndex: 10001,
            display: 'block',
            pointerEvents: 'none',
            top: (event.pageY + 5) + 'px',
            left: (event.pageX + 5) + 'px'
        }).appendTo(document.body);

        const contentHeight = tooltip.outerHeight();
        const width = contentHeight * 2;
        tooltip.css('width', width + 'px');
    }).on("mouseleave", () => {
        $(".custom-tooltip").remove();
    });

    // Tooltip for reagent slots
    craftingTabContent.find('.reagent-slot').off("mouseenter mouseleave").on("mouseenter", async (event) => {
        const $target = $(event.currentTarget);
        const slotIndex = $target.data('slot');
        const reagent = craftingState.selectedReagents[slotIndex];

        // Only show tooltip if a reagent is present
        if (!reagent) {
            return; // Exit early if no reagent, no tooltip will be shown
        }

        const name = reagent.name || "Unknown Reagent";
        const description = reagent.system?.description?.value ? reagent.system.description.value.replace(/<[^>]+>/g, ' ').trim() : "";
        const tooltipContent = `<h4>${name}</h4>${description ? `<div>${description}</div>` : ""}`;

        let tooltip = $(".custom-tooltip");
        if (!tooltip.length) tooltip = $('<div class="custom-tooltip"></div>').appendTo(document.body);
        tooltip.empty().html(tooltipContent).css({
            position: 'absolute',
            background: '#1c2526',
            border: '1px solid #4b4a44',
            padding: '5px',
            borderRadius: '3px',
            color: '#f0f0e0',
            zIndex: 10001,
            display: 'block',
            pointerEvents: 'none',
            top: (event.pageY + 5) + 'px',
            left: (event.pageX + 5) + 'px'
        });
        const contentHeight = tooltip.outerHeight();
        tooltip.css('width', (contentHeight * 2) + 'px');
    }).on("mouseleave", () => {
        $(".custom-tooltip").remove();
    });

    craftingTabContent.find('.craft-btn').off("click").on("click", () => handleCrafting());
    craftingTabContent.find('.clear-slots-btn').off("click").on("click", () => {
        craftingState.selectedReagents = [null, null, null];
        craftingState.selectedOutcome = null;
        setTimeout(() => updateCraftingUI(), 0);
    });
    const $openCompendiumBtn = craftingTabContent.find('.open-compendium-btn');
    $openCompendiumBtn.html('<span>Ask Vikarov</span><i class="fas fa-book"></i>');
    $openCompendiumBtn.off("click").on("click", () => {
        if (!craftingState.actor) {
            ui.notifications.error("No valid actor found to open the Crafting Compendium.");
            return;
        }
        new AlchemyCompendium(craftingState.actor).render(true); // Updated to use AlchemyCompendium
    });
}