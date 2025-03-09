/**
 * Handles rendering and user interaction for the alchemy crafting UI within the crafting tab.
 */

console.log("alchemyCraftingUI.js loaded");

import { ReagentSelectionDialog } from "./reagentSelectionDialog.js";
import { AlchemyCompendium } from "./alchemyCompendium.js";
import { calculateIPSums } from "./reagents.js";
import { determineOutcome, handleCrafting } from "./alchemyCrafting.js";

/**
 * Renders the alchemy crafting UI section.
 * @param {Application} app - The actor sheet application.
 * @param {Object} data - Data passed from the actor sheet.
 * @param {Function} calculateIPSums - Imported from reagents.js.
 * @param {Function} determineOutcome - Imported from alchemyCrafting.js.
 * @param {Function} reagentSlotClickHandler - Handler for reagent slot clicks.
 * @param {Function} handleCrafting - Imported from alchemyCrafting.js.
 * @returns {string} Rendered HTML for the alchemy section.
 */
export async function renderAlchemyCraftingTab(app, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, handleCrafting) {
    const $ = foundry.utils.jQuery || window.jQuery;
    const craftingState = app.craftingState || { selectedReagents: [null, null, null], selectedOutcome: null };
    craftingState.actor = app.actor;
    const templatePath = "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-tab.hbs";

    const ipSums = calculateIPSums(craftingState);
    const outcomeData = determineOutcome(app.actor, craftingState);
    const allSlotsFilled = craftingState.selectedReagents.every(slot => slot !== null);
    const canCraft = allSlotsFilled && craftingState.selectedReagents.length === 3 && (!outcomeData.hasTiebreaker || craftingState.selectedOutcome);

    const templateData = { ...data, ipSums, ...outcomeData, canCraft, selectedReagents: craftingState.selectedReagents };
    return await renderTemplate(templatePath, templateData);
}

/**
 * Binds event handlers for the alchemy crafting UI.
 * @param {jQuery} craftingTabContent - The crafting tab DOM element.
 * @param {Object} craftingState - The current crafting state.
 * @param {Function} reagentSlotClickHandler - Handler for reagent slot clicks.
 * @param {Function} handleCrafting - Imported from alchemyCrafting.js.
 * @param {Function} updateCraftingUI - Callback to update the UI.
 */
export function bindAlchemyEventHandlers(craftingTabContent, craftingState, reagentSlotClickHandler, handleCrafting, updateCraftingUI) {
    console.log("Binding alchemy event handlers");
    const $ = foundry.utils.jQuery || window.jQuery;

    craftingTabContent.find('.reagent-slot').off("click").on("click", (event) => {
        console.log("Reagent slot clicked, current craftingState:", craftingState);
        reagentSlotClickHandler(event, updateCraftingUI);
    });

    craftingTabContent.find('.tiebreaker-options .outcome-icon').off("click").on("click", (event) => {
        const $target = $(event.currentTarget);
        const category = $target.data('category');
        const itemId = $target.data('itemId');

        if ($target.hasClass('selected') && itemId) {
            const item = game.items.get(itemId) || craftingState.actor.items.get(itemId);
            if (item) item.sheet.render(true);
            else ui.notifications.error("Item not found.");
        } else {
            craftingState.selectedOutcome = category;
            updateCraftingUI();
        }
    });

    craftingTabContent.find('.tiebreaker-options .outcome-icon').off("mouseenter mouseleave").on("mouseenter", async (event) => {
        const $target = $(event.currentTarget);
        const itemId = $target.data('itemId');
        let tooltipContent = '';

        if (itemId) {
            const item = game.items.get(itemId) || craftingState.actor.items.get(itemId);
            if (item) {
                const name = item.name || "Unknown Item";
                const description = item.system?.description?.value ? item.system.description.value.replace(/<[^>]+>/g, ' ').trim() : "";
                tooltipContent = `<h4>${name}</h4>${description ? `<div>${description}</div>` : ""}`;
            } else {
                tooltipContent = `<h4>Unknown Item</h4>`;
            }
        } else {
            const category = $target.data('category');
            tooltipContent = `<h4>Unknown ${category.charAt(0).toUpperCase() + category.slice(1)} Outcome</h4>`;
        }

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

    // Fix: Pass required arguments to handleCrafting
    craftingTabContent.find('.craft-btn').off("click").on("click", async () => {
        const app = Object.values(ui.windows).find(w => w.element.find(craftingTabContent).length && w instanceof ActorSheet);
        if (!app) {
            ui.notifications.error("No valid actor sheet found.");
            return;
        }
        await handleCrafting(
            app,
            craftingState,
            calculateIPSums,
            determineOutcome,
            renderAlchemyCraftingTab,
            craftingTabContent
        );
    });

    craftingTabContent.find('.clear-slots-btn').off("click").on("click", () => {
        craftingState.selectedReagents = [null, null, null];
        craftingState.selectedOutcome = null;
        updateCraftingUI('alchemy');
    });

    const $openCompendiumBtn = craftingTabContent.find('.open-compendium-btn');
    $openCompendiumBtn.html('<span>Ask Vikarov</span><i class="fas fa-book"></i>');
    $openCompendiumBtn.off("click").on("click", () => {
        if (!craftingState.actor) {
            ui.notifications.error("No valid actor found to open the Alchemy Compendium.");
            return;
        }
        new AlchemyCompendium(craftingState.actor).render(true);
    });
}

/**
 * Default reagent slot click handler, opens the selection dialog.
 * @param {Event} event - The click event.
 * @param {Function} updateCraftingUI - Callback to update the UI.
 */
export async function defaultReagentSlotClickHandler(event, updateCraftingUI) {
    if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
        event.stopPropagation();
    }
    const slotIndex = event.currentTarget.dataset.slot;
    const $sheet = $(event.currentTarget).closest('.sheet');
    const app = Object.values(ui.windows).find(w => w.element.is($sheet) && w instanceof ActorSheet);
    if (!app) {
        console.error("No ActorSheet found for the clicked element.");
        ui.notifications.error("No valid sheet found. Please ensure you are interacting with a character sheet.");
        return;
    }

    const actor = app.actor;
    if (!actor) {
        console.error("No actor associated with the sheet.");
        ui.notifications.error("No valid actor found. Please ensure the sheet is associated with a character.");
        return;
    }

    if (!app.craftingState) {
        console.error("Crafting state not found for actor:", actor.name);
        return;
    }

    console.log("Opening ReagentSelectionDialog, current craftingState:", app.craftingState); // Debug log
    new ReagentSelectionDialog(actor, async (selectedItem) => {
        console.log("Selected item from dialog:", selectedItem); // Debug log
        app.craftingState.selectedReagents[slotIndex] = selectedItem;
        if (updateCraftingUI) await updateCraftingUI('alchemy');
    }, app.craftingState.selectedReagents).render(true);
}