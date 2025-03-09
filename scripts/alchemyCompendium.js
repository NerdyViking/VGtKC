/**
 * Displays the Alchemy Compendium as an Item Sheet, showing known and unknown crafting outcomes.
 * Includes GM-only edit mode for defining consumable outcomes via drag-and-drop.
 */

console.log("alchemyCompendium.js loaded");

export class AlchemyCompendium extends ItemSheet {
    constructor(actor, options = {}) {
        const dummyItemData = { name: "Alchemy Compendium", type: "loot", ownership: { default: 2 } };
        const dummyItem = new Item(dummyItemData, { parent: actor });
        super(dummyItem, { actor, ...options });
        this._actor = actor;
        this.activeTab = null;
        this.editMode = false;
    }

    /* === Configuration === */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "alchemy-compendium",
            title: "Vikarov's Alchemy Compendium",
            template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/alchemyCompendium.hbs",
            width: 700,
            height: 700,
            classes: ["dnd5e2", "sheet", "item", "alchemy-compendium"],
            resizable: false,
            tabs: [{ navSelector: ".compendium-tabs", contentSelector: ".sheet-body", initial: "combat" }]
        });
    }

    /* === Initialization Hook === */
    static init() {
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

        Hooks.on('renderPlayerList', (app, html) => {
            const compendium = ui.windows[Object.keys(ui.windows).find(id => ui.windows[id] instanceof AlchemyCompendium)];
            if (compendium?.editMode && !game.user.isGM) {
                html.find('li').prop('disabled', true);
            }
        });
    }

    /* === Header Buttons === */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        if (game.user.isGM) {
            buttons.unshift({
                label: "",
                class: "edit-outcomes",
                icon: "fas fa-edit",
                onclick: () => {
                    this.editMode = !this.editMode;
                    this.render();
                }
            });
        }
        return buttons.map(button => ({ ...button, label: "" }));
    }

    /* === Event Listeners === */
    activateListeners(html) {
        super.activateListeners(html);

        this._tabs[0].bind(html[0]);
        html.find('[data-tab]').on("click", async (event) => {
            const tab = event.currentTarget.dataset.tab;
            try {
                await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab", tab);
            } catch (error) {
                ui.notifications.error("Failed to save last viewed tab.");
            }
        });

        html.find('.consumable-link').on("click", (event) => {
            if (this.editMode) return;
            const itemId = event.currentTarget.dataset.itemId;
            const item = game.items.get(itemId) || this._actor.items.get(itemId);
            if (item) item.sheet.render(true);
            else ui.notifications.error("Item not found.");
        });

        if (this.editMode && game.user.isGM) {
            html.find('.clear-outcome').on("click", async (event) => {
                const sum = event.currentTarget.dataset.sum;
                const category = event.currentTarget.dataset.category;
                const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
                delete outcomes[category][sum];
                await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
                this.render();
            });

            html.find('.outcome-cell').on('drop', async (event) => {
                event.preventDefault();
                try {
                    console.log("Drop event triggered, data:", event.originalEvent.dataTransfer.getData('text/plain')); // Debug
                    const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
                    console.log("Parsed data:", data); // Debug
                    if (data.type !== 'Item') {
                        console.warn("Dropped data is not an Item type:", data.type);
                        ui.notifications.warn("Only items can be dropped here.");
                        return;
                    }
                    let item = await fromUuid(data.uuid);
                    if (!item) {
                        console.warn("Item not resolved from UUID:", data.uuid);
                        // Fallback: Try to find item by ID in game.items or actor.items
                        item = game.items.get(data.id) || this._actor.items.get(data.id);
                        if (!item) {
                            console.error("Item not found in fallback search:", data.id);
                            ui.notifications.error("Failed to resolve dropped item.");
                            return;
                        }
                    }
                    console.log("Resolved item:", item.name, "ID:", item.id); // Debug
                    const sum = event.currentTarget.dataset.sum;
                    const category = event.currentTarget.dataset.category;
                    const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
                    outcomes[category][sum] = item.id;
                    await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
                    console.log("Updated outcomes for", category, "sum", sum, "with item ID:", item.id); // Debug
                    this.render();
                } catch (error) {
                    console.error("Drop error:", error);
                    ui.notifications.error("Failed to link item to outcome: " + error.message);
                }
            });
        }
    }

    /* === Data Preparation === */
    async getData() {
        const data = await super.getData();
        const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastCraftingCompendiumTab") || "combat";
        this.options.tabs[0].initial = lastTab;

        let knownOutcomes = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "knownCraftingOutcomes") || { Combat: [], Utility: [], Entropy: [] };
        knownOutcomes = {
            Combat: knownOutcomes.Combat || [],
            Utility: knownOutcomes.Utility || [],
            Entropy: knownOutcomes.Entropy || []
        };

        const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
        const rarityRanges = {
            common: { start: 1, end: 12 },
            uncommon: { start: 13, end: 21 },
            rare: { start: 22, end: 27 },
            veryRare: { start: 28, end: 30 },
            legendary: { start: 31, end: 31 }
        };

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
                        const item = game.items.get(itemId) || this._actor.items.get(itemId);
                        if (item) {
                            itemImg = item.img;
                            console.log(`Found item for ${category} sum ${sum}: ${item.name}, img: ${itemImg}`); // Debug
                        } else {
                            console.warn(`Item not found for ID ${itemId} in ${category} sum ${sum}`);
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
        this.editMode = false;
        return super.close(options);
    }
}

// Initialize settings and hooks
AlchemyCompendium.init();