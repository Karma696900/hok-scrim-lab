// The review of a video in the notebook: the link of the video and the moments to look at again,
// linked to a hero. The rules shared with the page (times, moments, links) are tested first, then the
// validation of a note, then the routes and what a shared space shows.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { parseNote } from "./training-domain.js";
import {
  VOD_MARKS_MAX,
  VOD_MARK_TEXT_MAX,
  VOD_SECONDS_MAX,
  clockText,
  marksText,
  parseClock,
  parseMarks,
  vodAddress,
  vodHost,
  vodLink
} from "../../../shared/vod-model.js";
import { startTestServer } from "../../../testing/test-app.js";

const refuses = (build, pattern) =>
  assert.throws(build, error => error.code === "invalid_body" && pattern.test(error.message));

describe("the times of a video (pure)", () => {
  test("a time is written m:ss or h:mm:ss, and read back the same", () => {
    assert.equal(clockText(0), "0:00");
    assert.equal(clockText(754), "12:34");
    assert.equal(clockText(3723), "1:02:03");
    assert.equal(clockText(VOD_SECONDS_MAX), "23:59:59");
    for (const seconds of [0, 5, 59, 60, 754, 3599, 3600, 3723, 45_296, VOD_SECONDS_MAX]) {
      assert.equal(parseClock(clockText(seconds)), seconds);
    }
  });

  test("minutes may go past the hour; what is not a time of a video is refused", () => {
    assert.equal(parseClock("75:30"), 4530);
    assert.equal(parseClock(" 1:02:03 "), 3723);
    for (const bad of [
      "",
      "12",
      "12:5",
      "12:60",
      "1:60:00",
      "1:00:60",
      "24:00:00",
      "abc",
      "-1:00",
      "1:2:3:4",
      null
    ]) {
      assert.equal(parseClock(bad), null, `${bad} is not a time`);
    }
  });
});

describe("the moments of a video (pure)", () => {
  test("one moment per line: a time, an optional dash, what to look at; put in the order of the video", () => {
    const { marks, problem } = parseMarks(
      "12:30 flash missed\n\n  3:05 - first back  \r\n1:02:03 — late rotation\n3:05 same second, other words"
    );
    assert.equal(problem, null);
    assert.deepEqual(marks, [
      { at: 185, text: "first back" },
      { at: 185, text: "same second, other words" },
      { at: 750, text: "flash missed" },
      { at: 3723, text: "late rotation" }
    ]);
    assert.equal(
      marksText(marks),
      "3:05 first back\n3:05 same second, other words\n12:30 flash missed\n1:02:03 late rotation"
    );
    assert.deepEqual(parseMarks(marksText(marks)).marks, marks, "what is written is read back");
    assert.deepEqual(parseMarks("").marks, []);
    assert.deepEqual(parseMarks(undefined).marks, []);
  });

  test("a wrong line is named by its number (blank lines count), with the reason", () => {
    assert.deepEqual(parseMarks("1:00 fine\n\nflash missed").problem, {
      reason: "format",
      line: 3
    });
    assert.deepEqual(parseMarks("12:30").problem, { reason: "format", line: 1 });
    assert.deepEqual(parseMarks("12:75 late").problem, { reason: "format", line: 1 });
    assert.deepEqual(parseMarks("99:99:99 late").problem, { reason: "format", line: 1 });
    assert.deepEqual(parseMarks(`0:10 ${"x".repeat(VOD_MARK_TEXT_MAX + 1)}`).problem, {
      reason: "long",
      line: 1
    });
    assert.equal(parseMarks(`0:10 ${"x".repeat(VOD_MARK_TEXT_MAX)}`).problem, null);
    const many = Array.from(
      { length: VOD_MARKS_MAX + 1 },
      (_, index) => `0:${String(index).padStart(2, "0")} look`
    );
    assert.deepEqual(parseMarks(many.join("\n")).problem, {
      reason: "many",
      line: VOD_MARKS_MAX + 1
    });
    assert.equal(parseMarks(many.slice(0, VOD_MARKS_MAX).join("\n")).problem, null);
  });
});

