/**
 * Displays the Crafting Compendium as an Item Sheet, showing known and unknown crafting outcomes.
 */
export class CraftingCompendium extends ItemSheet {
    constructor(actor, options = {}) {
        // Create a temporary dummy item without embedding it in the actor
        const dummyItemData = {
            name: "Crafting Compendium",
            type: "loot",
            ownership: { default: 2 }
        };
        const dummyItem = new Item(dummyItemData, { parent: actor }); // Associate with actor without embedding
        super(dummyItem, { actor, ...options });
        this._actor = actor; // Store the actor in a private property for access
        this.activeTab = null;
    }

    /* === Configuration === */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "crafting-compendium",
            title: "Vikarov's Crafting Compendium",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-compendium.hbs",
            width: 700, // Initial width
            height: 700, // Initial height
            classes: ["dnd5e2", "sheet", "item", "crafting-compendium"],
            resizable: false, // Disable resizing
            tabs: [{ navSelector: ".compendium-tabs", contentSelector: ".sheet-body", initial: "combat" }]
        });
    }

    _getHeaderButtons() {
        // Get the default header buttons from the parent class
        const buttons = super._getHeaderButtons();

        // Customize the buttons to remove text labels
        return buttons.map(button => {
            if (button.class === "close") {
                return { ...button, label: "" }; // Remove "Close" text
            }
            if (button.class === "configure-sheet") {
                return { ...button, label: "" }; // Remove "Sheet" text
            }
            return button;
        });
    }    

    activateListeners(html) {
        super.activateListeners(html);

        // Handle tab changes and persist the active tab
        this._tabs[0].bind(html[0]);
        html.find('[data-tab]').on("click", async (event) => {
            const tab = event.currentTarget.dataset.tab;
            try {
                await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab", tab);
            } catch (error) {
                console.error("Failed to set last viewed tab:", error);
                ui.notifications.error("Failed to save last viewed tab.");
            }
        });

        // Handle clicks on consumable links
        html.find('.consumable-link').on("click", (event) => {
            const itemId = event.currentTarget.dataset.itemId;
            const item = this._actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        });
    }

    async getData() {
        const data = await super.getData();

        console.log("Debug: CraftingCompendium - getData called", data);

        // Retrieve the last viewed tab, default to "combat"
        const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab") || "combat";
        this.options.tabs[0].initial = lastTab;

        // Retrieve known outcomes
        let knownOutcomes = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
        knownOutcomes = {
            Combat: knownOutcomes.Combat || [],
            Utility: knownOutcomes.Utility || [],
            Entropy: knownOutcomes.Entropy || []
        };

        // Define rarity ranges
        const rarityRanges = {
            common: { start: 1, end: 12 },
            uncommon: { start: 13, end: 21 },
            rare: { start: 22, end: 27 },
            veryRare: { start: 28, end: 30 },
            legendary: { start: 31, end: 31 }
        };

        // Prepare tab data
        const tabs = {
            combat: { rarityGroups: {} },
            utility: { rarityGroups: {} },
            entropy: { rarityGroups: {} }
        };

        for (const category of ["combat", "utility", "entropy"]) {
            const categoryKey = category.charAt(0).toUpperCase() + category.slice(1);
            const knownSums = knownOutcomes[categoryKey];

            for (const [rarity, range] of Object.entries(rarityRanges)) {
                const outcomes = {};
                for (let sum = range.start; sum <= range.end; sum++) {
                    const isKnown = knownSums.some(entry => {
                        if (typeof entry === "number") return entry === sum;
                        return entry && entry.sum === sum;
                    });
                    const linkedEntry = knownSums.find(entry => typeof entry !== "number" && entry.sum === sum);
                    outcomes[sum] = {
                        isKnown,
                        itemId: linkedEntry?.itemId || null
                    };
                }
                tabs[category].rarityGroups[rarity] = { outcomes };
            }
        }

        data.tabs = tabs;
        console.log("Debug: CraftingCompendium - Prepared tab data", tabs);
        return data;
    }

    async close(options = {}) {
        // No need to delete the dummy item since it was never embedded
        return super.close(options);
    }
}