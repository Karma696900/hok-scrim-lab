// The two pages of the API as the server sends them: the documentation (/developers) is public and indexed, with
// a title search engines read; the API page of a person (/me/api) stays out of the index and of the sitemap.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => app?.close());
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const meta = html => ({
  title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "",
  robots: /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? ""
});

describe("the pages of the API", { skip }, () => {
  test("/developers is public and indexed, titled for the people who look for a HOK API", async () => {
    const response = await fetch(`${app.baseUrl}/developers`);
    assert.equal(response.status, 200);
    const page = meta(await response.text());
    assert.match(page.title, /HOK API/);
    assert.match(page.title, /Honor of Kings/);
    assert.equal(page.robots, "index, follow");
  });

  test("/me/api is private: noindex for whoever has no session", async () => {
    const response = await fetch(`${app.baseUrl}/me/api`);
    assert.equal(response.status, 200);
    assert.equal(meta(await response.text()).robots, "noindex, nofollow");
  });

  test("the sitemap lists the documentation, never the API page; llms.txt points at both descriptions", async () => {
    const xml = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    assert.ok(xml.includes(`<loc>${app.baseUrl}/developers</loc>`));
    assert.ok(!xml.includes("/me/api"));
    const llms = await (await fetch(`${app.baseUrl}/llms.txt`)).text();
    for (const address of ["/developers", "/api/v1/openapi.json", "/api/v1/mcp"]) {
      assert.ok(llms.includes(`${app.baseUrl}${address}`), address);
    }
  });
});