describe("the link of a video (pure)", () => {
  test("only an https address of a site is a link; it is written the same way every time", () => {
    assert.equal(
      vodAddress("  https://YouTube.com/watch?v=abc  "),
      "https://youtube.com/watch?v=abc"
    );
    assert.equal(
      vodAddress("https://www.twitch.tv/videos/123"),
      "https://www.twitch.tv/videos/123"
    );
    for (const bad of [
      "http://youtube.com/watch?v=abc",
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "ftp://example.com/x",
      "//example.com/x",
      "youtube.com/watch?v=abc",
      "https://user:secret@example.com/x",
      "https://example.com:8443/x",
      "https://localhost/x",
      "https://192.168.1.1/x",
      "https://[::1]/x",
      "https://exa mple.com/x",
      "https://example.com/a b",
      "https://example.com/\u0000",
      `https://example.com/${"a".repeat(500)}`,
      "",
      "   ",
      null,
      42
    ]) {
      assert.equal(vodAddress(bad), null, `${bad} is not a link`);
    }
  });

  test("the sites that take a moment in the address open at it, the others open at the start", () => {
    assert.equal(
      vodLink("https://www.youtube.com/watch?v=abc", 754),
      "https://www.youtube.com/watch?v=abc&t=754"
    );
    assert.equal(
      vodLink("https://youtu.be/abc?t=5", 90),
      "https://youtu.be/abc?t=90",
      "replaces the time"
    );
    assert.equal(
      vodLink("https://www.twitch.tv/videos/123", 3723),
      "https://www.twitch.tv/videos/123?t=1h2m3s"
    );
    assert.equal(
      vodLink("https://www.twitch.tv/somebody", 3723),
      "https://www.twitch.tv/somebody",
      "only the videos of Twitch have a time"
    );
    assert.equal(
      vodLink("https://www.bilibili.com/video/BV1xx411c7mD", 61),
      "https://www.bilibili.com/video/BV1xx411c7mD?t=61"
    );
    assert.equal(vodLink("https://example.com/video/1", 61), "https://example.com/video/1");
    assert.equal(
      vodLink("https://youtu.be/abc", 0),
      "https://youtu.be/abc",
      "no moment, no change"
    );
    assert.equal(vodLink("javascript:alert(1)", 5), null);
    assert.equal(vodLink("not a link"), null);
  });

  test("the site is shown without www", () => {
    assert.equal(vodHost("https://www.youtube.com/watch?v=abc"), "youtube.com");
    assert.equal(vodHost("https://clips.example.co.uk/x"), "clips.example.co.uk");
    assert.equal(vodHost("http://example.com"), "");
  });
});

