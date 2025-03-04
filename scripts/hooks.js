/**
 * Main entry point for Vikarov's Guide to Kaeliduran Crafting.
 * Registers hooks and ties the module together.
 */
import { getReagents } from "./utils.js";
import { ReagentSelectionDialog } from "./reagentSelectionDialog.js";
import { CraftingCompendium } from "./craftingCompendium.js";
import { renderCraftingTab } from "./craftingUI.js";
import { calculateIPSums, determineOutcome, handleCrafting } from "./reagents.js";

const $ = foundry.utils.jQuery || window.jQuery;

/* === Tab Registration === */
Hooks.on("dnd5e.getActorSheetData", (data, sheet) => {
    if (sheet.actor.type !== "character") return;
    data.tabs = data.tabs || [];
    data.tabs.push({
        tab: "crafting",
        label: "Crafting",
        icon: '<i class="fas fa-book-open"></i>',
        active: sheet._activeTab === "crafting"
    });
});

/* === Module Initialization === */
Hooks.once("init", () => {
    if (!CONFIG.Item) CONFIG.Item = {};
    if (!CONFIG.Item.type) CONFIG.Item.type = [];
    if (!CONFIG.Item.type.includes("reagent")) CONFIG.Item.type.push("reagent");

    // Add V2 preRollToolCheck hook to debug the roll configuration
    Hooks.on("dnd5e.preToolCheckRollConfiguration", (actor, config) => {
        console.log("Debug: dnd5e.preToolCheckRollConfiguration - Actor:", actor);
        console.log("Debug: dnd5e.preToolCheckRollConfiguration - Config:", config);
        console.log("Debug: dnd5e.preToolCheckRollConfiguration - Actor traits:", actor.system.traits);
        console.log("Debug: dnd5e.preToolCheckRollConfiguration - Actor abilities:", actor.system.abilities);
        if (config?.data?.tool === "alchemist") {
            config.ability = config.ability || "int";
        }
        return true; // Allow the roll to proceed
    });
});

/* === Actor Sheet Rendering === */
Hooks.on("renderActorSheet", async (app, html, data) => {
    const actor = app.actor;
    if (actor.type !== "character" || !(app instanceof ActorSheet) || app._isRendering) return;
    app._isRendering = true;

    console.log("Debug: renderActorSheet - Starting render for actor:", actor.name);

    const liveHtml = $(app.element);
    const sheetBody = liveHtml.find('.sheet-body');
    const tabs = liveHtml.find('.tabs');
    if (!sheetBody.length || !tabs.length) {
        console.log("Debug: renderActorSheet - Missing sheetBody or tabs, aborting render.");
        app._isRendering = false;
        return;
    }

    // Check the active tab
    const activeTab = app._tabs[0]?.active || "description";
    console.log("Debug: renderActorSheet - Active tab on render:", activeTab);

    if (!tabs.find('[data-tab="crafting"]').length) {
        tabs.find('.item').last().after('<a class="item" data-tab="crafting"><i class="fas fa-book-open"></i></a>');
        console.log("Debug: renderActorSheet - Added crafting tab link to tabs.");
    }

    app.craftingState = app.craftingState || { selectedReagents: [null, null, null], selectedOutcome: null };
    console.log("Debug: renderActorSheet - Crafting state initialized:", app.craftingState);

    const reagentSlotClickHandler = async (event, updateCraftingUI) => {
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
    };

    console.log("Debug: renderActorSheet - Rendering crafting tab...");
    await renderCraftingTab(app, liveHtml, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, async () => {
        await handleCrafting(app, app.craftingState, calculateIPSums, determineOutcome, renderCraftingTab, liveHtml);
    }, app.updateCraftingUI);
    console.log("Debug: renderActorSheet - Crafting tab rendering complete.");

    // Verify the crafting tab content is in the DOM
    const targetTabBody = liveHtml.find('.sheet-body .main-content .tab-body');
    const craftingTabContent = targetTabBody.find('.tab.crafting');
    if (craftingTabContent.length) {
        console.log("Debug: renderActorSheet - Crafting tab content is present in the DOM.");
    } else {
        console.log("Debug: renderActorSheet - Crafting tab content is NOT present in the DOM!");
    }

    // Set up a MutationObserver to watch for tab changes
    const tabsElement = tabs[0];
    if (!app._tabObserver) {
        console.log("Debug: renderActorSheet - Setting up MutationObserver for tab changes.");
        app._tabObserver = new MutationObserver(() => {
            const currentActiveTab = app._tabs[0]?.active || "description";
            console.log("Debug: MutationObserver - Tab change detected. Current active tab:", currentActiveTab);
        });

        app._tabObserver.observe(tabsElement, {
            attributes: true,
            attributeFilter: ["class"],
            subtree: true
        });
        console.log("Debug: renderActorSheet - MutationObserver attached to tabs element.");
    }

    // Clear crafting state when the sheet closes
    if (!app._closeHandlerSet) {
        app.element.on('close', () => {
            console.log("Debug: renderActorSheet - Sheet closing, clearing crafting state...");
            app.craftingState = null;
            if (app._tabObserver) {
                app._tabObserver.disconnect();
                app._tabObserver = null;
                console.log("Debug: renderActorSheet - MutationObserver disconnected on sheet close.");
            }
        });
        app._closeHandlerSet = true;
        console.log("Debug: renderActorSheet - Close handler set.");
    }

    app._isRendering = false;
    console.log("Debug: renderActorSheet - Render complete.");
});

