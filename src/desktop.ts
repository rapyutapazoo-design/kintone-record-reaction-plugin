import { AppError, toUserMessage } from "./lib/errors";
import { NO_EFFECTS } from "./lib/effects";
import { shouldConfetti } from "./lib/motionPlan";
import { activeReactions, resolveRuntimeConfig, type ReactionConfig, type StoredConfig } from "./lib/reactionConfig";
import { decideMode, isProxyAvailable, type Mode } from "./lib/mode";
import { mergeBarsByPlacement, resolvePlacements } from "./lib/placement";
import { createSerialQueue } from "./lib/queue";
import type { KintoneRecord } from "./lib/record";
import { toggleReaction, type ToggleDeps } from "./lib/toggle";
import { buildBars, optimisticToggle, type BarView } from "./lib/view";
import { createRecordClient, KintoneConflictError } from "./kintone/proxy";
import { el, ensureToastStack, showToast } from "./ui/dom";
import { createFeedback } from "./ui/feedback";
import { createMotion, prefersReducedMotion } from "./ui/motion";
import { renderBar, type BarHandle } from "./ui/reactionBar";

const PLUGIN_ID = kintone.$PLUGIN_ID;
const LOG = "[レコードリアクション]";

function getConfig(): StoredConfig {
  return kintone.plugin.app.getConfig(PLUGIN_ID) as StoredConfig;
}

function getSpace(isMobile: boolean, spaceId: string): HTMLElement | null {
  return isMobile ? kintone.mobile.app.record.getSpaceElement(spaceId) : kintone.app.record.getSpaceElement(spaceId);
}

function resolveContainer(isMobile: boolean, placementId: string): HTMLElement | null {
  if (placementId !== "") {
    const target = getSpace(isMobile, placementId);
    if (target) return target;
  }
  return isMobile ? kintone.mobile.app.getHeaderSpaceElement() : kintone.app.record.getHeaderMenuSpaceElement();
}

function showHeaderWarning(isMobile: boolean, text: string): void {
  const container = resolveContainer(isMobile, "");
  if (!container) return;
  container.querySelector(".krx-warn-root")?.remove();
  container.appendChild(el("div", { className: "krx-warn-root" }, [el("div", { className: "krx-warning", text })]));
}

let generation = 0;
const queue = createSerialQueue();

