// reagentSelectionDialog.js
/**
 * Handles the reagent selection dialog for the crafting system.
 * Displays a list of available reagents and allows the user to select one.
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
            if (button.class === "close") {
                button.label = "";
            }
            return button;
        });
    }

    getData() {
        const filteredReagents = this.filteredReagents.map(reagent => {
            const essence = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
            const ipValues = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
            const embeddedItem = this.actor.items.get(reagent.id);
            if (!embeddedItem) {
                console.warn(`Reagent with ID ${reagent.id} not found in actor's items.`);
            }
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

            if (key === "name") {
                comparison = a.name.localeCompare(b.name);
            } else if (key === "essence") {
                comparison = a.essence.localeCompare(b.essence);
            } else if (key === "combat") {
                comparison = a.combat - b.combat;
            } else if (key === "utility") {
                comparison = a.utility - b.combat;
            } else if (key === "entropy") {
                comparison = a.entropy - b.combat;
            }

            return direction === "asc" ? comparison : -comparison;
        });

        return {
            filteredReagents,
            searchQuery: this.searchQuery,
            sortCriterion: this.sortCriterion
        };
    }

    filterReagents() {
        let filtered = [...this.reagents];

        const selectedNames = this.selectedReagents
            .filter(reagent => reagent !== null)
            .map(reagent => {
                console.log(`Selected reagent: Name=${reagent.name}, ID=${reagent.id}`);
                return reagent.name.toLowerCase();
            });
        console.log("Selected reagent names to filter out:", selectedNames);
        filtered = filtered.filter(reagent => {
            const isExcluded = selectedNames.includes(reagent.name.toLowerCase());
            console.log(`Checking reagent Name=${reagent.name}, ID=${reagent.id}, Excluded=${isExcluded}`);
            return !isExcluded;
        });

        if (this.searchQuery) {
            filtered = filtered.filter(reagent => {
                const name = reagent.name.toLowerCase();
                const essence = (reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None").toLowerCase();
                return name.includes(this.searchQuery) || essence.includes(this.searchQuery);
            });
        }

        this.filteredReagents = filtered;
        this.sortReagents();
    }

    sortReagents() {
        this.filteredReagents.sort((a, b) => {
            const [key, direction] = this.sortCriterion.split('-');
            let comparison = 0;

            if (key === "name") {
                comparison = a.name.localeCompare(b.name);
            } else if (key === "essence") {
                comparison = (a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None").localeCompare(b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None");
            } else if (key === "combat") {
                const aIP = a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0 };
                const bIP = b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0 };
                comparison = (Number(aIP.combat) || 0) - (Number(bIP.combat) || 0);
            } else if (key === "utility") {
                const aIP = a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { utility: 0 };
                const bIP = b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { utility: 0 };
                comparison = (Number(aIP.utility) || 0) - (Number(bIP.utility) || 0);
            } else if (key === "entropy") {
                const aIP = a.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { entropy: 0 };
                const bIP = b.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { entropy: 0 };
                comparison = (Number(aIP.entropy) || 0) - (Number(bIP.entropy) || 0);
            }

            return direction === "asc" ? comparison : -comparison;
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        const reagentEntries = html.find(".reagent-entry");
        console.log(`Found ${reagentEntries.length} reagent entries to attach click listeners to.`);
        reagentEntries.each((index, element) => {
            const itemId = element.dataset.itemId;
            console.log(`Attaching click listener to reagent entry ${index}: ID=${itemId}`);
        });
        reagentEntries.on("click", (event) => {
            console.log("Reagent entry clicked:", event.currentTarget);
            const itemId = event.currentTarget.dataset.itemId;
            const selectedItem = this.actor.items.get(itemId);
            if (selectedItem) {
                console.log(`Selected Reagent: ${selectedItem.name}`);
                this.callback(selectedItem);
                this.close();
            } else {
                console.warn("Selected item not found for ID:", itemId);
            }
        });

        const searchInput = html.find(".reagent-search");
        searchInput.val(this.searchQuery);

        searchInput.on("focus", () => {
            this.wasSearchFocused = true;
        });

        searchInput.on("blur", () => {
            this.wasSearchFocused = false;
        });

        searchInput.on("input", (event) => {
            const newQuery = event.currentTarget.value.trim().toLowerCase();
            this.searchQuery = newQuery;

            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }

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