/* === Item Sheet Modification === */
Hooks.on("renderItemSheet", async (app, html, data) => {
    const item = app.object;
    if (item.type !== "loot") return;

    app._renderCount = (app._renderCount || 0) + 1;

    const lootTypeSelect = html.find('select[name="system.type.value"]');
    if (!lootTypeSelect.length) return;

    if (!lootTypeSelect.find('option[value="reagent"]').length) {
        lootTypeSelect.append('<option value="reagent">Reagent</option>');
    }

    lootTypeSelect.on("change", async function () {
        const selectedValue = this.value;
        const isReagent = selectedValue === "reagent";
        await item.update({ "system.type.value": selectedValue });
        await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", isReagent, { render: false });
        if (isReagent) removeMagicalCheckbox(html);
        app.render(false);
    });

    const isReagent = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || false;
    if (isReagent) lootTypeSelect.val("reagent");

    const lootPropertiesGroup = html.find(".form-group.stacked.checkbox-grid");
    if (!lootPropertiesGroup.length) return;

    const lootPropertiesLabel = lootPropertiesGroup.find("label").first();
    const lootPropertiesFields = lootPropertiesGroup.find(".form-fields");
    if (!lootPropertiesLabel.length || !lootPropertiesFields.length) return;

    if (isReagent) {
        lootPropertiesLabel.text("Reagent Properties");
        removeMagicalCheckbox(html);
    } else {
        lootPropertiesLabel.text("Loot Properties");
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (isReagent && mutations.some(m => m.addedNodes.length || m.removedNodes.length)) {
                removeMagicalCheckbox(html);
            }
        });
    });
    observer.observe(app.element[0], { childList: true, subtree: true });

    app.element.on('close', () => {
        observer.disconnect();
        app._renderCount = 0;
        const actorSheet = Object.values(ui.windows).find(w => w.actor === item.actor && w instanceof ActorSheet);
        if (actorSheet) {
            actorSheet.element.removeClass('editing-item-sheet');
            if (actorSheet.render && !actorSheet._isRendering) actorSheet.render(true);
        }
    });

    if (isReagent) {
        lootPropertiesFields.find(".reagent-properties").remove();
        const essence = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
        const ipValues = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
        const combatIP = Number(ipValues.combat) || 0;
        const utilityIP = Number(ipValues.utility) || 0;
        const entropyIP = Number(ipValues.entropy) || 0;

        const customHTML = `
            <label class="checkbox reagent-properties">
                Essence:
                <select name="flags.vikarovs-guide-to-kaeliduran-crafting.essence" class="essence-select">
                    <option value="None" ${essence === "None" ? "selected" : ""}>None</option>
                    <option value="Primal" ${essence === "Primal" ? "selected" : ""}>Primal</option>
                    <option value="Fey" ${essence === "Fey" ? "selected" : ""}>Fey</option>
                    <option value="Eldritch" ${essence === "Eldritch" ? "selected" : ""}>Eldritch</option>
                </select>
            </label>
            <label class="checkbox reagent-properties">
                Combat: <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat" value="${combatIP}" class="ip-input" />
                Utility: <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility" value="${utilityIP}" class="ip-input" />
                Entropy: <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy" value="${entropyIP}" class="ip-input" />
            </label>
        `;
        lootPropertiesFields.append(customHTML);

        const actorSheet = Object.values(ui.windows).find(w => w.actor === item.actor && w instanceof ActorSheet);
        const updateEssence = async (newEssence) => {
            await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "essence", newEssence, { render: false });
            html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.essence"]').val(newEssence);
            if (actorSheet && actorSheet.craftingState && actorSheet.craftingState.selectedReagents.some(r => r && r.id === item.id) && actorSheet.updateCraftingUI && !actorSheet._isUpdatingCraftingUI) {
                actorSheet._isUpdatingCraftingUI = true;
                try {
                    await actorSheet.updateCraftingUI();
                } finally {
                    actorSheet._isUpdatingCraftingUI = false;
                }
            }
        };

        const updateIPValues = async (combat, utility, entropy) => {
            await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues", { combat, utility, entropy }, { render: false });
            html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"]').val(combat);
            html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"]').val(utility);
            html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]').val(entropy);
            if (actorSheet && actorSheet.craftingState && actorSheet.craftingState.selectedReagents.some(r => r && r.id === item.id) && actorSheet.updateCraftingUI && !actorSheet._isUpdatingCraftingUI) {
                actorSheet._isUpdatingCraftingUI = true;
                try {
                    await actorSheet.updateCraftingUI();
                } finally {
                    actorSheet._isUpdatingCraftingUI = false;
                }
            }
        };

        html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.essence"]').off("change").on("change", function () {
            updateEssence(this.value);
        });

        html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"], [name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"], [name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]').off("change").on("change", async function () {
            const combat = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"]').val()) || 0;
            const utility = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"]').val()) || 0;
            const entropy = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]').val()) || 0;
            updateIPValues(combat, utility, entropy);
        });
    }
});

/* === Helper Functions === */
function ensureElement(parent, selector, html) {
    let element = parent.find(selector);
    if (!element.length) {
        element = $(html);
        parent.append(element);
    }
    return element;
}

function removeMagicalCheckbox(html) {
    const magicalCheckbox = html.find('.form-fields label.checkbox').filter(function () {
        return $(this).text().trim().includes("Magical");
    });
    if (magicalCheckbox.length) magicalCheckbox.remove();
}