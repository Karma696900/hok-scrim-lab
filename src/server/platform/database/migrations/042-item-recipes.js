// The recipe of an item, as in the shop of the game: its level (`tier`: basic, intermediate, final, enchanted;
// NULL until known), where each value came from (`sources_json`: the page each one was read from), and the items
// it is built from (catalog_item_components: one row per component, in order, the same one possibly twice). A
// component cannot be deleted while a recipe holds it; a recipe goes with its item. Additive only.
import { addColumnIfMissing } from "./helpers.js";

export default {
  version: 42,
  name: "item-recipes",
  async up(connection) {
    await addColumnIfMissing(connection, "catalog_items", "tier", "VARCHAR(12) NULL");
    await addColumnIfMissing(connection, "catalog_items", "sources_json", "TEXT NULL");
    await connection.query(`CREATE TABLE IF NOT EXISTS catalog_item_components (
      item_id INT NOT NULL,
      position TINYINT UNSIGNED NOT NULL,
      component_id INT NOT NULL,
      PRIMARY KEY (item_id, position),
      INDEX idx_item_components_component (component_id),
      CONSTRAINT fk_item_components_item FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_item_components_component FOREIGN KEY (component_id) REFERENCES catalog_items(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
