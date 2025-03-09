/**
 * General module initialization and shared hooks for Vikarov's Guide to Kaeliduran Crafting.
 */

import { registerReagentSubtype } from "./reagents.js";
import { renderCraftingTab } from "./craftingUI.js";
import { calculateIPSums, determineOutcome } from "./reagents.js";

// Helper function to remove the Magical checkbox
function removeMagicalCheckbox(html) {
    const magicalCheckbox = html.find('.form-fields label.checkbox').filter(function () {
        return $(this).text().trim().includes("Magical");
    });
    if (magicalCheckbox.length) {
        magicalCheckbox.remove();
    }
}

// Hook to patch the item sheet form for reagent items
Hooks.on("renderItemSheet", (app, html, data) => {
    if (app.document.type === "loot") {
        // Patch the subtype dropdown to include 'reagent'
        const $typeSelect = html.find('[name="system.type.value"]');
        if ($typeSelect.length && game.user.isGM) {
            let options = $typeSelect.find("option");
            if (!options.toArray().some(opt => opt.value === "reagent")) {
                $typeSelect.append('<option value="reagent">Reagent</option>');
            }

            // Add change event listener to update subtype and flags
            $typeSelect.off("change").on("change", async function () {
                const selectedValue = this.value;
                const isReagent = selectedValue === "reagent";
                await app.document.update({ "system.type.value": selectedValue });
                await app.document.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", isReagent, { render: false });
                if (isReagent) {
                    removeMagicalCheckbox(html);
                }
                app.render(false); // Re-render to apply changes
            });

            // Set initial value based on flag or system.type.value
            const isReagent = app.document.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || data.item.system?.type?.value === "reagent";
            if (isReagent) {
                $typeSelect.val("reagent");
                removeMagicalCheckbox(html);
            }
        }

        // Modify form for 'reagent' subtype
        if (data.item.system?.type?.value === "reagent" || app.document.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent")) {
            // Target the loot properties group
            const $lootPropertiesGroup = html.find(".form-group.stacked.checkbox-grid");
            if ($lootPropertiesGroup.length) {
                const $lootPropertiesLabel = $lootPropertiesGroup.find("label").first();
                const $lootPropertiesFields = $lootPropertiesGroup.find(".form-fields");
                if ($lootPropertiesLabel.length && $lootPropertiesFields.length) {
                    $lootPropertiesLabel.text("Reagent Properties");

                    // Inject essence dropdown
                    const essenceTypes = ["None", "Primal", "Fey", "Eldritch"];
                    const currentEssence = app.document.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
                    let essenceOptions = essenceTypes.map(type => 
                        `<option value="${type}" ${type === currentEssence ? "selected" : ""}>${type}</option>`
                    ).join("");
                    const essenceHtml = `
                        <label class="checkbox reagent-properties">
                            Essence:
                            <select name="flags.vikarovs-guide-to-kaeliduran-crafting.essence" class="essence-select">
                                ${essenceOptions}
                            </select>
                        </label>
                    `;

                    // Inject IP value inputs
                    const ipValues = app.document.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
                    const ipHtml = `
                        <label class="checkbox reagent-properties">
                            Influence Points:
                            <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat" value="${ipValues.combat}" class="ip-input" min="0" />
                            <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility" value="${ipValues.utility}" class="ip-input" min="0" />
                            <input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy" value="${ipValues.entropy}" class="ip-input" min="0" />
                        </label>
                    `;

                    // Append custom fields
                    $lootPropertiesFields.find(".reagent-properties").remove(); // Clear existing custom fields
                    $lootPropertiesFields.append(essenceHtml, ipHtml);
                }
            } else {
                // Fallback to details tab
                html.find('.tab[data-tab="details"]').prepend(`
                    <div class="form-group stacked.checkbox-grid">
                        <label>Reagent Properties</label>
                        <div class="form-fields">
                            ${essenceHtml}
                            ${ipHtml}
                        </div>
                    </div>
                `);
            }
        }
    }
});

