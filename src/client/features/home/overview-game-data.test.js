// The overview carries what the home page needs of the game data (how many items, arcana and spells there
// are, and ten pictures spread over each list), so that the page draws it at once: a block filled afterwards
// would change the page that the server sent and the browser then redraws.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});

describe("the game data of the overview", { skip: app ? false : "MySQL is not reachable" }, () => {
  test("an empty catalogue says so, for a visitor too", async () => {
    const { body } = await app.browser().get("/api/overview");
    assert.deepEqual(body.gameData, {
      items: { count: 0, images: [] },
      arcana: { count: 0, images: [] },
      spells: { count: 0, images: [] }
    });
  });

  test("it counts everything and keeps ten pictures that exist, among those that have one", async () => {
    const pictures = [];
    for (let index = 0; index < 12; index += 1) {
      const imageId = await app.store.saveImage(Buffer.from(`picture ${index}`));
      pictures.push(imageId);
      await app.store.createSpell({
        name: `Spell ${String(index).padStart(2, "0")}`,
        imageId,
        description: "",
        cooldownSeconds: null,
        unlockLevel: null
      });
    }
    await app.store.createSpell({
      name: "Without a picture",
      imageId: null,
      description: "",
      cooldownSeconds: null,
      unlockLevel: null
    });
    const { body } = await app.browser().get("/api/overview");
    assert.equal(body.gameData.spells.count, 13);
    assert.equal(body.gameData.spells.images.length, 10, "ten pictures at most");
    assert.ok(
      body.gameData.spells.images.every(id => pictures.includes(id)),
      "only pictures that exist"
    );
    assert.deepEqual(body.gameData.items, { count: 0, images: [] });
  });

  test("the pictures are spread over the list: the arcana, which come by colour, show all three colours", async () => {
    const colourOf = new Map();
    for (const color of ["red", "blue", "green"]) {
      for (let index = 0; index < 10; index += 1) {
        const imageId = await app.store.saveImage(Buffer.from(`arcana ${color} ${index}`));
        colourOf.set(imageId, color);
        await app.store.createArcana({
          name: `${color} ${String(index).padStart(2, "0")}`,
          color,
          imageId,
          description: "",
          stats: [],
          tags: []
        });
      }
    }
    const { body } = await app.browser().get("/api/overview");
    assert.equal(body.gameData.arcana.count, 30);
    assert.equal(body.gameData.arcana.images.length, 10);
    assert.deepEqual(
      body.gameData.arcana.images.map(id => colourOf.get(id)),
      ["red", "red", "red", "red", "blue", "blue", "blue", "green", "green", "green"],
      "four red, three blue, three green, in the order of the list"
    );
    assert.equal(new Set(body.gameData.arcana.images).size, 10, "ten different pictures");
  });
});
