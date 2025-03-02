// hooks.js
/**
 * Main entry point for Vikarov's Guide to Kaeliduran Crafting.
 * Registers hooks and ties the module together.
 */
console.log("✅ Hooks.js is loading correctly.");

import { getReagents } from "./utils.js";
import { ReagentSelectionDialog } from "./reagentSelectionDialog.js";
import { renderCraftingTab } from "./craftingUI.js";
import { calculateIPSums, determineOutcome, handleCrafting } from "./reagents.js";

// Modify the loot item sheet to add "Reagent" type and custom fields
Hooks.on("renderItemSheet", async (app, html, data) => {
    const item = app.object;
    if (item.type !== "loot") return;

    console.log(`🔧 Modifying Item Sheet for: ${item.name}`);

    const lootTypeSelect = html.find('select[name="system.type.value"]');
    if (!lootTypeSelect.length) {
        console.warn("⚠️ Loot Type dropdown not found.");
        return;
    }

    if (!lootTypeSelect.find('option[value="reagent"]').length) {
        lootTypeSelect.append('<option value="reagent">Reagent</option>');
    }

    lootTypeSelect.on("change", async function () {
        const selectedValue = this.value;
        console.log(`🔄 Loot Type changed to: ${selectedValue}`);

        const isReagent = selectedValue === "reagent";
        await item.update({ "system.type.value": selectedValue });
        await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", isReagent);
        console.log(`✅ ${item.name} is now a reagent: ${isReagent}`);

        if (isReagent) {
            removeMagicalCheckbox();
        }

        app.render(false);
    });

    const isReagent = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || false;
    if (isReagent) {
        lootTypeSelect.val("reagent");
    }

    const lootPropertiesGroup = html.find(".form-group.stacked.checkbox-grid");
    if (!lootPropertiesGroup.length) {
        console.warn("⚠️ Loot Properties Section Not Found. Fields will not be injected.");
        return;
    }

    const lootPropertiesLabel = lootPropertiesGroup.find("label").first();
    const lootPropertiesFields = lootPropertiesGroup.find(".form-fields");

    if (!lootPropertiesLabel.length || !lootPropertiesFields.length) {
        console.warn("⚠️ Loot Properties Label or Fields Not Found. Fields will not be injected.");
        return;
    }

    const removeMagicalCheckbox = () => {
        const magicalCheckbox = lootPropertiesFields.find('label.checkbox').filter(function () {
            return $(this).text().trim().includes("Magical");
        });
        if (magicalCheckbox.length) {
            magicalCheckbox.remove();
            console.log("✅ Removed 'Magical' checkbox from Loot Properties.");
        }
    };

    if (isReagent) {
        removeMagicalCheckbox();
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if ((mutation.addedNodes.length || mutation.removedNodes.length) && isReagent) {
                removeMagicalCheckbox();
            }
        });
    });
    observer.observe(app.element[0], { childList: true, subtree: true });

    app.element.on('close', () => {
        observer.disconnect();
    });

    lootPropertiesFields.find(".reagent-properties").remove();

    if (isReagent) {
        lootPropertiesLabel.text("Reagent Properties");
        console.log("✅ Updated label to 'Reagent Properties'.");
    } else {
        lootPropertiesLabel.text("Loot Properties");
    }

    if (isReagent) {
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
        console.log("✅ Injected Reagent Fields into Loot Properties Section.");

        html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.essence"]').on("change", async function () {
            const newEssence = this.value;
            await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "essence", newEssence);
            console.log(`✅ Essence updated to: ${newEssence}`);
        });

        html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"], [name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"], [name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]').on("change", async function () {
            const combat = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"]').val()) || 0;
            const utility = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"]').val()) || 0;
            const entropy = Number(html.find('[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]').val()) || 0;

            await item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues", { combat, utility, entropy });
            console.log(`✅ IP Values updated to: C:${combat} | U:${utility} | E:${entropy}`);
        });
    }
});

// Initialize module and register "Reagent" as a valid loot type
Hooks.once("init", () => {
    console.log("📌 Initializing Vikarov's Guide to Kaeliduran Crafting...");

    console.log("📌 Registering 'Reagent' as a valid loot type...");
    if (!CONFIG.Item) CONFIG.Item = {};
    if (!CONFIG.Item.type) CONFIG.Item.type = [];
    if (!CONFIG.Item.type.includes("reagent")) {
        CONFIG.Item.type.push("reagent");
        console.log("✅ 'Reagent' added to valid item types:", CONFIG.Item.type);
    } else {
        console.log("🔹 'Reagent' already exists in item types.");
    }
});

Hooks.once("ready", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting | Module is ready");
});

