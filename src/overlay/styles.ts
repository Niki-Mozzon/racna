// All overlay CSS, as a string injected into the shadow root by index.ts. The
// shadow boundary already isolates us from the page, and `:host { all: initial }`
// below resets every inherited property so nothing leaks *in* either; the
// overlay renders identically regardless of the host page's styles.
export const CSS = `
:host {
  all: initial;
  display: block;
  font-family: ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;

  /* ── Theme tokens: dark (default) ──
   * These reproduce the original hard-coded palette exactly, so the dark theme
   * is unchanged. The light theme is just the override block below: flip these
   * variables and every rule that reads them re-themes. Accent (purple) and
   * status colours (red/orange/green) are intentionally NOT tokenised, as they
   * read well on both backgrounds and stay literal throughout. */
  color-scheme: dark;
  --surface: #0d0d11;        /* solid panel / modal background */
  --surface-2: #1a1a22;      /* raised surface: native <select> options */
  --surf-rgb: 13, 13, 17;    /* translucent surfaces (badge/panel/toast/flood) */
  --fg-rgb: 255, 255, 255;   /* hairlines, hover washes, scrollbars (flips white→dark) */
  --scrim: rgba(0, 0, 0, 0.75);   /* modal backdrop */
  --inset: rgba(0, 0, 0, 0.3);    /* code / preview / textarea wells */
  --txt-1: #d0d0d8;          /* primary text */
  --txt-2: #c0c0d0;
  --txt-3: #909098;          /* secondary text */
  --txt-4: #707080;
  --txt-5: #606070;          /* dim labels */
  --txt-6: #505060;          /* faint labels */
  --txt-7: #404050;          /* faintest */
}

/* ── Theme tokens: light ──
 * Applied when index.ts toggles the theme-light class onto the shadow host. The white
 * foreground channel becomes a dark one (so every hairline/hover wash inverts),
 * surfaces go pale, and the text ramp flips dark-on-light. */
:host(.theme-light) {
  color-scheme: light;
  --surface: #ffffff;
  --surface-2: #ffffff;
  --surf-rgb: 250, 250, 252;
  --fg-rgb: 20, 22, 32;
  --scrim: rgba(20, 22, 32, 0.35);
  --inset: rgba(20, 22, 32, 0.05);
  --txt-1: #1c1e26;
  --txt-2: #2c2e38;
  --txt-3: #565862;
  --txt-4: #6c6e78;
  --txt-5: #80828c;
  --txt-6: #9698a2;
  --txt-7: #aaacb6;
}
* { box-sizing: border-box; }

.root {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  min-height: 100%;
  padding: 24px 16px;
  pointer-events: none;
  position: relative;
  z-index: 2;
}

/* ── Position ──
 * Bottom-right is the base above. The other three corners are host-class
 * overrides (applied by applyPosition in index.ts): flip the .root alignment,
 * re-anchor the toast, and move the panel's resize handle to the inner edge.
 * align-items is the cross axis (horizontal); justify-content the main axis
 * (vertical) since .root is a column. */
:host(.pos-bottom-left) .root { align-items: flex-start; }
:host(.pos-top-right) .root { justify-content: flex-start; }
:host(.pos-top-left) .root { align-items: flex-start; justify-content: flex-start; }

:host(.pos-bottom-left) .racna-toast { left: 16px; right: auto; }
:host(.pos-top-right) .racna-toast { top: 80px; bottom: auto; }
:host(.pos-top-left) .racna-toast { top: 80px; bottom: auto; left: 16px; right: auto; }

/* Left-anchored: resize from the right edge (the panel's inner edge). */
:host(.pos-bottom-left) .resize-handle,
:host(.pos-top-left) .resize-handle { left: auto; right: 0; }

/* ── Badge ── */
.badge {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(var(--surf-rgb),0.90);
  border: 1px solid rgba(var(--fg-rgb),0.10);
  border-radius: 20px;
  padding: 5px 11px;
  color: var(--txt-1);
  font-size: 11px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  user-select: none;
  transition: transform 0.1s, background 0.15s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
}
.badge:hover { background: rgba(var(--surf-rgb),0.96); transform: scale(1.05); }
.badge.unseen, .badge.alarm {
  background: rgba(160,25,25,0.92);
  border-color: rgba(255,80,80,0.3);
  box-shadow: 0 2px 16px rgba(255,50,50,0.45);
}
/* Unseen: a soft glow pulse. Alarm (capture paused by flood or cap): a smooth
   opacity blink that reads as "stopped" and draws the user to open the panel.
   When both apply, the later rule (alarm) wins, so the alarm takes over. */
.badge.unseen { animation: badge-pulse 2s ease-in-out infinite; }
.badge.alarm { animation: badge-blink 1s ease-in-out infinite; }
@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 2px 16px rgba(255,50,50,0.45); }
  50%       { box-shadow: 0 2px 26px rgba(255,50,50,0.75); }
}
@keyframes badge-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.bcount { color: var(--txt-1); font-size: 12px; font-weight: 600; }
.badge.unseen .bcount, .badge.alarm .bcount { color: #fff; }

/* ── Panel ── */
.panel {
  pointer-events: auto;
  position: relative;
  background: rgba(var(--surf-rgb),0.95);
  border: 1px solid rgba(var(--fg-rgb),0.09);
  border-radius: 8px;
  width: 460px;
  min-width: 300px;
  max-width: calc(100vw - 32px);
  max-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--txt-1);
}
.resize-handle {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 5px;
  cursor: ew-resize;
  z-index: 1;
}
.resize-handle:hover, .resize-handle.dragging { background: rgba(170,102,255,0.25); }

.pheader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  background: rgba(var(--fg-rgb),0.035);
  border-bottom: 1px solid rgba(var(--fg-rgb),0.07);
  flex-shrink: 0;
}
.pheader-selection {
  background: rgba(170,102,255,0.08);
  border-bottom-color: rgba(170,102,255,0.25);
}
.psel-count {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: #c89aff;
  letter-spacing: 0.3px;
}
.panel.selecting .entry { cursor: pointer; }
.panel.selecting .entry.expandable:hover { background: rgba(170,102,255,0.05); }
.panel.selecting .entry-btn,
.panel.selecting .chevron { display: none; }
.entry.selected { background: rgba(170,102,255,0.10); box-shadow: inset 3px 0 0 #aa66ff; }
.entry.selected:hover { background: rgba(170,102,255,0.14) !important; }
.ptitle {
  flex: 1;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--txt-5);
}
.pbtn {
  background: rgba(var(--fg-rgb),0.06);
  border: 1px solid rgba(var(--fg-rgb),0.09);
  color: var(--txt-3);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: inherit;
  transition: background 0.1s, color 0.1s;
}
.pbtn:hover:not(:disabled) { background: rgba(var(--fg-rgb),0.12); color: var(--txt-1); }
.pbtn:disabled { opacity: 0.5; cursor: default; }
.pbtn-close { padding: 1px 7px; font-size: 14px; }

.plist {
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--fg-rgb),0.15) transparent;
}
.plist::-webkit-scrollbar { width: 4px; }
.plist::-webkit-scrollbar-thumb { background: rgba(var(--fg-rgb),0.15); border-radius: 2px; }

/* ── Entries ── */
@keyframes radar-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(350%); }
}
.panel::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 25%;
  height: 2px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(170,102,255,0.8), transparent);
  animation: radar-sweep 3s ease-in-out infinite alternate;
  z-index: 2;
  transition: opacity 0.4s ease;
}
/* Capture paused (flood or cap): fade the sweep out (it reads as "not
   scanning") and halt it so it isn't burning frames behind opacity 0. */
.panel.paused::after {
  opacity: 0;
  animation-play-state: paused;
}
.entry {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(var(--fg-rgb),0.035);
}
.entry.expandable { cursor: pointer; }
.entry.expandable:hover { background: rgba(var(--fg-rgb),0.02); }

.emain {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.chevron { font-size: 9px; color: var(--txt-6); flex-shrink: 0; width: 10px; }
.eicon   { font-size: 12px; flex-shrink: 0; display: inline-flex; align-self: center; }
.entry.err .eicon  { color: #ff5555; }
.entry.warn .eicon { color: #ffaa33; }
.entry.net .eicon  { color: #aa66ff; }
.entry.rej .eicon  { color: #ff7777; }

.emsg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.entry.err .emsg  { color: #ff8080; }
.entry.warn .emsg { color: #ffcc66; }
.entry.rej .emsg  { color: #ff9999; }

.emethod { font-size: 10px; color: var(--txt-5); flex-shrink: 0; font-weight: 700; letter-spacing: 0.5px; }
.estatus { font-size: 11px; font-weight: 700; flex-shrink: 0; min-width: 26px; }
.serr  { color: #ff5555; }
.s5xx  { color: #ff5555; }
.s4xx  { color: #ffaa33; }
.sother { color: #55cc88; }
.epath { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #9988cc; }

.count { font-size: 10px; color: var(--txt-6); flex-shrink: 0; }
.count:empty { display: none; }
.etime { font-size: 10px; color: var(--txt-7); flex-shrink: 0; }

.entry-btn {
  opacity: 0;
  padding: 2px 5px;
  line-height: 0;
  background: transparent;
  border-color: transparent;
  color: var(--txt-6);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  transition: opacity 0.1s, color 0.1s;
  pointer-events: none;
}
.entry:hover .entry-btn { opacity: 1; pointer-events: auto; }
.entry:hover .ignore-btn:hover { color: #ff5555; background: rgba(255,85,85,0.1); border-color: rgba(255,85,85,0.2); }
.entry:hover .watch-btn:hover  { color: #ffaa33; background: rgba(255,170,51,0.1); border-color: rgba(255,170,51,0.2); }
.watch-btn.watching { opacity: 1; color: #ffaa33; pointer-events: auto; }
.pbtn-icon.watching { color: #ffaa33; }

.empty {
  padding: 18px;
  text-align: center;
  color: var(--txt-7);
  font-size: 11px;
}

/* Paused notice: a sticky strip at the top of the list shown when capture has
   stopped (entry cap, or flood). Stays put while the list scrolls so it's
   always seen. The flood variant carries a live count and an inline Resume. */
.pcap {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2px;
  text-align: center;
  color: #ffce80;
  background: rgba(255,170,51,0.14);
  border-bottom: 1px solid rgba(255,170,51,0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.drop-count { font-weight: 700; }
.pcap-btn {
  margin-left: 8px;
  padding: 1px 8px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  color: #ffce80;
  background: rgba(255,170,51,0.18);
  border: 1px solid rgba(255,170,51,0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.pcap-btn:hover { background: rgba(255,170,51,0.3); color: #ffd9a0; }
/* Light theme: the pale amber background needs dark amber text/controls; the
   dark-theme #ffce80 washes out on it. */
:host(.theme-light) .pcap { color: #8a5800; background: rgba(255,170,51,0.2); }
:host(.theme-light) .pcap-btn { color: #8a5800; border-color: rgba(180,120,0,0.5); }
:host(.theme-light) .pcap-btn:hover { background: rgba(255,170,51,0.38); color: #6e4600; }

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  pointer-events: auto;
}
.modal {
  background: var(--surface);
  border: 1px solid rgba(var(--fg-rgb),0.12);
  border-radius: 8px;
  width: 680px;
  max-width: 90vw;
  max-height: 80vh;
  margin-right: clamp(0px, calc(100vw - 720px), 240px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.8);
  overflow: hidden;
  color: var(--txt-1);
}
.modal-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(var(--fg-rgb),0.08);
  flex-shrink: 0;
  background: rgba(var(--fg-rgb),0.03);
}
.modal-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--txt-5);
}
.modal-title-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mstatus { font-size: 10px; font-weight: 700; flex-shrink: 0; }

.sicon-logo { width: 14px; height: 14px; flex-shrink: 0; display: block; }
.modal-body {
  overflow-y: auto;
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--fg-rgb),0.15) transparent;
}
.modal-body::-webkit-scrollbar { width: 4px; }
.modal-body::-webkit-scrollbar-thumb { background: rgba(var(--fg-rgb),0.15); border-radius: 2px; }
.msec-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--txt-4);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  transition: color 0.1s;
}
.msec-title-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.msec-chevron {
  font-size: 9px;
  width: 8px;
  display: inline-block;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.1s, color 0.1s;
}
.msec-empty { opacity: 0.4; }
.msec-empty .msec-title { cursor: default; }
.msec-empty-tag {
  font-size: 9px;
  font-weight: 600;
  text-transform: lowercase;
  letter-spacing: 0.5px;
  color: var(--txt-7);
  font-style: italic;
  margin-left: 6px;
}
.msec-collapsed .msec-title { color: var(--txt-2); }
.msec-collapsed .msec-chevron { color: #aa66ff; opacity: 1; }
.msec-collapsed:hover .msec-title { color: var(--txt-1); }
.msec-expanded:hover .msec-title { color: var(--txt-3); }
.msec-body {
  margin: 0;
  font-size: 11px;
  color: var(--txt-2);
  background: var(--inset);
  border-radius: 4px;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--fg-rgb),0.1) transparent;
  font-family: inherit;
}
.msec-body::-webkit-scrollbar { width: 3px; }
.msec-body::-webkit-scrollbar-thumb { background: rgba(var(--fg-rgb),0.1); border-radius: 2px; }

/* ── Toast ── */
@keyframes toast-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.racna-toast {
  position: fixed;
  bottom: 80px; right: 16px;
  z-index: 2147483647;
  width: 340px; max-width: calc(100vw - 32px);
  background: rgba(var(--surf-rgb),0.97);
  border: 1px solid rgba(var(--fg-rgb),0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  overflow: hidden;
  pointer-events: auto;
  animation: toast-in 0.2s ease;
}
.racna-toast.err  { border-left: 3px solid #ff5555; }
.racna-toast.warn { border-left: 3px solid #ffaa33; }
.racna-toast.net  { border-left: 3px solid #aa66ff; }
.racna-toast.rej  { border-left: 3px solid #ff9999; }
.toast-body { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; }
.toast-icon { font-size: 13px; flex-shrink: 0; display: inline-flex; padding-top: 1px; }
.racna-toast.err  .toast-icon { color: #ff5555; }
.racna-toast.warn .toast-icon { color: #ffaa33; }
.racna-toast.net  .toast-icon { color: #aa66ff; }
.racna-toast.rej  .toast-icon { color: #ff9999; }
.toast-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.toast-msg { font-size: 11px; color: var(--txt-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast-note {
  font-size: 10px;
  color: var(--txt-3);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 80px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--fg-rgb),0.1) transparent;
}
.toast-actions { display: flex; gap: 4px; flex-shrink: 0; padding-top: 1px; }
.snote-link { color: #c89aff; text-decoration: underline; word-break: break-all; }
.snote-link:hover { color: #d8b3ff; }

/* ── Settings Modal ── */
.smodal { width: 520px; }
.smodal .stab-panel { min-height: 480px; }
.smodal-body { padding: 14px 16px; gap: 14px; }
.ssec-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--txt-6);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(var(--fg-rgb),0.05);
}
.scredit {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--txt-4);
  text-decoration: none;
  transition: color 0.1s;
}
.scredit:hover { color: #c89aff; }
.srow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 12px;
  color: var(--txt-2);
  gap: 12px;
}
.srow > span { flex: 1; }
.srow em { display: block; font-style: normal; font-size: 10px; color: var(--txt-6); }
.srow.sdisabled { opacity: 0.4; pointer-events: none; }
.sswitch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}
.sswitch input { opacity: 0; width: 0; height: 0; position: absolute; }
.sslider {
  display: block;
  width: 32px;
  height: 18px;
  background: rgba(var(--fg-rgb),0.1);
  border-radius: 9px;
  position: relative;
  transition: background 0.2s;
}
.sslider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #888;
  border-radius: 50%;
  top: 3px;
  left: 3px;
  transition: transform 0.2s, background 0.2s;
}
.sswitch input:checked + .sslider { background: rgba(170,102,255,0.5); }
.sswitch input:checked + .sslider::before { transform: translateX(14px); background: #aa66ff; }
.sswitch-sm .sslider { width: 22px; height: 12px; border-radius: 6px; }
.sswitch-sm .sslider::before { width: 8px; height: 8px; top: 2px; left: 2px; }
.sswitch-sm input:checked + .sslider::before { transform: translateX(10px); }
.sselect {
  background: rgba(var(--fg-rgb),0.06);
  border: 1px solid rgba(var(--fg-rgb),0.1);
  color: var(--txt-1);
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  flex-shrink: 0;
  color-scheme: inherit;
}
.sselect:focus { border-color: rgba(170,102,255,0.5); }
.sselect option, .sselect optgroup {
  background: var(--surface-2);
  color: var(--txt-1);
}
.sselect option:disabled { color: var(--txt-6); }
.ai-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.ai-flag-text { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: var(--txt-5); }
.ai-flag:hover .ai-flag-text { color: var(--txt-3); }
.srule-row { padding: 5px 0; border-bottom: 1px solid rgba(var(--fg-rgb),0.05); }
.srule-row:last-child { border-bottom: none; }
.srule-line { display: flex; align-items: center; gap: 6px; }
.srule-icon { flex-shrink: 0; display: inline-flex; font-size: 13px; line-height: 0; color: var(--txt-4); }
.srule-icon.cons { color: #ff5555; }
.srule-icon.net { color: #aa66ff; }
.srule-icon.watch { color: #aa66ff; }
.srule-desc {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--txt-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.srule-note-badge { flex-shrink: 0; display: inline-flex; line-height: 0; color: var(--txt-5); }
.srule-edit, .srule-del { flex-shrink: 0; }
.srule-note {
  margin-left: 20px;
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--txt-4);
  white-space: pre-wrap;
  word-break: break-word;
}
.srule-note a { color: #c89aff; }
.srules-empty { font-size: 11px; color: var(--txt-7); padding: 4px 0; }
.pbtn-icon { padding: 2px 5px; line-height: 0; display: inline-flex; align-items: center; }

/* ── Settings Tabs ── */
.stabs {
  display: flex;
  border-bottom: 1px solid rgba(var(--fg-rgb),0.07);
  background: rgba(var(--fg-rgb),0.02);
  flex-shrink: 0;
}
.stab {
  flex: 1;
  padding: 7px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--txt-6);
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.stab:hover { color: var(--txt-3); }
.stab.active { color: #aa66ff; border-bottom-color: #aa66ff; }

/* ── Rule Editor Modal ── */
.reeditor { width: 560px; }
.re-body {
  padding: 14px 16px;
  gap: 12px;
  display: flex;
  flex-direction: column;
}
.re-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(var(--fg-rgb),0.07);
  flex-shrink: 0;
}
.re-meta-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.re-meta-method { font-size: 10px; font-weight: 700; color: var(--txt-5); letter-spacing: 0.5px; }
.re-meta-status { font-size: 11px; font-weight: 700; }
.re-meta-hint { font-size: 10px; color: var(--txt-7); font-style: italic; }
.re-chips-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--txt-6); margin-bottom: 5px;
}
.re-path-chips, .re-query-chips {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 26px;
}
.re-sep { color: var(--txt-7); font-size: 12px; user-select: none; }
.re-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  background: rgba(var(--fg-rgb),0.07);
  border: 1px solid rgba(var(--fg-rgb),0.12);
  color: var(--txt-2);
  user-select: none;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.re-chip:hover { background: rgba(170,102,255,0.15); border-color: rgba(170,102,255,0.35); color: #d0c0ff; }
.re-chip.re-chip-wild {
  background: rgba(170,102,255,0.25);
  border-color: rgba(170,102,255,0.5);
  color: #cc99ff;
  font-weight: 600;
}
.re-chip.re-chip-wild:hover { background: rgba(170,102,255,0.18); border-color: rgba(170,102,255,0.35); color: #b090e0; }
.re-chip-all { background: rgba(255,170,51,0.08); border-color: rgba(255,170,51,0.2); color: #ffaa33; }
.re-chip-all:hover { background: rgba(255,170,51,0.18); border-color: rgba(255,170,51,0.4); }
.re-chip-all.re-chip-wild { background: rgba(255,170,51,0.28); border-color: rgba(255,170,51,0.55); color: #ffcc66; }
.re-chip-hint { font-size: 11px; color: var(--txt-7); font-style: italic; }
.re-console-ta {
  width: 100%;
  background: var(--inset);
  border: 1px solid rgba(var(--fg-rgb),0.1);
  border-radius: 4px;
  color: var(--txt-2);
  font-family: inherit;
  font-size: 11px;
  padding: 8px 10px;
  resize: vertical;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--fg-rgb),0.1) transparent;
}
.re-console-ta:focus { border-color: rgba(170,102,255,0.5); }
.re-preview-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--txt-6); margin-bottom: 4px;
}
.re-preview {
  font-size: 12px; color: #aa66ff;
  background: var(--inset);
  border-radius: 4px;
  padding: 8px 10px;
  word-break: break-all;
  white-space: pre-wrap;
  min-height: 32px;
  border: 1px solid rgba(170,102,255,0.2);
}
.re-note-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--txt-6); margin-top: 10px; margin-bottom: 4px;
}
.re-note-label em { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--txt-7); }
.re-note-ta {
  width: 100%;
  background: var(--inset);
  border: 1px solid rgba(var(--fg-rgb),0.1);
  border-radius: 4px;
  color: var(--txt-1);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 8px;
  resize: vertical;
  outline: none;
}
.re-note-ta:focus { border-color: rgba(170,102,255,0.5); }
.re-btn-ignore {
  background: rgba(255,85,85,0.12); border-color: rgba(255,85,85,0.3); color: #ff8080;
}
.re-btn-ignore:hover:not(:disabled) { background: rgba(255,85,85,0.22); color: #ffaaaa; }
.re-btn-watch {
  background: rgba(255,170,51,0.12); border-color: rgba(255,170,51,0.3); color: #ffaa33;
}
.re-btn-watch:hover:not(:disabled) { background: rgba(255,170,51,0.22); color: #ffcc66; }
.re-kind-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--txt-4);
  background: rgba(var(--fg-rgb),0.06);
  border-radius: 4px; padding: 2px 8px; margin-left: 8px;
}
.re-type-toggle {
  display: flex; margin-bottom: 10px;
  border: 1px solid rgba(var(--fg-rgb),0.12);
  border-radius: 6px; overflow: hidden;
}
.re-type-opt {
  flex: 1; background: transparent; border: none; border-radius: 0;
  color: var(--txt-4); font-size: 12px; font-weight: 600;
  padding: 6px 0; cursor: pointer;
}
.re-type-opt:hover { background: rgba(var(--fg-rgb),0.05); color: var(--txt-2); }
.re-type-opt.active[data-rule-type="ignore"] { background: rgba(255,85,85,0.16); color: #ff8080; }
.re-type-opt.active[data-rule-type="watch"] { background: rgba(255,170,51,0.16); color: #ffaa33; }
.re-type-opt.blink { animation: badge-blink 1s ease-in-out infinite; }
.re-conflict {
  font-size: 11px; color: #ffcc66;
  background: rgba(255,170,51,0.10);
  border: 1px solid rgba(255,170,51,0.25);
  border-radius: 4px; padding: 6px 9px; margin-bottom: 10px;
}
.re-btn-delete {
  margin-left: auto;
  background: rgba(255,85,85,0.10); border-color: rgba(255,85,85,0.25); color: #ff8080;
}
.re-btn-delete:hover:not(:disabled) { background: rgba(255,85,85,0.2); color: #ffaaaa; }
`;
