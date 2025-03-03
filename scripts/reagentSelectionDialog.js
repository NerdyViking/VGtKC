/**
 * Handles the reagent selection dialog for the crafting system.
 */
import { getReagents } from "./utils.js";

export class ReagentSelectionDialog extends Application {
    constructor(actor, callback, selectedReagents = []) {
        super();
        this.actor = actor;
        this.callback = callback;
        this.selectedReagents = selectedReagents;
        this.reagents = getReagents(actor);
        this.filteredReagents = [...this.reagents];
        this.searchQuery = "";
        this.sortCriterion = "name-asc";
        this.debounceTimeout = null;
        this.wasSearchFocused = false;
        this.filterReagents();
    }

    /* === Configuration === */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "reagent-selection-dialog",
            title: "Select a Reagent",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/reagent-selection.hbs",
            width: 500,
            height: 500,
            classes: ["reagent-selection-dialog", "dnd5e2", "sheet", "item"],
            resizable: false
        });
    }

    _getHeaderButtons() {
        return super._getHeaderButtons().map(button => {
            if (button.class === "close") button.label = "";
            return button;
        });
    }

    /* === Data Preparation === */
    getData() {
        const filteredReagents = this.filteredReagents.map(reagent => {
            const essence = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
            const ipValues = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
            const embeddedItem = this.actor.items.get(reagent.id);
            return {
                ...reagent,
                _id: embeddedItem ? embeddedItem.id : reagent.id,
                essence,
                combat: Number(ipValues.combat) || 0,
                utility: Number(ipValues.utility) || 0,
                entropy: Number(ipValues.entropy) || 0
            };
        });

        filteredReagents.sort((a, b) => {
            const [key, direction] = this.sortCriterion.split('-');
            let comparison = 0;
            if (key === "name") comparison = a.name.localeCompare(b.name);
            else if (key === "essence") comparison = a.essence.localeCompare(b.essence);
            else if (key === "combat") comparison = a.combat - b.combat;
            else if (key === "utility") comparison = a.utility - b.utility;
            else if (key === "entropy") comparison = a.entropy - b.entropy;
            return direction === "asc" ? comparison : -comparison;
        });

        return { filteredReagents, searchQuery: this.searchQuery, sortCriterion: this.sortCriterion };
    }

    /* === Filtering Logic === */
    filterReagents() {
        let filtered = [...this.reagents];
        const selectedNames = this.selectedReagents.filter(r => r !== null).map(r => r.name.toLowerCase());
        filtered = filtered.filter(r => !selectedNames.includes(r.name.toLowerCase()));
        if (this.searchQuery) {
            filtered = filtered.filter(r => {
                const name = r.name.toLowerCase();
                const essence = (r.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None").toLowerCase();
                return name.includes(this.searchQuery) || essence.includes(this.searchQuery);
            });
        }
        this.filteredReagents = filtered;
        this.sortReagents();
    }

    /* === Sorting Logic === */
    sortReagents() {
        this.filteredReagents.sort((a, b) => {
            const [key, direction] = this.sortCriterion.split('-');
            let comparison = 0;
            if (key === "name") comparison = a.name.localeCompare(b.name);
            else if (key === "essence") comparison = (a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None").localeCompare(b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None");
            else {
                const aIP = a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
                const bIP = b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
                if (key === "combat") comparison = (Number(aIP.combat) || 0) - (Number(bIP.combat) || 0);
                else if (key === "utility") comparison = (Number(aIP.utility) || 0) - (Number(bIP.utility) || 0);
                else if (key === "entropy") comparison = (Number(aIP.entropy) || 0) - (Number(bIP.entropy) || 0);
            }
            return direction === "asc" ? comparison : -comparison;
        });
    }

    /* === Event Listeners === */
    activateListeners(html) {
        super.activateListeners(html);

        html.find(".reagent-entry").on("click", async (event) => {
            const itemId = event.currentTarget.dataset.itemId;
            const selectedItem = this.actor.items.get(itemId);
            if (selectedItem) {
                await super.close();
                await this.callback(selectedItem);
            }
        });

        const searchInput = html.find(".reagent-search");
        searchInput.val(this.searchQuery);

        searchInput.on("focus", () => this.wasSearchFocused = true);
        searchInput.on("blur", () => this.wasSearchFocused = false);
        searchInput.on("input", (event) => {
            this.searchQuery = event.currentTarget.value.trim().toLowerCase();
            if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                const wasFocused = this.wasSearchFocused;
                this.filterReagents();
                this.render(false);
                if (wasFocused) {
                    setTimeout(() => {
                        const newSearchInput = this.element.find(".reagent-search");
                        newSearchInput.focus();
                        const value = newSearchInput.val();
                        newSearchInput[0].setSelectionRange(value.length, value.length);
                    }, 0);
                }
            }, 300);
        });

        html.find(".sort-select").on("change", (event) => {
            this.sortCriterion = event.currentTarget.value;
            this.sortReagents();
            this.render(false);
        });
    }
}