/**
 * Alchemy-specific hooks for rendering sheets and modifying UI elements.
 */

console.log("alchemyHooks.js loaded");

import { renderCraftingTab } from "./craftingUI.js";
import { calculateIPSums } from "./reagents.js";
import { determineOutcome, handleCrafting } from "./alchemyCrafting.js";
import { defaultReagentSlotClickHandler } from "./alchemyCraftingUI.js";
import { getReagents } from "./utils.js";

const $ = foundry.utils.jQuery || window.jQuery;

// Hook to preserve custom flags during item updates and handle form submissions
Hooks.on("preUpdateItem", (item, updateData, options, userId) => {
    console.log("preUpdateItem hook triggered for item:", item.name, "with updateData:", updateData, "options:", options);

    // Handle reagent items
    if (item.type === "loot" && (item.system?.type?.value === "reagent" || item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent"))) {
        const formData = foundry.utils.expandObject(updateData);
        const isReagent = formData["system"]?.type?.value === "reagent" || item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent");

        if (isReagent) {
            updateData.system = updateData.system || {};
            updateData.system.type = updateData.system.type || {};
            updateData.system.type.value = "reagent";

            // Use formData if present (e.g., updating IP values via item sheet)
            const ipValues = formData.flags?.["vikarovs-guide-to-kaeliduran-crafting"]?.ipValues
                ? {
                    combat: Number(formData.flags["vikarovs-guide-to-kaeliduran-crafting"].ipValues.combat) || 0,
                    utility: Number(formData.flags["vikarovs-guide-to-kaeliduran-crafting"].ipValues.utility) || 0,
                    entropy: Number(formData.flags["vikarovs-guide-to-kaeliduran-crafting"].ipValues.entropy) || 0
                }
                : item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };

            const essence = formData.flags?.["vikarovs-guide-to-kaeliduran-crafting"]?.essence
                ? formData.flags["vikarovs-guide-to-kaeliduran-crafting"].essence
                : item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";

            console.log("Current flags from item:", { ipValues, essence });

            updateData.flags = updateData.flags || {};
            updateData.flags["vikarovs-guide-to-kaeliduran-crafting"] = updateData.flags["vikarovs-guide-to-kaeliduran-crafting"] || {};
            updateData.flags["vikarovs-guide-to-kaeliduran-crafting"].ipValues = ipValues;
            updateData.flags["vikarovs-guide-to-kaeliduran-crafting"].essence = essence;
            updateData.flags["vikarovs-guide-to-kaeliduran-crafting"].isReagent = true;

            console.log("Merged flags for item:", item.name, "new updateData:", updateData);
        }
    }
});

Hooks.on("renderActorSheet", async (app, html, data) => {
    console.log("alchemyHooks.js | renderActorSheet hook triggered for", app.actor.name, "with craftingState:", app.craftingState);
    if (app.actor.type !== "character" || !(app instanceof ActorSheet) || app._isRendering) {
        console.log("alchemyHooks.js | renderActorSheet skipped: Not a character, not an ActorSheet, or already rendering");
        return;
    }

    // Skip render if suppressed (e.g., during crafting)
    if (app._suppressRender) {
        console.log("alchemyHooks.js | renderActorSheet skipped: Render suppressed during crafting");
        return;
    }

    app._isRendering = true;

    const liveHtml = $(app.element);
    const sheetBody = liveHtml.find('.sheet-body');
    const tabs = liveHtml.find('.tabs');
    if (!sheetBody.length || !tabs.length) {
        console.log("alchemyHooks.js | renderActorSheet failed: sheet-body or tabs not found");
        app._isRendering = false;
        return;
    }

    // Only add crafting tab button if not present
    if (!tabs.find('[data-tab="crafting"]').length) {
        console.log("alchemyHooks.js | Adding crafting tab button");
        tabs.find('.item').last().after('<a class="item" data-tab="crafting"><i class="fas fa-book-open"></i></a>');
    }

    // Preserve existing crafting state unless sheet is closing
    if (!app.craftingState) {
        app.craftingState = { selectedReagents: [null, null, null], selectedOutcome: null, actor: app.actor };
    } else {
        // Update actor reference and retain existing reagents/outcome
        app.craftingState.actor = app.actor;
    }

    if (!app.updateCraftingUI) {
        app.updateCraftingUI = async () => {
            console.log("alchemyHooks.js | updateCraftingUI called with craftingState:", app.craftingState);
            const { calculateIPSums } = await import("./reagents.js");
            const { determineOutcome } = await import("./alchemyCrafting.js");
            const templateData = { ...data, actor: app.actor };
            const craftingTabContent = liveHtml.find('.tab.crafting');
            const alchemyHtml = await (await import("./alchemyCraftingUI.js")).renderAlchemyCraftingTab(app, templateData, calculateIPSums, determineOutcome, app.reagentSlotClickHandler, handleCrafting);
            craftingTabContent.html(alchemyHtml + await (await import("./magicCraftingUI.js")).renderMagicCraftingTab(app, templateData));
            (await import("./alchemyCraftingUI.js")).bindAlchemyEventHandlers(craftingTabContent, app.craftingState, app.reagentSlotClickHandler, handleCrafting, app.updateCraftingUI);
            (await import("./magicCraftingUI.js")).bindMagicEventHandlers(craftingTabContent, app.magicCraftingState || {});
        };
    }

    console.log("alchemyHooks.js | Calling renderCraftingTab");
    await renderCraftingTab(app, liveHtml, data, calculateIPSums, determineOutcome, defaultReagentSlotClickHandler, async () => {
        await handleCrafting(app, app.craftingState, calculateIPSums, determineOutcome, renderCraftingTab, liveHtml);
    }, app.updateCraftingUI);

    const tabsElement = tabs[0];
    if (!app._tabObserver) {
        app._tabObserver = new MutationObserver(() => {});
        app._tabObserver.observe(tabsElement, { attributes: true, attributeFilter: ["class"], subtree: true });
    }

    if (!app._closeHandlerSet) {
        app.element.on('close', () => {
            console.log("Sheet closing, resetting craftingState:", app.craftingState);
            app.craftingState = null; // Reset state only on close
            if (app._tabObserver) {
                app._tabObserver.disconnect();
                app._tabObserver = null;
            }
        });
        app._closeHandlerSet = true;
    }

    app._isRendering = false;
});