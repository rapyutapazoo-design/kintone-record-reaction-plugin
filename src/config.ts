import { extractSpacers } from "./lib/layout";
import { presetMapping, type FormFieldsResponse } from "./lib/fields";
import { normalizeRecordApiUrl, resolveSpaceOptions, validateApiToken } from "./lib/settings";
import {
  CONFIG_VERSION,
  defaultConfig,
  normalizeFormInput,
  parseConfig,
  presetCountFields,
  serializeConfig,
  validateConfig,
  type ReactionConfig,
  type StoredConfig,
} from "./lib/reactionConfig";
import { renderConfigForm, type ConfigFormHandle } from "./ui/configForm";

const PLUGIN_ID = kintone.$PLUGIN_ID;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`要素が見つかりません: ${id}`);
  return node as T;
}

function getAppId(): string {
  const fromApi = kintone.app.getId();
  if (fromApi !== null && fromApi !== undefined) return String(fromApi);
  const fromQuery = new URLSearchParams(location.search).get("app");
  return fromQuery ?? "";
}

function showError(message: string): void {
  byId("plugin-config-errormsg").textContent = message;
}

function clearError(): void {
  byId("plugin-config-errormsg").textContent = "";
}

let configFormHandle: ConfigFormHandle | null = null;
let formFieldsResponse: FormFieldsResponse | null = null;

async function populateSpaceOptions(spacers: { elementId: string }[], savedSpaceId: string): Promise<void> {
  const select = byId<HTMLSelectElement>("krx-default-space");
  const warning = byId("krx-default-space-warning");
  select.textContent = "";
  warning.style.display = "none";
  const options = resolveSpaceOptions(spacers, savedSpaceId);
  for (const opt of options) {
    const optionEl = document.createElement("option");
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  }
  select.value = savedSpaceId;
  const missing = options.find((o) => o.missing);
  if (missing) {
    warning.textContent = missing.label;
    warning.style.display = "";
  }
}

async function initForm(appId: string, existing: StoredConfig): Promise<void> {
  try {
    const resp = (await kintone.api(kintone.api.url("/k/v1/preview/app/form/fields.json", true), "GET", {
      app: appId,
    })) as FormFieldsResponse;
    let spacers: { elementId: string }[] = [];
    try {
      const layout = await kintone.api(kintone.api.url("/k/v1/preview/app/form/layout.json", true), "GET", { app: appId });
      spacers = extractSpacers(layout.layout);
    } catch {
      showError("フォームレイアウトの取得に失敗しました。ヘッダーメニューのみ選択できます。");
    }
    formFieldsResponse = resp;

    const parsed = parseConfig(existing.config);
    let initial: ReactionConfig;
    let savedKeys: string[] = [];
    if (parsed.ok) {
      initial = { ...parsed.config, mapping: presetMapping(resp, parsed.config.mapping) };
      savedKeys = parsed.config.reactions.map((r) => r.key);
    } else {
      initial = defaultConfig(presetMapping(resp, null));
      initial.reactions = presetCountFields(initial.reactions, resp);
      if (parsed.reason !== "EMPTY") {
        const notice = byId("krx-config-notice");
        notice.textContent = "保存済みの設定を読み込めなかったため、既定値を表示しています。";
        notice.style.display = "";
      }
    }
    await populateSpaceOptions(spacers, initial.defaultSpaceId);
    configFormHandle = renderConfigForm(
      { mapping: byId("krx-mapping-root"), reactions: byId("krx-reactions-root"), display: byId("krx-display-root") },
      { fields: resp, spacers, initial, savedKeys }
    );
  } catch {
    formFieldsResponse = null;
    configFormHandle = null;
    showError("フォームのフィールド情報の取得に失敗しました。時間をおいて設定画面を開き直してください。");
  }
}

function init(): void {
  const existing = kintone.plugin.app.getConfig(PLUGIN_ID) as StoredConfig;
  const appId = getAppId();

  void initForm(appId, existing);

  byId<HTMLButtonElement>("krx-cancel").addEventListener("click", () => {
    location.href = "../../" + appId + "/plugin/";
  });
  byId<HTMLButtonElement>("krx-test-connection").addEventListener("click", () => {
    void runConnectionTest(appId, existing);
  });
  byId<HTMLButtonElement>("krx-save").addEventListener("click", () => {
    void save(appId, existing);
  });
}

