# Nav Session Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survive mobile browser backgrounding and page kill/reload by persisting a 2h nav snapshot and rebinding GPS/heading/voice on resume, with a confirm bar on cold restore.

**Architecture:** `sessionStorage` snapshot via `navSession.js`; `visibilitychange`/`pageshow` rebinds live listeners when still navigating; cold start shows resume confirm UI before entering navigating.

**Tech Stack:** Vue 3, existing `useGeolocation` / `useDeviceHeading` / `navVoice`, sessionStorage

## Global Constraints

- TTL: 7200000 ms (2 hours)
- Storage: sessionStorage key `h5nav:session`
- Cold start: confirm bar required (继续导航 / 放弃)
- Soft resume (page still alive): no confirm bar
- No Service Worker / background GPS

---

### Task 1: navSession + policy knobs

**Files:**
- Create: `src/lib/navSession.js`
- Modify: `src/config/behaviorPolicy.js`

- [ ] Add `navSessionTtlMs: 7200000`, `navSessionPersistThrottleMs: 15000`, `navSessionPersistMinMeters: 50`, `navVoiceRelockHiddenMs: 30000` to policy + normalize
- [ ] Implement save/load/clear/isFresh/buildFromState helpers
- [ ] Verify: `npm run build` or node import smoke

### Task 2: restartWatch + heading rebind + voice page hooks

**Files:**
- Modify: `src/composables/useGeolocation.js`
- Modify: `src/composables/useDeviceHeading.js`
- Modify: `src/lib/navVoice.js`

- [ ] `restartWatch(onUpdate)` = stopWatch + watchLocation
- [ ] `rebind()` = stop + bind (no permission prompt)
- [ ] `onNavVoicePageHidden` / `onNavVoicePageVisible({ hiddenMs })`

### Task 3: NavMap soft resume (A) + persist writes

**Files:**
- Modify: `src/components/NavMap.vue`

- [ ] visibility/pageshow handlers when `navigating`
- [ ] save session on nav start / reroute / throttled progress
- [ ] clear session on stop / clear destination / arrive

### Task 4: Confirm bar + cold restore (B)

**Files:**
- Modify: `src/components/NavMap.vue`, `src/style.css`

- [ ] After map ready, load session → show resume banner
- [ ] Continue (sync voice unlock) / Discard
- [ ] Build + manual checklist from spec
