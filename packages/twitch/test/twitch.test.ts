import assert from "node:assert/strict";
import test from "node:test";
import {
  getLatestArchivedVod,
  normalizeTwitchChannel,
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
