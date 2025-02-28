// Create a module-level closure to encapsulate shared state
(function() {
  // Cache to store the latest state of the fields per item
  const fieldStateCache = new Map();

  Hooks.once("init", () => {
    console.log("Vikarov's Guide to Kaeliduran Crafting is initializing!");

    // Register Handlebars helper for "add"
    Handlebars.registerHelper("add", (a, b) => a + b);

    // Helper function to get IP limit based on rarity
    Handlebars.registerHelper("getIpLimit", function(rarity) {
      const ipLimits = {
        common: 5, uncommon: 7, rare: 10, veryRare: 11, legendary: 10
      };
      return ipLimits[rarity] || 5;
    });
  });

  // Async function to update the item with retries
  async function updateItemWithRetry(item, updateData, maxRetries = 3, delayMs = 500) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const updatedItem = await item.update(updateData);
        return updatedItem;
      } catch (err) {
        console.error(`Failed to update item on attempt ${attempt}:`, err);
        if (attempt === maxRetries) {
          throw err; // Final attempt failed
        }
        await new Promise(resolve => setTimeout(resolve, delayMs)); // Wait before retrying
      }
    }
  }

  // Modify the built-in "loot" sheet when it renders
  Hooks.on("renderItemSheet", (app, html, data) => {
    // Only modify "loot" sheets
    if (app.item.type !== "loot") return;

    // Ensure the item and system data are available
    if (!app.item) {
      console.error("Item is undefined in renderItemSheet:", app.item);
      return;
    }

    // Cache the initial editability state
    const isEditable = app.isEditable;

    // Initialize the field state cache for this item
    const itemId = app.item.id;
    if (!fieldStateCache.has(itemId)) {
      const flags = app.item.flags?.["vikarovs-crafting"] || {};
      fieldStateCache.set(itemId, {
        isReagent: flags.isReagent || false,
        essence: flags.essence || "none",
        combat: flags.combat || 0,
        utility: flags.utility || 0,
        entropy: flags.entropy || 0
      });
    }

    // Function to inject or update fields
    const injectFields = (attempt = 1) => {
      if (attempt > 5) {
        console.error("Failed to inject fields after 5 attempts. DOM may not be ready or selectors are incorrect.");
        return;
      }

      // Get the IP limit based on rarity
      const getIpLimit = (rarity) => {
        const ipLimits = {
          common: 5, uncommon: 7, rare: 10, veryRare: 11, legendary: 10
        };
        return ipLimits[rarity] || 5;
      };

      // Get the cached state
      const cachedState = fieldStateCache.get(itemId);

      // Add the "Crafting" tab to the sheet's tab navigation
      const tabs = html.find('.tabs');
      let craftingTabNav = tabs.find('a.item[data-tab="crafting"]');
      if (!craftingTabNav.length) {
        const newTabNav = `
          <a class="item" data-tab="crafting">Crafting</a>
        `;
        tabs.append(newTabNav);
      }

      // Add the "Crafting" tab content
      const sheetBody = html.find('.sheet-body');
      let craftingTabContent = sheetBody.find('.tab[data-tab="crafting"]');
      const rarity = app.item.system.rarity || "common";
      const limit = getIpLimit(rarity);
      const isGM = game.user.isGM;

      if (craftingTabContent.length) {
        // Update existing tab content
        craftingTabContent.css('display', isGM ? '' : 'none');
        craftingTabContent.find('input[name="flags.vikarovs-crafting.isReagent"]').prop('checked', cachedState.isReagent).prop('disabled', !app.isEditable);
        craftingTabContent.find('select[name="flags.vikarovs-crafting.essence"]').val(cachedState.essence).prop('disabled', !app.isEditable);
        craftingTabContent.find('input[name="flags.vikarovs-crafting.combat"]').val(cachedState.combat || 0).prop('disabled', !app.isEditable);
        craftingTabContent.find('input[name="flags.vikarovs-crafting.utility"]').val(cachedState.utility || 0).prop('disabled', !app.isEditable);
        craftingTabContent.find('input[name="flags.vikarovs-crafting.entropy"]').val(cachedState.entropy || 0).prop('disabled', !app.isEditable);
        craftingTabContent.find('.reagent-hint').css('display', cachedState.isReagent ? '' : 'none');
      } else {
        // Inject new tab content (visible only to GM)
        const newTabContent = `
          <div class="tab crafting-tab" data-tab="crafting" style="${isGM ? '' : 'display: none;'}">
            <div class="form-group">
              <label>Is Reagent?</label>
              <div class="form-fields">
                <input type="checkbox" name="flags.vikarovs-crafting.isReagent" ${cachedState.isReagent ? "checked" : ""} ${app.isEditable ? "" : "disabled"} />
              </div>
            </div>
            <div class="reagent-fields flexrow" style="${cachedState.isReagent ? '' : 'display: none;'}">
              <div class="form-group">
                <label>Essence</label>
                <select name="flags.vikarovs-crafting.essence" data-dtype="String" ${app.isEditable ? "" : "disabled"}>
                  <option value="none" ${cachedState.essence === "none" ? "selected" : ""}>None</option>
                  <option value="primal" ${cachedState.essence === "primal" ? "selected" : ""}>Primal</option>
                  <option value="fey" ${cachedState.essence === "fey" ? "selected" : ""}>Fey</option>
                  <option value="eldritch" ${cachedState.essence === "eldritch" ? "selected" : ""}>Eldritch</option>
                </select>
              </div>
              <div class="form-group">
                <label>Combat IP</label>
                <input type="number" name="flags.vikarovs-crafting.combat" value="${cachedState.combat || 0}" min="0" max="${limit}" data-dtype="Number" ${app.isEditable ? "" : "disabled"} />
              </div>
              <div class="form-group">
                <label>Utility IP</label>
                <input type="number" name="flags.vikarovs-crafting.utility" value="${cachedState.utility || 0}" min="0" max="${limit}" data-dtype="Number" ${app.isEditable ? "" : "disabled"} />
              </div>
              <div class="form-group">
                <label>Entropy IP</label>
                <input type="number" name="flags.vikarovs-crafting.entropy" value="${cachedState.entropy || 0}" min="0" max="${limit}" data-dtype="Number" ${app.isEditable ? "" : "disabled"} />
              </div>
            </div>
            <p class="hint reagent-hint" style="${cachedState.isReagent ? '' : 'display: none;'}">IPs cannot exceed ${limit} for ${rarity} reagents.</p>
          </div>
        `;
        sheetBody.append(newTabContent);
      }

      // Handle toggling visibility of reagent fields based on isReagent checkbox
      html.find('input[name="flags.vikarovs-crafting.isReagent"]').change(async event => {
        if (!app.isEditable) {
          console.warn("Sheet is locked; cannot update flags.vikarovs-crafting.isReagent. Please unlock the sheet to edit.");
          event.target.checked = cachedState.isReagent; // Revert the checkbox state
          return;
        }
        const isReagent = event.target.checked;
        try {
          await updateItemWithRetry(app.item, { "flags.vikarovs-crafting.isReagent": isReagent });
          cachedState.isReagent = isReagent;
          html.find('.reagent-fields').toggle(isReagent);
          html.find('.reagent-hint').toggle(isReagent);
        } catch (err) {
          console.error("Failed to update flags.vikarovs-crafting.isReagent:", err);
          event.target.checked = cachedState.isReagent; // Revert on failure
        }
      });

      // Add change event listener for the Essence dropdown
      html.find('select[name="flags.vikarovs-crafting.essence"]').change(async event => {
        if (!app.isEditable) {
          console.warn("Sheet is locked; cannot update flags.vikarovs-crafting.essence. Please unlock the sheet to edit.");
          event.target.value = cachedState.essence; // Revert the dropdown value
          return;
        }
        const value = event.target.value;
        try {
          await updateItemWithRetry(app.item, { "flags.vikarovs-crafting.essence": value });
          cachedState.essence = value;
        } catch (err) {
          console.error("Failed to update flags.vikarovs-crafting.essence:", err);
          event.target.value = cachedState.essence; // Revert on failure
        }
      });

      // Validate and save IPs on input
      html.find('input[name^="flags.vikarovs-crafting.combat"], input[name^="flags.vikarovs-crafting.utility"], input[name^="flags.vikarovs-crafting.entropy"]').change(async event => {
        if (!app.isEditable) {
          console.warn("Sheet is locked; cannot update IP field. Please unlock the sheet to edit.");
          event.target.value = cachedState[event.target.name.replace("flags.vikarovs-crafting.", "")] || 0; // Revert the input value
          return;
        }
        const value = parseInt(event.target.value) || 0;
        const rarity = app.item.system.rarity || "common";
        const limit = getIpLimit(rarity);
        if (value > limit) {
          event.target.value = limit;
          ui.notifications.warn(`IP cannot exceed ${limit} for ${rarity} reagents.`);
        }
        const fieldName = event.target.name.replace("flags.vikarovs-crafting.", "");
        try {
          await updateItemWithRetry(app.item, { [`flags.vikarovs-crafting.${fieldName}`]: value });
          cachedState[fieldName] = value;
        } catch (err) {
          console.error(`Failed to update flags.vikarovs-crafting.${fieldName}:`, err);
          event.target.value = cachedState[fieldName] || 0; // Revert on failure
        }
      });

      // Fallback: Add a manual save button to the sheet header
      if (app.isEditable) {
        const header = html.find('.window-header');
        const saveButton = `
          <a class="manual-save-btn" title="Manually Save Changes">
            <i class="fas fa-save"></i>
          </a>
        `;
        header.find('.window-title').after(saveButton);

        html.find('.manual-save-btn').click(async () => {
          const formData = new FormData(html.find("form")[0]);
          const updateData = app._getSubmitData(formData);

          if (updateData["flags.vikarovs-crafting.isReagent"]) {
            const rarity = updateData["system.rarity"] || app.item.system.rarity || "common";
            const limit = getIpLimit(rarity);

            const combat = parseInt(updateData["flags.vikarovs-crafting.combat"]) || 0;
            const utility = parseInt(updateData["flags.vikarovs-crafting.utility"]) || 0;
            const entropy = parseInt(updateData["flags.vikarovs-crafting.entropy"]) || 0;

            if (combat > limit || utility > limit || entropy > limit) {
              ui.notifications.error(`IPs cannot exceed ${limit} for ${rarity} reagents. Adjust Combat, Utility, or Entropy.`);
              return;
            }
          }

          try {
            await updateItemWithRetry(app.item, updateData);
            ui.notifications.info("Changes saved successfully.");
          } catch (err) {
            console.error("Failed to manually save changes:", err);
            ui.notifications.error("Failed to save changes. Check the console for details.");
          }
        });
      }

      // Activate the Crafting tab for GMs
      html.find('.tabs a').click(function(e) {
        e.preventDefault();
        const tab = $(this).data("tab");
        html.find('.tab').removeClass("active");
        html.find(`.tab[data-tab="${tab}"]`).addClass("active");
        html.find('.tabs a').removeClass("active");
        $(this).addClass("active");
      });
    };

    // Initial attempt to inject fields with a minimal delay
    setTimeout(() => injectFields(1), 50);
  });

  // Define the Crafting Window class
  Hooks.on("init", () => {
    class VikarovCraftingWindow extends Application {
      constructor(actor) {
        super();
        this.actor = actor;
        this.reagents = [null, null, null];
      }

      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: "vikarov-crafting-window",
          title: "Vikarov's Guide to Kaeliduran Crafting",
          template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/crafting-window.hbs",
          width: 500,
          height: 500,
          resizable: true,
          classes: ["dnd5e2", "sheet", "item"]
        });
      }

      _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        return buttons.map(button => {
          if (button.class === "close") {
            button.label = "";
          }
          return button;
        });
      }

      getData() {
        const data = super.getData();
        data.actor = this.actor;
        data.reagent0 = this.reagents[0];
        data.reagent1 = this.reagents[1];
        data.reagent2 = this.reagents[2];

        if (this.reagents.every(r => r)) {
          data.ipSums = this.calculateIPSums();
          data.canCraft = true;

          // Calculate DC based on the highest IP
          const highestSum = Math.max(data.ipSums.combat, data.ipSums.utility, data.ipSums.entropy);
          if (highestSum <= 5) {
            data.dc = 10; // Common
          } else if (highestSum <= 7) {
            data.dc = 15; // Uncommon
          } else if (highestSum <= 9) {
            data.dc = 20; // Rare
          } else if (highestSum <= 11) {
            data.dc = 25; // Very Rare
          } else {
            data.dc = 30; // Placeholder for higher values (legendary not handled yet)
          }
        } else {
          data.ipSums = { combat: 0, utility: 0, entropy: 0 };
          data.canCraft = false;
          data.dc = null; // No DC if not all slots are filled
        }

        return data;
      }

      calculateIPSums() {
        const sums = { combat: 0, utility: 0, entropy: 0 };
        this.reagents.forEach(reagent => {
          const flags = reagent?.flags || {};
          const craftingData = flags["vikarovs-crafting"] || {};
          sums.combat += craftingData.combat || 0;
          sums.utility += craftingData.utility || 0;
          sums.entropy += craftingData.entropy || 0;
        });
        return sums;
      }

      async activateListeners(html) {
        super.activateListeners(html);

        // Enable drag-and-drop for reagent slots
        html.find(".reagent-slot").each((index, slot) => {
          slot.addEventListener("dragover", (event) => {
            event.preventDefault();
          });

          slot.addEventListener("drop", async (event) => {
            event.preventDefault();

            const data = event.dataTransfer.getData("text/plain");
            let itemData;
            try {
              itemData = JSON.parse(data);
            } catch (e) {
              itemData = { uuid: data };
            }

            let item = null;
            if (itemData.uuid) {
              try {
                item = await fromUuid(itemData.uuid);
                if (!item) {
                  const extractedId = itemData.uuid.split(".").pop();
                  item = this.actor.items.get(extractedId) || game.items.get(extractedId);
                }
              } catch (error) {
                console.error(`Error resolving UUID ${itemData.uuid}:`, error);
                ui.notifications.error(`Could not find item with UUID ${itemData.uuid}.`);
                return;
              }
            }

            if (item) {
              const flags = item.flags || {};
              const craftingData = flags["vikarovs-crafting"] || {};
              const isReagent = craftingData.isReagent || false;

              if (item.type === "loot" && isReagent && !this.reagents.includes(item)) {
                this.reagents[index] = item;
                this.render();
              } else {
                let errorMsg;
                if (item.type !== "loot") {
                  errorMsg = `Item ${item.name} is not a loot item (type: ${item.type}).`;
                } else if (!isReagent) {
                  errorMsg = `Item ${item.name} is not a reagent (Is Reagent? not checked).`;
                } else {
                  errorMsg = `Item ${item.name} is already in use in another slot.`;
                }
                ui.notifications.error(errorMsg);
              }
            } else {
              ui.notifications.error(`Could not find item with UUID ${itemData.uuid || data}.`);
            }
          });
        });

        // Add click handler for removing reagents
        html.find(".remove-reagent").click((event) => {
          const slotIndex = parseInt(event.currentTarget.dataset.slot, 10);
          this.reagents[slotIndex] = null;
          this.render();
        });

        // Craft button with skill check
        html.find(".craft-btn").click(async (event) => {
          event.preventDefault();

          if (!this.reagents.every(r => r)) {
            ui.notifications.warn("Select three reagents to craft.");
            return;
          }

          const ipSums = this.calculateIPSums();
          const highestSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
          let dc;
          if (highestSum <= 5) {
            dc = 10; // Common
          } else if (highestSum <= 7) {
            dc = 15; // Uncommon
          } else if (highestSum <= 9) {
            dc = 20; // Rare
          } else if (highestSum <= 11) {
            dc = 25; // Very Rare
          } else {
            dc = 30; // Placeholder for higher values (legendary not handled yet)
          }

          const toolId = "alchemist"; // Correct key for Alchemist's Supplies in D&D 5e 4.3.5
          const defaultAbility = "int"; // Default to Intelligence for Alchemist's Supplies
          const rollData = this.actor.getRollData();

          // Display a manual dialog for the Alchemist's Supplies check
          const abilities = ["str", "dex", "con", "int", "wis", "cha"];
          const dialogContent = `
            <h2>Alchemist's Supplies Check (DC ${dc})</h2>
            <p>Choose the ability to use for this check:</p>
            <select id="ability-select">
              ${abilities.map(a => `<option value="${a}" ${a === defaultAbility ? "selected" : ""}>${a.toUpperCase()} (Mod: ${rollData.abilities[a]?.mod || 0})</option>`).join("")}
            </select>
            <p>Proficiency Bonus: ${rollData.prof || 0}</p>
            <p>Situational Bonus: <input type="text" id="bonus" value="0" style="width: 50px;" /></p>
          `;
          const rollOptions = await new Promise(resolve => {
            new Dialog({
              title: "Alchemist's Supplies Check",
              content: dialogContent,
              buttons: {
                roll: {
                  label: "Roll",
                  callback: html => {
                    const ability = html.find("#ability-select").val();
                    const bonus = parseInt(html.find("#bonus").val()) || 0;
                    resolve({ ability, bonus });
                  }
                },
                cancel: {
                  label: "Cancel",
                  callback: () => resolve(null)
                }
              },
              default: "roll"
            }).render(true);
          });

          if (!rollOptions) return; // User canceled the roll

          // Construct the roll using the selected ability and @prof
          const roll = new Roll(`1d20 + @abilities.${rollOptions.ability}.mod + @prof + ${rollOptions.bonus}`, rollData);
          const rollResult = await roll.roll();

          await rollResult.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `Alchemist's Supplies Check (using ${rollOptions.ability.toUpperCase()})`
          });

          const result = rollResult?.total;
          if (result === undefined) return; // Roll failed

          const outcome = this.determineOutcome(result, dc);
          await this.handleCraftingOutcome(outcome, ipSums);

          this.render();
        });
      }

      determineOutcome(roll, dc) {
        if (roll >= dc + 10) return "criticalSuccess";
        if (roll >= dc) return "standardSuccess";
        if (roll < dc - 10) return "criticalFailure";
        return "standardFailure";
      }

      async handleCraftingOutcome(outcome, ipSums) {
        const highestSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
        let adjustedSum = highestSum;
        const type = this.determineConsumableType(ipSums);

        if (outcome === "standardFailure") {
          const roll = new Roll("1d4");
          roll.evaluateSync();
          adjustedSum -= roll.total;
          ui.notifications.info("Crafting succeeded, but with an error—reduced potency.");
        } else if (outcome === "criticalFailure") {
          const roll = new Roll("2d4");
          roll.evaluateSync();
          adjustedSum -= roll.total;
          ui.notifications.warn("Crafting succeeded, but with a significant mistake—unstable result.");
        }

        const rarity = this.determineRarity(adjustedSum);
        const consumable = this.createConsumable(rarity, type);

        const reagentValues = this.reagents.map(r => {
          if (r && r.system?.rarity) {
            return this.getReagentValue(r.system.rarity);
          }
          return 0;
        });
        const baseCost = this.getBaseCost(rarity);
        const reagentSum = reagentValues.reduce((a, b) => a + b, 0);
        const totalCost = reagentSum >= baseCost ? 10 : Math.max(10, baseCost - reagentSum);

        await this.updateInventoryAndGold(consumable, totalCost);

        const message = `Crafted ${consumable.name} (${rarity}) for ${totalCost} gp.`;
        ui.notifications.info(message);
        ChatMessage.create({
          content: message,
          speaker: ChatMessage.getSpeaker({ actor: this.actor })
        });
      }

      determineConsumableType(ipSums) {
        const { combat, utility, entropy } = ipSums;
        const maxSum = Math.max(combat, utility, entropy);
        if (combat === maxSum) return "combat";
        if (utility === maxSum) return "utility";
        if (entropy === maxSum) return "entropy";
        return "combat";
      }

      determineRarity(sum) {
        if (sum <= 12) return "common";
        if (sum <= 21) return "uncommon";
        if (sum <= 27) return "rare";
        if (sum <= 30) return "veryRare";
        return "legendary";
      }

      createConsumable(rarity, type) {
        const names = {
          common: ["Minor Potion", "Small Bomb", "Basic Charm"],
          uncommon: ["Healing Draught", "Explosive Vial", "Fey Whisper"],
          rare: ["Greater Elixir", "Volatile Grenade", "Eldritch Amulet"],
          veryRare: ["Supreme Tonic", "Chaos Orb", "Primal Totem"],
          legendary: ["Vikarov’s Essence", "Cataclysmic Charge", "Fey Sovereign"]
        };
        const name = names[rarity][Math.floor(Math.random() * names[rarity].length)];
        return new Item({
          name,
          type: "consumable",
          system: {
            rarity,
            type,
            description: `A ${rarity} ${type} consumable crafted by Vikarov's guide.`
          }
        });
      }

      getBaseCost(rarity) {
        const costs = { common: 50, uncommon: 200, rare: 2000, veryRare: 20000, legendary: 100000 };
        return costs[rarity] || 50;
      }

      getReagentValue(rarity) {
        const values = { common: 10, uncommon: 50, rare: 600, veryRare: 6000, legendary: 50000 };
        return values[rarity] || 0;
      }

      async updateInventoryAndGold(consumable, cost) {
        const currency = this.actor.system.currency || { gp: 0 };
        if (currency.gp < cost) {
          ui.notifications.error("Not enough gold to craft this item!");
          return;
        }

        const updates = [];
        const deletes = [];
        for (const reagent of this.reagents.filter(r => r && r.id)) {
          const currentQuantity = reagent.system.quantity || 1;
          if (currentQuantity > 1) {
            // Reduce quantity by 1
            updates.push({
              _id: reagent.id,
              "system.quantity": currentQuantity - 1
            });
          } else {
            // If quantity would be 0, mark for deletion
            deletes.push(reagent.id);
          }
        }

        // Update quantities for reagents with quantity > 1
        if (updates.length > 0) {
          try {
            await this.actor.updateEmbeddedDocuments("Item", updates);
          } catch (error) {
            console.error("Error updating reagent quantities:", error);
            ui.notifications.error("Failed to update reagent quantities. Check permissions.");
            return;
          }
        }

        // Delete reagents with quantity 0
        if (deletes.length > 0) {
          try {
            await this.actor.deleteEmbeddedDocuments("Item", deletes);
          } catch (error) {
            console.error("Error deleting reagents:", error);
            ui.notifications.error("Failed to consume reagents. Check item IDs or permissions.");
            return;
          }
        }

        await this.actor.update({
          "system.currency.gp": currency.gp - cost
        });

        try {
          await this.actor.createEmbeddedDocuments("Item", [consumable.toObject()]);
        } catch (error) {
          console.error("Error adding consumable:", error);
          ui.notifications.error("Failed to add crafted item to inventory. Check permissions.");
        }
      }
    }

    window.VikarovCraftingWindow = VikarovCraftingWindow;
  });

  // Add the crafting button to the actor sheet header
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttonArray) => {
    if (sheet.actor.type === "character" || sheet.actor.type === "npc") {
      let craftingButton = {
        label: "",
        class: "vikarov-crafting-btn",
        icon: "fas fa-book-open",
        onclick: () => {
          const craftingWindow = new VikarovCraftingWindow(sheet.actor);
          craftingWindow.render(true);
        }
      };
      buttonArray.unshift(craftingButton);
    }
  });

  // Enable dragging items from inventory
  Hooks.on("renderItemSheet", (app, html, data) => {
    html.find(".item").each((i, elem) => {
      const item = app.item;
      elem.setAttribute("draggable", true);
      elem.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Item",
          uuid: item.uuid || `Item.${item.id}`
        }));
      });
    });
  });

  // Enable dragging from the Items sidebar (Compendium)
  Hooks.on("renderSidebarTab", (app, html, data) => {
    if (app.id === "items") {
      html.find(".item").each((i, elem) => {
        const itemId = elem.dataset.itemId || elem.dataset.documentId || elem.dataset.entryId;
        let item = null;

        (async () => {
          if (itemId) {
            item = game.items.get(itemId);
            if (!item) {
              for (const pack of game.packs.values()) {
                if (pack.documentClass === "Item") {
                  try {
                    const packItem = await pack.getDocument(itemId);
                    if (packItem) {
                      item = packItem.toObject();
                      break;
                    }
                  } catch (e) {
                    console.error(`Error checking pack ${pack.id}:`, e);
                  }
                }
              }
              if (!item) {
                item = game.items.get(itemId);
              }
            }
          }

          if (item) {
            elem.setAttribute("draggable", true);
            elem.addEventListener("dragstart", (event) => {
              event.dataTransfer.setData("text/plain", JSON.stringify({
                type: "Item",
                uuid: item.uuid || `Item.${item.id}`
              }));
            });
          }
        })();
      });
    }
  });
})();