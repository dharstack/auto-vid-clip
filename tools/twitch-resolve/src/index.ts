#!/usr/bin/env node
import { printToolResult, positionalArg, toToolError } from "@auto-clipper/tooling";
import { createTwitchAppTokenProvider, FetchTwitchHelixClient, resolveLatestArchivedVod } from "@auto-clipper/twitch";

async function main(): Promise<void> {
  try {
    const input = positionalArg(process.argv.slice(2), 0);
    if (!input) {
      throw new Error("ARG_REQUIRED: twitch channel or URL");
    }

    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("TWITCH_CREDENTIALS_REQUIRED: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET");
    }

    const accessToken = await createTwitchAppTokenProvider({ clientId, clientSecret }).getAccessToken();
    const data = await resolveLatestArchivedVod(input, new FetchTwitchHelixClient({ clientId, accessToken }));
    printToolResult({ status: "ok", data });
  } catch (error) {
    printToolResult(toToolError(error, "TWITCH_RESOLVE_FAILED"));
    process.exitCode = 1;
  }
}

await main();
