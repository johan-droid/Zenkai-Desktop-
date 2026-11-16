# Zenkai Desktop — Updater Operations & Incident Playbook

**Document Version:** 1.0.0  
**Scope:** Operating the update infrastructure, rollout stages, canary monitoring, and emergency rollbacks.

---

## 1. Update Infrastructure Components

The update ecosystem consists of three components:
1. **Desktop Client Engine**: `src/main/renderer-updater.ts` (OTA) and `src/main/updater.ts` (Native).
2. **Update Control Backend**: `services/update-control/` (Microservice managing staged rollouts, version manifests, and webhooks).
3. **Distribution Edge CDN**: Cloudflare Pages / GitHub Releases hosting version manifests (`manifest.json`, `latest-linux.yml`, `latest.yml`) and signed bundles.

---

## 2. Staged Rollout Strategy

When publishing an OTA renderer update or native release:

```text
Staging (Internal / QA) ──► 10% Canary ──► 50% Phased ──► 100% General Availability
```

1. **Phase 1: Canary Deploy (10%)**:
   - The update server targets 10% of reporting client machine IDs.
   - Telemetry monitors error rates and automated canary rollbacks for 2 hours.
2. **Phase 2: Expanded Phased Deploy (50%)**:
   - Released to 50% of the active user base if error rates remain below 0.05%.
3. **Phase 3: General Availability (100%)**:
   - Full distribution to all users.

---

## 3. Emergency Incident Playbook: Bad Release Rollback

If a critical defect or widespread blank screen is detected after deploying an OTA update:

### Step 1: Invalidate Update Manifest at Edge
Set `enabled: false` or roll back the version string in `manifest.json` on the distribution CDN:
```bash
# Example via update control CLI or git push to CDN branch
git revert HEAD
git push origin cdn-releases
```

### Step 2: Trigger Emergency Rollout Block
Clients running the broken update will trigger their internal 5-second canary health watchdog upon restart and automatically fall back to the factory-bundled assets.

### Step 3: Re-publish Prior Stable Version
Bump the patch version with the reverted bundle to ensure all connected clients update immediately to the known-good baseline.