function resolveToken(existing: StoredConfig): string | null {
  const tokenInputValue = byId<HTMLInputElement>("krx-token").value;
  const validated = validateApiToken(tokenInputValue);
  if (validated.ok) {
    return validated.value;
  }
  if (tokenInputValue.trim().length > 0) {
    showError(validated.message);
    return null;
  }
  // 空欄: 既存トークンを引き継ぐ（getProxyConfig は同期API）
  if (existing.recordApiUrl) {
    const proxyConfig = kintone.plugin.app.getProxyConfig(existing.recordApiUrl, "GET");
    const inherited = proxyConfig?.headers?.["X-Cybozu-API-Token"];
    if (inherited) {
      return inherited;
    }
  }
  showError("APIトークンを入力してください。");
  return null;
}

async function save(appId: string, existing: StoredConfig): Promise<void> {
  clearError();
  const saveBtn = byId<HTMLButtonElement>("krx-save");

  let recordApiUrl: string;
  try {
    recordApiUrl = normalizeRecordApiUrl(kintone.api.url("/k/v1/record.json", true));
  } catch (e) {
    showError(e instanceof Error ? e.message : "recordApiUrlの算出に失敗しました。");
    return;
  }

  if (!configFormHandle || !formFieldsResponse) {
    showError("フォームのフィールド情報の取得に失敗しました。時間をおいて設定画面を開き直してください。");
    return;
  }

  const read = configFormHandle.read();
  const config = normalizeFormInput({ ...read.config, defaultSpaceId: byId<HTMLSelectElement>("krx-default-space").value });
  const errors = validateConfig(config, formFieldsResponse, read.rows);
  if (errors.length > 0) {
    configFormHandle.showErrors(errors);
    return;
  }
  configFormHandle.showErrors([]);

  const tokenValue = resolveToken(existing);
  if (tokenValue === null) return;

  const headers = { "X-Cybozu-API-Token": tokenValue };

  saveBtn.disabled = true;
  const fail = (): void => {
    saveBtn.disabled = false;
    showError("設定の保存に失敗しました。時間をおいてもう一度お試しください。");
  };
  try {
    kintone.plugin.app.setProxyConfig(recordApiUrl, "GET", headers, {}, () => {
      try {
        kintone.plugin.app.setProxyConfig(recordApiUrl, "PUT", headers, {}, () => {
          try {
            kintone.plugin.app.setConfig(
              {
                recordApiUrl,
                config: serializeConfig(config),
                configVersion: CONFIG_VERSION,
              },
              () => {
                alert("設定を保存しました。アプリを更新してください。");
                location.href = "../../flow?app=" + appId;
              }
            );
          } catch {
            fail();
          }
        });
      } catch {
        fail();
      }
    });
  } catch {
    fail();
  }
}

async function runConnectionTest(appId: string, existing: StoredConfig): Promise<void> {
  const resultEl = byId("krx-test-result");
  resultEl.textContent = "確認中...";

  const tokenInputValue = byId<HTMLInputElement>("krx-token").value;
  let tokenValue: string | null = null;
  const validated = validateApiToken(tokenInputValue);
  if (validated.ok) {
    tokenValue = validated.value;
  } else if (tokenInputValue.trim().length === 0 && existing.recordApiUrl) {
    const proxyConfig = kintone.plugin.app.getProxyConfig(existing.recordApiUrl, "GET");
    tokenValue = proxyConfig?.headers?.["X-Cybozu-API-Token"] ?? null;
  }

  if (!tokenValue) {
    resultEl.textContent = "APIトークンを入力してください。";
    return;
  }

  try {
    const url =
      kintone.api.url("/k/v1/records.json", true) +
      "?app=" +
      encodeURIComponent(appId) +
      "&query=" +
      encodeURIComponent("limit 1") +
      "&fields[0]=$id";
    const res = await fetch(url, {
      headers: { "X-Cybozu-API-Token": tokenValue },
      credentials: "omit",
    });
    if (res.ok) {
      resultEl.textContent = "閲覧権限OK（編集権限は手動テストで確認してください）";
    } else if (res.status === 401 || res.status === 403) {
      resultEl.textContent = "トークンが無効か権限が不足しています";
    } else {
      resultEl.textContent = "接続に失敗しました";
    }
  } catch {
    resultEl.textContent = "接続に失敗しました";
  }
}

init();