describe("a video review as a note (pure)", () => {
  const known = new Set(["h01", "h02"]);
  const review = (overrides = {}) => ({
    kind: "vod",
    heroId: "h01",
    title: "Scrim vs Wolves",
    url: "https://www.youtube.com/watch?v=abc",
    marks: [{ at: 750, text: "flash missed" }],
    ...overrides
  });

  test("a hero, the link and the moments; the moments are put in the order of the video", () => {
    const note = parseNote(
      review({
        marks: [
          { at: 750, text: "flash missed" },
          { at: 30, text: "  early   ping " }
        ]
      }),
      known
    );
    assert.equal(note.kind, "vod");
    assert.equal(note.heroId, "h01");
    assert.equal(note.url, "https://www.youtube.com/watch?v=abc");
    assert.deepEqual(note.marks, [
      { at: 30, text: "early ping" },
      { at: 750, text: "flash missed" }
    ]);
    assert.deepEqual(note.steps, []);
    assert.equal(note.status, "todo");
    assert.deepEqual(
      parseNote(review({ marks: undefined }), known).marks,
      [],
      "moments are optional"
    );
    assert.deepEqual(parseNote(review({ marks: [] }), known).marks, []);
  });

  test("a review belongs to a hero and needs a link that is an https address", () => {
    refuses(() => parseNote(review({ heroId: null }), known), /belongs to a hero/);
    refuses(() => parseNote(review({ heroId: "h99" }), known), /Unknown hero/);
    refuses(() => parseNote(review({ url: undefined }), known), /https/);
    refuses(() => parseNote(review({ url: "http://youtube.com/watch?v=abc" }), known), /https/);
    refuses(() => parseNote(review({ url: "javascript:alert(1)" }), known), /https/);
    refuses(() => parseNote(review({ url: 42 }), known), /https/);
  });

  test("the moments are checked one by one", () => {
    refuses(
      () => parseNote(review({ marks: [{ at: -1, text: "x" }] }), known),
      /between 0:00 and 23:59:59/
    );
    refuses(
      () => parseNote(review({ marks: [{ at: VOD_SECONDS_MAX + 1, text: "x" }] }), known),
      /between 0:00/
    );
    refuses(() => parseNote(review({ marks: [{ at: 1.5, text: "x" }] }), known), /between 0:00/);
    refuses(() => parseNote(review({ marks: [{ at: "12", text: "x" }] }), known), /between 0:00/);
    refuses(() => parseNote(review({ marks: [{ at: 5, text: "" }] }), known), /required/);
    refuses(
      () =>
        parseNote(review({ marks: [{ at: 5, text: "x".repeat(VOD_MARK_TEXT_MAX + 1) }] }), known),
      /at most/
    );
    refuses(
      () => parseNote(review({ marks: [{ at: 5, text: "<b>x</b>" }] }), known),
      /control characters/
    );
    refuses(() => parseNote(review({ marks: "12:30 flash" }), known), /at most 30 moments/);
    refuses(
      () =>
        parseNote(
          review({
            marks: Array.from({ length: VOD_MARKS_MAX + 1 }, (_, at) => ({ at, text: "x" }))
          }),
          known
        ),
      /at most 30 moments/
    );
    refuses(() => parseNote(review({ marks: [null] }), known), /must be a JSON object/);
  });

  test("only a review has a link and moments; a note that is read back carries empty ones and is fine", () => {
    refuses(
      () => parseNote({ kind: "goal", title: "x", url: "https://youtu.be/abc" }, known),
      /Only a video review/
    );
    refuses(
      () => parseNote({ kind: "mechanic", title: "x", marks: [{ at: 1, text: "x" }] }, known),
      /Only a video review/
    );
    refuses(
      () => parseNote(review({ steps: [{ skillId: "1101" }] }), known),
      /Only a combo has steps/
    );
    // what the page sends back when only the status changes
    for (const kind of ["goal", "mechanic"]) {
      const note = parseNote(
        { kind, title: "x", heroId: null, status: "practicing", steps: [], url: null, marks: [] },
        known
      );
      assert.deepEqual(
        [note.status, note.steps, note.url, note.marks],
        ["practicing", [], null, []]
      );
    }
    refuses(
      () => parseNote({ kind: "combo", heroId: "h01", title: "x", steps: [] }, known),
      /at least one step/
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the video reviews of a notebook (database)", { skip }, () => {
  const review = (overrides = {}) => ({
    kind: "vod",
    heroId: "h01",
    title: "Scrim vs Wolves",
    body: "Look at my rotations",
    url: "https://youtu.be/abc",
    marks: [
      { at: 750, text: "flash missed" },
      { at: 30, text: "early ping" }
    ],
    ...overrides
  });

  test("a review is kept with its link and its moments in order, read back, changed, and private", async () => {
    const owner = await app.signIn("VodOwner");
    const other = await app.signIn("VodOther");
    const created = await owner.browser.post("/api/training/notes", review());
    assert.equal(created.status, 200, created.text);
    assert.equal(created.body.kind, "vod");
    assert.equal(created.body.url, "https://youtu.be/abc");
    assert.deepEqual(created.body.marks, [
      { at: 30, text: "early ping" },
      { at: 750, text: "flash missed" }
    ]);
    const goal = await owner.browser.post("/api/training/notes", {
      kind: "goal",
      title: "Wave control",
      heroId: "h02"
    });
    assert.equal(goal.status, 200, goal.text);
    assert.deepEqual([goal.body.url, goal.body.marks], [null, []], "the other kinds have none");

    const listed = (await owner.browser.get("/api/training/notes?kind=vod")).body.notes;
    assert.deepEqual(
      listed.map(note => [note.title, note.url, note.marks.length]),
      [["Scrim vs Wolves", "https://youtu.be/abc", 2]]
    );
    assert.equal((await owner.browser.get("/api/training/notes?heroId=h01")).body.notes.length, 1);
    assert.deepEqual((await other.browser.get("/api/training/notes")).body.notes, []);
    assert.equal(
      (await other.browser.put(`/api/training/notes/${created.body.id}`, review({ title: "Mine" })))
        .status,
      404
    );

    const changed = await owner.browser.put(
      `/api/training/notes/${created.body.id}`,
      review({
        url: "https://www.twitch.tv/videos/99",
        marks: [{ at: 3723, text: "late rotation" }],
        status: "practicing"
      })
    );
    assert.equal(changed.status, 200, changed.text);
    assert.deepEqual(
      [changed.body.url, changed.body.marks, changed.body.status],
      ["https://www.twitch.tv/videos/99", [{ at: 3723, text: "late rotation" }], "practicing"]
    );
    const emptied = await owner.browser.put(
      `/api/training/notes/${created.body.id}`,
      review({ marks: [] })
    );
    assert.deepEqual(emptied.body.marks, [], "the moments can all be removed");
    // it can become another kind: the link and the moments go with the review
    const turned = await owner.browser.put(`/api/training/notes/${created.body.id}`, {
      kind: "mechanic",
      title: "Scrim vs Wolves",
      heroId: "h01"
    });
    assert.deepEqual(
      [turned.body.kind, turned.body.url, turned.body.marks],
      ["mechanic", null, []]
    );
  });

  test("what is not fine is refused with a reason and nothing is kept", async () => {
    const owner = await app.signIn("VodStrict");
    for (const [body, pattern] of [
      [review({ heroId: null }), /belongs to a hero/],
      [review({ url: "http://youtu.be/abc" }), /https/],
      [review({ url: "javascript:alert(1)" }), /https/],
      [review({ url: "https://user:pw@youtu.be/abc" }), /https/],
      [review({ marks: [{ at: 99_999, text: "x" }] }), /between 0:00/],
      [
        review({
          marks: Array.from({ length: VOD_MARKS_MAX + 1 }, (_, at) => ({ at, text: "x" }))
        }),
        /at most 30 moments/
      ],
      [{ kind: "goal", title: "x", url: "https://youtu.be/abc" }, /Only a video review/]
    ]) {
      const reply = await owner.browser.post("/api/training/notes", body);
      assert.equal(reply.status, 400, reply.text);
      assert.match(reply.text, pattern);
    }
    assert.deepEqual((await owner.browser.get("/api/training/notes")).body.notes, []);
  });

  test("a note read back can be sent back with only its status changed, whatever its kind", async () => {
    const owner = await app.signIn("VodStatus");
    const made = [
      await owner.browser.post("/api/training/notes", { kind: "goal", title: "A goal" }),
      await owner.browser.post("/api/training/notes", {
        kind: "mechanic",
        title: "A mechanic",
        heroId: "h02"
      }),
      await owner.browser.post("/api/training/notes", {
        kind: "combo",
        title: "A combo",
        heroId: "h01",
        steps: [{ skillId: "1101", hint: "" }]
      }),
      await owner.browser.post("/api/training/notes", review())
    ];
    for (const reply of made) {
      assert.equal(reply.status, 200, reply.text);
      const again = await owner.browser.put(`/api/training/notes/${reply.body.id}`, {
        ...reply.body,
        status: "mastered"
      });
      assert.equal(again.status, 200, `${reply.body.kind}: ${again.text}`);
      assert.equal(again.body.status, "mastered");
      assert.deepEqual([again.body.url, again.body.marks], [reply.body.url, reply.body.marks]);
    }
  });

  test("a shared space shows the link and the moments to the people it is shared with", async () => {
    const owner = await app.signIn("VodSharer");
    await owner.browser.post("/api/training/notes", review());
    const { token } = (await owner.browser.post("/api/space/links", { sections: ["training"] }))
      .body;
    const seen = await app.browser().post("/api/space/open", { token });
    assert.equal(seen.status, 200, seen.text);
    const [note] = seen.body.training.notes;
    assert.deepEqual(
      [note.kind, note.url, note.marks.map(mark => mark.at)],
      ["vod", "https://youtu.be/abc", [30, 750]]
    );
  });
});