async function setupRecord(event: any, isMobile: boolean): Promise<void> {
  const gen = ++generation;
  ensureToastStack(document);

  const stored = getConfig();
  const resolved = resolveRuntimeConfig(stored);
  if (!resolved.ok) {
    if (resolved.reason === "NOT_CONFIGURED") {
      showHeaderWarning(isMobile, "プラグイン設定が未完了です。");
    } else {
      showHeaderWarning(isMobile, "プラグイン設定を見直してください（管理者向け）。");
      console.warn(`${LOG} INVALID_CONFIG`);
    }
    return;
  }
  const config: ReactionConfig = resolved.config;
  const active = activeReactions(config);
  if (active.length === 0) return;

  const appId = isMobile ? kintone.mobile.app.getId() : kintone.app.getId();
  const recordId = event.recordId ?? (isMobile ? kintone.mobile.app.record.getId() : kintone.app.record.getId());
  const eventRecord = (event.record ?? {}) as KintoneRecord;
  const loginUser = kintone.getLoginUser();
  const user = { code: loginUser.code, name: loginUser.name };

  const motion = createMotion({ effects: NO_EFFECTS, feedback: createFeedback(NO_EFFECTS) });

  // 初期表示（読み込み中）。最新レコードはまだ無い。
  const requested = buildBars({ config, eventRecord, latestRecord: null, userCode: user.code });
  const placement = resolvePlacements(
    requested.map((b) => b.spaceId),
    (id) => getSpace(isMobile, id) !== null
  );
  for (const [id, actual] of placement) {
    if (id !== "" && actual === "") console.warn(`${LOG} スペースが見つかりません: ${id}`);
  }
  const mergedKeys = (views: BarView[]): BarView[] => mergeBarsByPlacement(views, placement);

  let interactive = false;
  const handles = new Map<string, BarHandle>();

  function setAllDisabled(disabled: boolean): void {
    for (const h of handles.values()) h.setDisabled(disabled);
  }
  function applyViews(views: BarView[]): void {
    for (const view of views) handles.get(view.spaceId)?.update(view);
  }

  let current: BarView[] = mergedKeys(requested);
  const first = current[0];
  for (const view of current) {
    const container = resolveContainer(isMobile, view.spaceId);
    if (!container) continue;
    const handle = renderBar(container, view, {
      placementId: view.spaceId,
      readonly: false,
      motion,
      onPress: (key, btn) => {
        void handlePress(key, btn);
      },
    });
    handle.setLoading(true);
    handle.setDisabled(true);
    handles.set(view.spaceId, handle);
  }

  function enterReadonly(mode: Extract<Mode, { kind: "readonly" }>): void {
    interactive = false;
    setAllDisabled(true);
    if (first) handles.get(first.spaceId)?.setMessage(mode.message, mode.level);
  }

  // 最新レコードの取得（プロキシ）。
  let client: ReturnType<typeof createRecordClient> | null = null;
  const proxyAvailable = isProxyAvailable(kintone);
  let latest: KintoneRecord | null = null;
  let loadError: unknown | null = null;
  if (proxyAvailable && stored.recordApiUrl && appId !== null && recordId !== undefined && recordId !== null) {
    client = createRecordClient(PLUGIN_ID, stored.recordApiUrl, appId, recordId);
    try {
      // 進行中の PUT と競合しないよう、初回 GET もキューで直列化する。
      const c = client;
      latest = (await queue.run(() => c.getRecord())).record;
    } catch (e) {
      loadError = e;
    }
  }
  if (gen !== generation) return; // 古い show の結果は捨てる

  for (const h of handles.values()) h.setLoading(false);
  const mode = decideMode({ isMobile, proxyAvailable: proxyAvailable && client !== null, loadError });
  if (mode.kind === "readonly") {
    current = mergedKeys(buildBars({ config, eventRecord, latestRecord: null, userCode: user.code }));
    applyViews(current);
    enterReadonly(mode);
    return;
  }
  current = mergedKeys(buildBars({ config, eventRecord, latestRecord: latest, userCode: user.code }));
  applyViews(current);
  interactive = true;
  setAllDisabled(false);

  const rc = client;
  if (!rc) return;
  const deps: ToggleDeps = {
    getRecord: () => rc.getRecord(),
    putRecord: (revision, record) => rc.putRecord(revision, record),
    isConflict: (e) => e instanceof KintoneConflictError,
    now: () => new Date(),
  };

  function handlePress(key: string, btn: HTMLButtonElement): Promise<void> {
    return queue.run(async () => {
      if (gen !== generation || !interactive) return;
      const def = active.find((r) => r.key === key);
      if (!def) return;
      const snapshot = current;
      current = optimisticToggle(current, key, user.name, config.display.maxListUsers);
      applyViews(current);
      setAllDisabled(true);
      btn.setAttribute("aria-busy", "true");
      try {
        const result = await toggleReaction(deps, config, user, def);
        latest = result.record;
        current = mergedKeys(buildBars({ config, eventRecord, latestRecord: latest, userCode: user.code }));
        applyViews(current);
        btn.removeAttribute("aria-busy");
        void motion.success(btn, btn.parentElement ?? btn);
        if (shouldConfetti(def.confetti, result.reacted, prefersReducedMotion())) void motion.confetti(btn);
      } catch (err) {
        current = snapshot;
        applyViews(current);
        btn.removeAttribute("aria-busy");
        void motion.error(btn);
        showToast(document.body, toUserMessage(err), "error");
        if (err instanceof AppError && (err.code === "CONFIG_MISMATCH" || err.code === "TOKEN")) {
          enterReadonly({ kind: "readonly", message: toUserMessage(err), level: "warning" });
        }
      } finally {
        if (gen === generation && interactive) setAllDisabled(false);
      }
    });
  }
}

kintone.events.on("app.record.detail.show", (event: any) => {
  void setupRecord(event, false).catch(() => console.warn(`${LOG} 初期化に失敗しました`));
  return event;
});

kintone.events.on("mobile.app.record.detail.show", (event: any) => {
  void setupRecord(event, true).catch(() => console.warn(`${LOG} 初期化に失敗しました`));
  return event;
});
