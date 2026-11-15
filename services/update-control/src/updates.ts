import type { ReleaseRecord, UpdateCheckParams, UpdateCheckResult } from "./types.js";
import { evaluateUpdateEligibility } from "./rollout.js";

export class UpdateRegistry {
  private releases = new Map<string, ReleaseRecord>();
  private processedDeliveries = new Set<string>();

  constructor(initialReleases: ReleaseRecord[] = []) {
    for (const r of initialReleases) {
      this.releases.set(r.tag, r);
    }
  }

  /**
   * Idempotent check for webhook delivery ID.
   */
  public isDeliveryProcessed(deliveryId: string): boolean {
    return this.processedDeliveries.has(deliveryId);
  }

  public markDeliveryProcessed(deliveryId: string): void {
    this.processedDeliveries.add(deliveryId);
    // Keep set bounded to last 1000 deliveries
    if (this.processedDeliveries.size > 1000) {
      const first = this.processedDeliveries.values().next().value;
      if (first) this.processedDeliveries.delete(first);
    }
  }

  public registerRelease(record: ReleaseRecord): void {
    this.releases.set(record.tag, record);
  }

  public getRelease(tag: string): ReleaseRecord | undefined {
    return this.releases.get(tag);
  }

  public getReleaseByVersion(version: string): ReleaseRecord | undefined {
    const cleanVer = version.replace(/^v/, "");
    for (const r of this.releases.values()) {
      if (r.version === cleanVer) return r;
    }
    return undefined;
  }

  public getAllReleases(): ReleaseRecord[] {
    return Array.from(this.releases.values());
  }

  /**
   * Withdraw a release immediately (emergency shutdown of an update).
   */
  public withdrawRelease(tag: string): boolean {
    const r = this.releases.get(tag);
    if (!r) return false;
    r.withdrawn = true;
    return true;
  }

  /**
   * Update the rollout percentage for a staged release (0 to 100).
   */
  public setRolloutPercentage(tag: string, percentage: number): boolean {
    const r = this.releases.get(tag);
    if (!r) return false;
    r.rolloutPercentage = Math.max(0, Math.min(100, percentage));
    return true;
  }

  /**
   * Check for updates for a specific client.
   */
  public checkForUpdates(params: UpdateCheckParams): UpdateCheckResult {
    return evaluateUpdateEligibility(this.getAllReleases(), params);
  }
}
