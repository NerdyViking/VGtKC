/**
 * Dialog for selecting reagents from an actor's inventory, styled as an ItemSheet.
 */

console.log("reagentSelectionDialog.js loaded");

import { getReagents } from "./utils.js";

export class ReagentSelectionDialog extends ItemSheet {
    constructor(actor, callback, preselectedReagents = [], options = {}) {
        const dummyItemData = { name: "Reagent Selection", type: "consumable", ownership: { default: 2 } };
        const dummyItem = new Item(dummyItemData, { parent: actor });
        super(dummyItem, { actor, ...options });
        this._actor = actor;
        this.callback = callback;
        this.preselectedReagents = preselectedReagents || [];
        this._isSheetClosing = false; // Track sheet closure
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "reagent-selection-dialog",
            title: "Select a Reagent",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/reagent-selection.hbs",
            width: 500,
            height: 400,
            resizable: true,
            classes: ["dnd5e2", "sheet", "item", "reagent-selection", "unique-reagent-dialog"]
        });
    }

    async getData() {
        if (!this._actor) {
            console.error("ReagentSelectionDialog: No actor provided.");
            return { reagents: [], hasReagents: false };
        }
        const reagents = getReagents(this._actor) || [];
        // Filter out items already slotted in preselectedReagents
        const slottedIds = this.preselectedReagents
            .filter(r => r !== null && r.id)
            .map(r => r.id);
        const reagentData = reagents
            .filter(item => !slottedIds.includes(item.id))
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img,
                quantity: item.system.quantity || 1,
                isSelected: this.preselectedReagents.some(r => r && r.id === item.id),
                ipValues: item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 },
                essence: item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None"
            }));
        console.log("ReagentSelectionDialog getData:", { reagents: reagentData, hasReagents: reagentData.length > 0 });
        return {
            reagents: reagentData,
            hasReagents: reagentData.length > 0
        };
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        return buttons.map(button => {
            if (button.class === "close") {
                return {
                    ...button,
                    label: "",
                    icon: "fas fa-times",
                    onclick: (event) => {
                        this._isSheetClosing = true; // Mark as closing
                        this.close();
                    }
                };
            }
            return {
                ...button,
                label: ""
            };
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        const $ = foundry.utils.jQuery || window.jQuery;

        html.find('.reagent-entry').on("click", (event) => {
            const itemId = $(event.currentTarget).data('item-id');
            const item = this._actor.items.get(itemId);
            if (item) {
                console.log("Selected reagent:", item);
                this.callback(item);
                this.close();
            } else {
                console.error("ReagentSelectionDialog: Item not found for id:", itemId);
            }
        });

        html.find('.reagent-search').on("input", (event) => {
            const query = $(event.currentTarget).val().toLowerCase();
            const $entries = html.find('.reagent-entry');
            $entries.each((index, element) => {
                const $element = $(element);
                const name = $element.data('item-name').toLowerCase();
                $element.toggle(name.includes(query));
            });
            const visibleEntries = $entries.filter(':visible');
            if (visibleEntries.length === 0) {
                html.find('.reagent-list').append('<p class="no-reagents">No reagents match your search.</p>');
            } else {
                html.find('.no-reagents').remove();
            }
        });

        html.find('.sort-select').on("change", (event) => {
            const sortBy = $(event.currentTarget).val();
            const $entries = html.find('.reagent-entry');
            const entriesData = $entries.map((index, element) => ({
                $element: $(element),
                name: $(element).data('item-name'),
                quantity: parseInt($(element).find('.reagent-details').text().match(/Qty: (\d+)/)?.[1]) || 0
            })).get();

            if (sortBy === "name") {
                entriesData.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sortBy === "quantity") {
                entriesData.sort((a, b) => b.quantity - a.quantity);
            }

            $entries.detach().sort((a, b) => {
                const aIndex = entriesData.findIndex(e => e.$element.is(a));
                const bIndex = entriesData.findIndex(e => e.$element.is(b));
                return aIndex - bIndex;
            }).appendTo(html.find('.reagent-list'));
        });
    }

    async _onClose(...args) {
        console.log("ReagentSelectionDialog closing, isSheetClosing:", this._isSheetClosing);
        if (!this._isSheetClosing) {
            // Only clean up if closed manually, not by sheet closure
            this.callback(null); // Signal no selection if closed without choosing
        }
        return super._onClose(...args);
    }

    async _updateObject(event, formData) {
        // Override to prevent button requirement error; no form submission needed
        return;
    }
}