// Hook to append essence and IP values to item names in the actor inventory
Hooks.on("renderActorSheet", (app, html, data) => {
    // Skip render if suppressed (e.g., during crafting)
    if (app._suppressRender) {
        console.log("hooks.js | renderActorSheet skipped: Render suppressed during crafting");
        return;
    }

    let actor = app.actor || data.actor;
    if (!actor || !actor.items) return;

    // Add crafting tab if not present
    const tabs = html.find('.tabs');
    if (tabs.length && !tabs.find('[data-tab="crafting"]').length) {
        tabs.find('.item').last().after('<a class="item" data-tab="crafting"><i class="fas fa-book-open"></i></a>');
    }

    // Initialize crafting state
    app.craftingState = app.craftingState || { selectedReagents: [null, null, null], selectedOutcome: null };

    // Define reagent slot click handler
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

    // Render crafting tab unconditionally
    renderCraftingTab(app, html, data, calculateIPSums, determineOutcome, reagentSlotClickHandler, async () => {
        await handleCrafting(app, app.craftingState, calculateIPSums, determineOutcome, renderCraftingTab, html);
    }, app.updateCraftingUI);

    // Append essence and IP values to inventory items
    let itemElements = html.find('.items-list .item');
    if (itemElements.length === 0) {
        itemElements = html.find('.inventory-list .item');
        if (itemElements.length === 0) {
            itemElements = html.find('.item-list .item');
            if (itemElements.length === 0) {
                itemElements = html.find('[data-item-id]');
                if (itemElements.length === 0) {
                    itemElements = html.find('.item-name');
                    if (itemElements.length === 0) return;
                }
            }
        }
    }

    itemElements.each((index, element) => {
        const $element = $(element);
        const itemId = $element.data('item-id') || $element.closest('[data-item-id]').data('item-id');
        let item;

        if (itemId) {
            item = actor.items.get(itemId);
        } else {
            let displayedName = $element.find('.item-name h4').text().trim() || $element.find('.item-name').text().trim() || $element.text().trim();
            item = actor.items.find(i => i.name.toLowerCase() === displayedName.toLowerCase());
        }

        if (item) {
            const isReagent = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || false;
            if (isReagent) {
                const ipValues = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
                const combatIP = Number(ipValues.combat) || 0;
                const utilityIP = Number(ipValues.utility) || 0;
                const entropyIP = Number(ipValues.entropy) || 0;
                const essence = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
                let prefix = "N"; // Default to N for None
                switch (essence.toLowerCase()) {
                    case "primal":
                        prefix = "P";
                        break;
                    case "fey":
                        prefix = "F";
                        break;
                    case "eldritch":
                        prefix = "E";
                        break;
                    case "none":
                    default:
                        prefix = "N";
                        break;
                }
                const ipString = `(${prefix}: ${combatIP} ${utilityIP} ${entropyIP})`;
                const $nameElement = $element.find('.item-name h4').length ? $element.find('.item-name h4') : $element.find('.item-name');
                if ($nameElement.length) {
                    if (!$nameElement.find('.reagent-ips-span').length) {
                        $nameElement.append(`<span class="reagent-ips-span">${ipString}</span>`);
                    } else {
                        $nameElement.find('.reagent-ips-span').text(ipString);
                    }
                }
            }
        }
    });
});

// Hook to append essence and IP values to item names in the Item Piles merchant sheet
Hooks.on("renderMerchantApp", (app, html, data) => {
    let actor = data.merchant || app.document || app.actor;
    if (!actor) {
        const actorIdMatch = app.options?.id?.match(/item-pile-merchant-([^-]+)/);
        if (actorIdMatch && actorIdMatch[1]) {
            actor = game.actors.get(actorIdMatch[1]);
        }
    }
    if (!actor || !actor.items) return;

    const windowId = app.options.id;
    const windowElement = document.getElementById(windowId);
    if (!windowElement) return;

    let itemElements = $(windowElement).find('.item-piles-item-row .item-piles-clickable');
    if (itemElements.length === 0) {
        itemElements = $(windowElement).find('.item-row .item-name');
        if (itemElements.length === 0) {
            itemElements = $(windowElement).find('.item-piles-item .item-name');
            if (itemElements.length === 0) {
                itemElements = $(windowElement).find('[data-item-id] .item-name');
                if (itemElements.length === 0) {
                    itemElements = $(windowElement).find('.item-piles-item');
                    if (itemElements.length === 0) {
                        itemElements = $(windowElement).find('.item');
                        if (itemElements.length === 0) return;
                    }
                }
            }
        }
    }

    itemElements.each((index, element) => {
        const $element = $(element);
        let displayedName = $element.find('.item-name').text().trim() || $element.text().trim();
        const item = actor.items.find(i => i.name.toLowerCase() === displayedName.toLowerCase());
        if (item) {
            const isReagent = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || false;
            const ipValues = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
            const combatIP = Number(ipValues.combat) || 0;
            const utilityIP = Number(ipValues.utility) || 0;
            const entropyIP = Number(ipValues.entropy) || 0;
            if (isReagent) {
                const essence = item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
                let prefix = "N"; // Default to N for None
                switch (essence.toLowerCase()) {
                    case "primal":
                        prefix = "P";
                        break;
                    case "fey":
                        prefix = "F";
                        break;
                    case "eldritch":
                        prefix = "E";
                        break;
                    case "none":
                    default:
                        prefix = "N";
                        break;
                }
                const ipString = `(${prefix}: ${combatIP} ${utilityIP} ${entropyIP})`;
                if (!$element.find('.reagent-ips-span').length) {
                    $element.append(`<span class="reagent-ips-span">${ipString}</span>`);
                } else {
                    $element.find('.reagent-ips-span').text(ipString);
                }
            }
        }
    });
});

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

