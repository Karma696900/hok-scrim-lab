import { bindTo } from "../../../shared/bind-to.js";
import { onView as postsStoreAnnouncements } from "./posts-store-announcements.js";

/** Scrim announcements ("looking for a scrim"): publishing, listing and closing them. */
export function createPostsStore({ pool }) {
  const ctx = { pool };
  bindTo(ctx, postsStoreAnnouncements);

  return {
    createPost: ctx.createPost,

    listPosts: ctx.listPosts,

    openPostCount: ctx.openPostCount,

    closePost: ctx.closePost
  };
}