// Add crafting tab to actor sheets
Hooks.on("renderActorSheet", async (app, html, data) => {
    const actor = app.actor;
    if (actor.type !== "character") {
        console.log(`Skipping renderActorSheet hook: Actor type is ${actor.type}, expected 'character'.`);
        return;
    }

    if (!(app instanceof ActorSheet)) {
        console.log("Skipping renderActorSheet hook: App is not an instance of ActorSheet.");
        return;
    }

    console.log("renderActorSheet hook running for app:", app);

    let retries = 0;
    const maxRetries = 10;
    while (retries < maxRetries) {
        if (app._element && app._element.length && html.find('.sheet-body').length && html.find('.tabs').length) {
            break;
        }
        console.log(`Actor sheet DOM not fully rendered, retry ${retries + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (!app._element || !app._element.length || !html.find('.sheet-body').length) {
        console.warn("Actor sheet DOM not fully rendered after max retries, skipping...");
        return;
    }

    console.log("Crafting Tab Hook Fired for:", actor.name);

    const tabs = html.find('.tabs');
    if (!tabs.length) {
        console.warn("⚠️ Tabs not found in actor sheet.");
        return;
    }

    const tabItems = tabs.find('.item');
    if (!tabItems.filter(`[data-tab="crafting"]`).length) {
        console.log("Adding Crafting Tab...");
        tabItems.last().after(`<a class="item" data-tab="crafting"><i class="fas fa-book"></i></a>`);
    } else {
        const craftingContent = html.find('.tab[data-tab="crafting"]');
        if (!craftingContent.length || !craftingContent.html().trim()) {
            console.log("Crafting tab exists but content is missing, re-injecting...");
        } else {
            return;
        }
    }

    const sheetBody = html.find('.sheet-body');
    if (!sheetBody.length) {
        console.warn("⚠️ Sheet body not found in actor sheet.");
        return;
    }

    app.craftingState = {
        selectedReagents: [null, null, null],
        selectedOutcome: null,
    };

    const reagentSlotClickHandler = async (event, updateCraftingUI) => {
        event.preventDefault();
        event.stopPropagation();

        console.log("🔥 Click Event Triggered on Reagent Slot!");

        const slotIndex = event.currentTarget.dataset.slot;
        console.log(`✅ Click detected on Reagent Slot ${slotIndex}`);

        const actor = game.actors.get(game.user.character?.id);
        if (!actor) {
            ui.notifications.error("No valid actor found.");
            return;
        }

        const app = Object.values(ui.windows).find(w => w.actor === actor && w instanceof ActorSheet);
        if (!app || !app.craftingState) {
            console.error("Could not find actor sheet app or crafting state.");
            return;
        }

        const craftingState = app.craftingState;
        new ReagentSelectionDialog(actor, async (selectedItem) => {
            console.log(`Selected Reagent: ${selectedItem.name}`);
            craftingState.selectedReagents[slotIndex] = selectedItem;
            if (updateCraftingUI) {
                await updateCraftingUI();
            } else {
                console.error("updateCraftingUI function not provided.");
            }
        }, craftingState.selectedReagents).render(true);
    };

    await renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, async () => {
        await handleCrafting(actor, app.craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html);
    }, app.updateCraftingUI);

    const tabsItems = html.find('.tabs .item');
    tabsItems.off("click").on("click", function (e) {
        e.preventDefault();
        const tabName = this.dataset.tab;
        console.log(`Switching to tab: ${tabName}`);

        tabsItems.removeClass("active");
        sheetBody.find('.tab').removeClass("active").hide();

        $(this).addClass("active");
        const targetTab = sheetBody.find(`.tab[data-tab="${tabName}"]`);
        if (targetTab.length) {
            targetTab.addClass("active").css('display', 'flex');
            console.log(`Tab ${tabName} set to active and visible. Display: ${targetTab.css('display')}`);
        } else {
            console.warn(`Tab content for ${tabName} not found in DOM.`);
        }
    });

    const activeTab = tabsItems.filter('.active');
    if (activeTab.length) {
        const tabName = activeTab.data('tab');
        console.log(`Initial active tab on render: ${tabName}`);
        const targetTab = sheetBody.find(`.tab[data-tab="${tabName}"]`);
        if (targetTab.length) {
            targetTab.addClass("active").css('display', 'flex');
            console.log(`Initial tab ${tabName} set to active and visible. Display: ${targetTab.css('display')}`);
        }
    } else {
        const firstTab = tabsItems.first();
        if (firstTab.length) {
            const tabName = firstTab.data('tab');
            firstTab.addClass("active");
            const targetTab = sheetBody.find(`.tab[data-tab="${tabName}"]`);
            if (targetTab.length) {
                targetTab.addClass("active").css('display', 'flex');
                console.log(`Defaulted to first tab ${tabName} on initial render.`);
            }
        }
    }
});