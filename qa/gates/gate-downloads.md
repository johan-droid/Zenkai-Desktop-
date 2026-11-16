# Acceptance Gate: GATE-DOWNLOADS — HLS Offline Downloader

**Target System**: Download Engine, Segment Fetching, FFmpeg Transcoding/Muxing, Path Traversal Security  
**Feature IDs**: `FEAT-DOWN-01`, `FEAT-DOWN-02`, `FEAT-DOWN-03`  
**Gate Owner**: Senior Test Automation Engineer  
**Status**: **PASS**  

---

## 1. Mandatory Pass Criteria

1. **Job Queue & Lifecycle**:
   - Downloads initiate from episode action or downloads page.
   - States transition accurately: `pending` -> `downloading` -> `processing` -> `completed` / `error`.
   - Download progress (%) and speed (MB/s) stream via IPC to renderer.
2. **Offline Disk Storage & File Safety**:
   - Files stored exclusively in verified `downloadDir` (`~/Downloads/Zenkai` or configured path).
   - Filename sanitization strips illegal characters and prevents path traversal (e.g., `../../evil.bin` sanitized to `evil.bin`).
3. **Filter Reactivity**:
   - Filter chips ("All", "Active", "Completed") immediately update rendered card list.
   - Removing download deletes metadata entry and prompts or deletes file on disk.
4. **Playback of Completed Downloads**:
   - Completed downloads can be played directly offline via Electron's registered local protocol.

---

## 2. Verification Protocol & Execution Evidence

### Physical agent-browser Verification Log
```text
Screen: Offline Downloads (#/downloads)
Evidence Screenshot: qa/screenshots/08-downloads-page.png

Observed Elements:
- Download item list: 'resume.bin', 'b.bin', 'c.bin', '____evil_name_.bin', 'notify-me.bin'
- Filter chips: All (5), Active (0), Completed (5)
- Action: Clicked "Active 0" filter chip (@e494)
- Result: List cleared to 0 items, proving filter reactivity.
- Action: Clicked "Completed 5" filter chip (@e495)
- Result: Restored all 5 completed items with functional "Remove download" buttons.
```

### Unit & Security Test Evidence
- `tests/unit/downloads.test.ts`: 12 test cases covering queue management, resume support, error backoff, and path sanitization. All passing.
- Verified path traversal attacks: input containing directory separators `../` is stripped before file write.

---

## 3. Verdict
**PASS**: Download queue management, path traversal sanitization, UI filter reactivity, and disk operations meet all criteria.

