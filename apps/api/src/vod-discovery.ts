import { WorkflowEntrypoint } from "cloudflare:workers";

export interface VodDiscoveryWorkflowInput { broadcasterId?: string }

/** Workflow entrypoint. Actual Twitch/D1 work runs in durable step callback. */
export class VodDiscoveryWorkflow extends WorkflowEntrypoint<unknown, VodDiscoveryWorkflowInput> {
  async run(event: { payload: VodDiscoveryWorkflowInput }, step: { do<T>(name: string, work: () => Promise<T>): Promise<T> }): Promise<{ discovered: boolean }> {
    return step.do("reconcile watched VODs", async () => {
      const env = this.env as { reconcileWatchedChannels?: (broadcasterId?: string) => Promise<boolean> };
      return { discovered: await (env.reconcileWatchedChannels?.(event.payload.broadcasterId) ?? false) };
    });
  }
}
