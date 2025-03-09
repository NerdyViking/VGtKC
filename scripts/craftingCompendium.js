/**
 * Displays the Crafting Compendium as an Item Sheet, showing known and unknown crafting outcomes.
 * Includes GM-only edit mode for defining consumable outcomes via drag-and-drop.
 */
export class CraftingCompendium extends ItemSheet {
    constructor(actor, options = {}) {
        // Create a temporary dummy item without embedding it in the actor
        const dummyItemData = {
            name: "Crafting Compendium",
            type: "loot",
            ownership: { default: 2 }
        };
        const dummyItem = new Item(dummyItemData, { parent: actor });
        super(dummyItem, { actor, ...options });
        this._actor = actor;
        this.activeTab = null;
        this.editMode = false; // Initialize edit mode state
    }

    /* === Configuration === */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "crafting-compendium",
            title: "Vikarov's Crafting Compendium",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-compendium.hbs",
            width: 700,
            height: 700,
            classes: ["dnd5e2", "sheet", "item", "crafting-compendium"],
            resizable: false,
            tabs: [{ navSelector: ".compendium-tabs", contentSelector: ".sheet-body", initial: "combat" }]
        });
    }

    /* === Initialization Hook === */
    static init() {
        // Register setting for consumable outcomes on module init
        Hooks.once("init", () => {
            game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', {
                name: 'Consumable Outcomes',
                hint: 'Stores crafting outcomes for Combat, Utility, and Entropy.',
                scope: 'world',
                config: false,
                type: Object,
                default: { Combat: {}, Utility: {}, Entropy: {} }
            });
        });

        // Lock player UI when edit mode is active
        Hooks.on('renderPlayerList', (app, html) => {
            const compendium = ui.windows[Object.keys(ui.windows).find(id => ui.windows[id] instanceof CraftingCompendium)];
            if (compendium?.editMode && !game.user.isGM) {
                html.find('li').prop('disabled', true);
            }
        });
    }

    /* === Header Buttons === */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();

        // Add GM-only Edit Outcomes button
        if (game.user.isGM) {
            buttons.unshift({
                label: "",
                class: "edit-outcomes",
                icon: "fas fa-edit",
                onclick: () => {
                    this.editMode = !this.editMode;
                    this.render(); // Re-render to toggle edit mode UI
                }
            });
        }

        // Remove text labels from all buttons
        return buttons.map(button => ({ ...button, label: "" }));
    }    

    /* === Event Listeners === */
    activateListeners(html) {
        super.activateListeners(html);

        // Handle tab navigation
        this._tabs[0].bind(html[0]);
        html.find('[data-tab]').on("click", async (event) => {
            const tab = event.currentTarget.dataset.tab;
            try {
                await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab", tab);
            } catch (error) {
                ui.notifications.error("Failed to save last viewed tab.");
            }
        });

        // Handle consumable link clicks (player view)
        html.find('.consumable-link').on("click", (event) => {
            if (this.editMode) return; // Disable in edit mode
            const itemId = event.currentTarget.dataset.itemId;
            const item = game.items.get(itemId); // Use world items for GM-defined outcomes
            if (item) {
                item.sheet.render(true);
            }
        });

        // Edit mode listeners (GM only)
        if (this.editMode && game.user.isGM) {
            // Clear outcome buttons
            html.find('.clear-outcome').on("click", async (event) => {
                const sum = event.currentTarget.dataset.sum;
                const category = event.currentTarget.dataset.category;
                const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
                delete outcomes[category][sum];
                await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
                this.render();
            });

            // Drag-and-drop for outcome slots
            html.find('.outcome-cell').on('drop', async (event) => {
                event.preventDefault();
                try {
                    const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                    if (data.type !== 'Item') return;
                    const item = await fromUuid(data.uuid);
                    if (!item) {
                        return;
                    }
                    const sum = event.currentTarget.dataset.sum;
                    const category = event.currentTarget.dataset.category;
                    const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
                    outcomes[category][sum] = item.id;
                    await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
                    this.render();
                } catch (error) {
                }
            });
        }
    }

    /* === Data Preparation === */
    async getData() {
        const data = await super.getData();

        // Retrieve last viewed tab
        const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab") || "combat";
        this.options.tabs[0].initial = lastTab;

        // Retrieve known outcomes from actor
        let knownOutcomes = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
        knownOutcomes = {
            Combat: knownOutcomes.Combat || [],
            Utility: knownOutcomes.Utility || [],
            Entropy: knownOutcomes.Entropy || []
        };

        // Retrieve GM-defined outcomes from settings
        const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');

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
                const outcomesData = {};
                for (let sum = range.start; sum <= range.end; sum++) {
                    const isKnown = knownSums.some(entry => {
                        if (typeof entry === "number") return entry === sum;
                        return entry && entry.sum === sum;
                    });
                    const itemId = outcomes[categoryKey][sum] || null;
                    let itemImg = null;
                    if (itemId) {
                        const item = game.items.get(itemId);
                        if (item) {
                            itemImg = item.img;
                        }
                    }
                    outcomesData[sum] = { isKnown, itemId, itemImg };
                }
                tabs[category].rarityGroups[rarity] = { outcomes: outcomesData };
            }
        }

        data.tabs = tabs;
        data.editMode = this.editMode && game.user.isGM;
        return data;
    }

    /* === Cleanup === */
    async close(options = {}) {
        this.editMode = false; // Disable edit mode on close
        return super.close(options);
    }
}

// Initialize settings and hooks
CraftingCompendium.init();