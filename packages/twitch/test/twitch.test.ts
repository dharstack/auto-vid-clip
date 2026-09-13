import assert from "node:assert/strict";
import test from "node:test";
import {
  getLatestArchivedVod,
  getArchivedVods,
  normalizeTwitchChannel,
  resolveVodById,
  resolveLatestArchivedVod
} from "../src/index.js";

test("normalizes supported Twitch channel inputs", () => {
  assert.equal(normalizeTwitchChannel("mauledbygrizzly"), "mauledbygrizzly");
  assert.equal(normalizeTwitchChannel("https://twitch.tv/mauledbygrizzly"), "mauledbygrizzly");
  assert.equal(
    normalizeTwitchChannel("https://www.twitch.tv/mauledbygrizzly/videos"),
    "mauledbygrizzly"
  );
});

test("rejects non-channel Twitch URLs", () => {
  assert.throws(() => normalizeTwitchChannel("https://twitch.tv/videos/123"), /TWITCH_CHANNEL_INVALID/);
});

test("selects newest archived VOD", () => {
  const vod = getLatestArchivedVod("mauledbygrizzly", [
    {
      id: "old",
      title: "Old run",
      duration: "1h2m3s",
      created_at: "2026-01-01T00:00:00Z",
      type: "archive",
      url: "https://www.twitch.tv/videos/old"
    },
    {
      id: "new",
      title: "Mortal Shell II",
      duration: "3h40m40s",
      created_at: "2026-01-02T00:00:00Z",
      type: "archive",
      url: "https://www.twitch.tv/videos/new"
    },
    {
      id: "highlight",
      title: "Highlight",
      duration: "10m",
      created_at: "2026-01-03T00:00:00Z",
      type: "highlight",
      url: "https://www.twitch.tv/videos/highlight"
    }
  ]);

  assert.equal(vod.vodId, "new");
  assert.equal(vod.durationSeconds, 13240);
});

test("resolves user then latest archived VOD through Helix client", async () => {
  const resolved = await resolveLatestArchivedVod("https://twitch.tv/mauledbygrizzly/videos", {
    async getUserByLogin(login) {
      assert.equal(login, "mauledbygrizzly");
      return { id: "user-1", login, display_name: "MauledByGrizzly" };
    },
    async getVideosByUserId(userId, options) {
      assert.equal(userId, "user-1");
      assert.deepEqual(options, { type: "archive", first: 1 });
      return [
        {
          id: "123456",
          title: "Mortal Shell II",
          duration: "2h",
          created_at: "2026-01-01T00:00:00Z",
          type: "archive",
          url: "https://www.twitch.tv/videos/123456"
        }
      ];
    }
  });

  assert.deepEqual(resolved, {
    provider: "twitch",
    channel: "mauledbygrizzly",
    vodId: "123456",
    title: "Mortal Shell II",
    durationSeconds: 7200
  });
});

test("lists recent archived VODs with requested limit", async () => {
  const vods = await getArchivedVods("mauledbygrizzly", {
    async getUserByLogin() { return { id: "user-1", login: "mauledbygrizzly" }; },
    async getVideosByUserId(userId, options) {
      assert.equal(userId, "user-1");
      assert.deepEqual(options, { type: "archive", first: 2 });
      return [
        { id: "old", title: "Old", duration: "1h", created_at: "2026-01-01T00:00:00Z", type: "archive" },
        { id: "new", title: "New", duration: "2h", created_at: "2026-01-02T00:00:00Z", type: "archive" }
      ];
    }
  }, 2);
  assert.equal(vods.length, 2);
  assert.equal(vods[0].vodId, "new");
  assert.equal(vods[0].url, "https://www.twitch.tv/videos/new");
});

test("resolves exact VOD ID without resolving channel latest", async () => {
  const vod = await resolveVodById("2872824469", {
    async getUserByLogin() { throw new Error("must not resolve channel"); },
    async getVideosByUserId() { throw new Error("must not list channel"); },
    async getVideoById(vodId) {
      assert.equal(vodId, "2872824469");
      return { id: vodId, title: "Immoral Shell 6", duration: "5h9m58s", created_at: "2026-09-12T00:00:00Z", type: "archive", user_login: "mauledbygrizzly" };
    }
  });
  assert.equal(vod.vodId, "2872824469");
  assert.equal(vod.channel, "mauledbygrizzly");
  assert.equal(vod.durationSeconds, 18598);
});