Hooks.once("setup", () => {
    registerReagentSubtype();
    Hooks.on("dnd5e.preToolCheckRollConfiguration", (actor, config) => {
        if (config?.data?.tool === "alchemist") {
            config.ability = config.ability || "int";
        }
        return true;
    });
    const style = document.createElement('style');
    style.textContent = `
        .item-piles-merchant-sheet .reagent-ips-span { color: #000000; }
        .reagent-ips-span {
            font-size: 0.9em;
            color: #c9c7b8;
            margin-left: 5px;
            font-weight: normal;
            white-space: nowrap;
        }
        .outcome-wrapper { display: flex; align-items: center; gap: 8px; }
        .outcome-text { color: #ffffff; font-weight: bold; }
        .outcome-item-icon { cursor: pointer; }
        .item-icon {
            width: 100%; /* Fill the slot */
            height: 100%; /* Fill the slot */
            object-fit: contain; /* Maintain aspect ratio */
            cursor: pointer;
            border: 1px solid #4b4a44;
            border-radius: 3px;
        }
        .outcome-cell {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 2px;
        }
        .outcome-icon {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .unknown-icon {
            background-color: #333;
            color: #ccc;
        }
        .known-icon {
            background-color: #555;
            color: #fff;
        }
        /* Alchemy Crafting Styles */
        .alchemy-crafting {
            text-align: center;
            margin-bottom: 20px;
        }
        .reagent-triangle {
            display: grid;
            grid-template-rows: 1fr 1fr 1fr;
            grid-template-columns: 1fr 1fr 1fr;
            position: relative;
            width: 400px; /* 3 slots wide (80px each) */
            height: 400px; /* 3 slots high (80px each) */
            margin: 0 auto;
        }
        .reagent-slot {
            width: 80px;
            height: 80px;
            background: #333;
            border: 1px solid #ccc;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #fff;
        }
        .top-slot {
            grid-row: 1;
            grid-column: 1;
        }
        .tiebreaker-options {
            grid-row: 2;
            grid-column: 2;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 5px;
            
        }
        .tiebreaker-options p {
            margin: 0;
            font-size: 0.9em;
            color: #f0f0e0;
        }
        .bottom-left-slot {
            grid-row: 3;
            grid-column: 1;
        }
        .bottom-right-slot {
            grid-row: 3;
            grid-column: 3;
        }
        .ip-display {
            margin: 10px 0;
        }
    `;
    document.head.appendChild(style);
});

Hooks.on("updateItem", (item, update, options, userId) => {
    if (update?.flags?.["vikarovs-guide-to-kaeliduran-crafting"]?.ipValues || update?.flags?.["vikarovs-guide-to-kaeliduran-crafting"]?.essence) {
        const actor = item.actor;
        if (actor) {
            const actorSheet = Object.values(ui.windows).find(w => w.actor === actor && w instanceof ActorSheet);
            if (actorSheet && !actorSheet._isRendering && !actorSheet._suppressRender) {
                console.log("hooks.js | Rendering actor sheet due to flag update");
                actorSheet.render(false);
            } else {
                console.log("hooks.js | Skipped rendering actor sheet: suppressed or already rendering");
            }
        }
    }
});