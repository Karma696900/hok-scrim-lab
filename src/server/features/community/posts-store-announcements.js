// posts store, announcements: createPost, listPosts, openPostCount, closePost.
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { isStaff, staffList, teamCard } from "./store-helpers.js";
import { randomUUID } from "node:crypto";

// ---- announcements --------------------------------------------------------------------------
export async function createPost(ctx, userId, input, now = Date.now()) {
  if (!(await isStaff(ctx.pool, input.teamId, userId))) {
    throw forbidden("Only the staff and the captain can do this.");
  }
  const [[{ n }]] = await ctx.pool.query(
    "SELECT COUNT(*) AS n FROM scrim_posts WHERE team_id = ? AND closed = 0 AND ends_at > ?",
    [input.teamId, now]
  );
  if (Number(n) >= 5) {
    throw conflict("A team can have at most {max} open announcements.", "too_many_posts", {
      max: 5
    });
  }
  const id = randomUUID();
  await ctx.pool.execute(
    "INSERT INTO scrim_posts (id, team_id, created_by, starts_at, ends_at, format, hero_rule, control, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.teamId,
      userId,
      input.startsAt,
      input.endsAt,
      input.format,
      input.heroRule,
      input.control,
      input.note,
      now
    ]
  );
  return id;
}

export async function listPosts(
  ctx,
  {
    from = null,
    to = null,
    level = "",
    format = null,
    heroRule = "",
    control = "",
    minHours = 0,
    region = "",
    mineOf = null,
    page = 1,
    pageSize = 20
  },
  now = Date.now()
) {
  const where = ["p.closed = 0", "p.ends_at > ?"],
    values = [now];
  if (from !== null && to !== null) {
    where.push("p.starts_at < ? AND p.ends_at > ?");
    values.push(to, from);
  }
  if (level) {
    where.push("t.level = ?");
    values.push(level);
  }
  if (region) {
    where.push("t.region = ?");
    values.push(region);
  }
  if (format) {
    where.push("p.format = ?");
    values.push(format);
  }
  if (heroRule) {
    where.push("p.hero_rule = ?");
    values.push(heroRule);
  }
  if (control) {
    where.push("p.control = ?");
    values.push(control);
  }
  if (minHours) {
    where.push("p.ends_at - p.starts_at >= ?");
    values.push(minHours * 3600_000);
  }
  // only the announcements of the teams this person is staff of (those they can close)
  if (mineOf) {
    where.push(
      `p.team_id IN (SELECT team_id FROM team_members WHERE user_id = ? AND role IN (${staffList}))`
    );
    values.push(mineOf);
  }
  const [[{ total }]] = await ctx.pool.query(
    `SELECT COUNT(*) AS total FROM scrim_posts p JOIN teams t ON t.id = p.team_id WHERE ${where.join(" AND ")}`,
    values
  );
  const [rows] = await ctx.pool.query(
    `SELECT p.*, t.id AS t_id, t.name AS t_name, t.tag AS t_tag, t.level AS t_level, t.region AS t_region, t.timezone AS t_timezone, t.logo_version AS t_logo_version FROM scrim_posts p JOIN teams t ON t.id = p.team_id WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize]
  );
  return {
    total: Number(total),
    page,
    pageSize,
    items: rows.map(row => ({
      id: row.id,
      startsAt: Number(row.starts_at),
      endsAt: Number(row.ends_at),
      format: row.format,
      heroRule: row.hero_rule,
      control: row.control,
      note: row.note,
      createdAt: Number(row.created_at),
      team: teamCard(row, "t_")
    }))
  };
}

export async function openPostCount(ctx, now = Date.now()) {
  const [[{ n }]] = await ctx.pool.query(
    "SELECT COUNT(*) AS n FROM scrim_posts WHERE closed = 0 AND ends_at > ?",
    [now]
  );
  return Number(n);
}

export async function closePost(ctx, postId, userId) {
  const [[post]] = await ctx.pool.query("SELECT team_id FROM scrim_posts WHERE id = ?", [postId]);
  if (!post) {
    throw notFound("Announcement not found.");
  }
  if (!(await isStaff(ctx.pool, post.team_id, userId))) {
    throw forbidden("Only the staff and the captain can do this.");
  }
  await ctx.pool.execute("UPDATE scrim_posts SET closed = 1 WHERE id = ?", [postId]);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createPost, listPosts, openPostCount, closePost };
