import { useEffect, useState } from "react";
import { PROVIDER_DEFAULTS, type ProviderId } from "@shared/types";

interface Props {
  onToast: (text: string) => void;
  onImported?: () => void;
}

export function SettingsPane({ onToast, onImported }: Props) {
  const [provider, setProvider] = useState<ProviderId>("deepseek");
  const [model, setModel] = useState(PROVIDER_DEFAULTS.deepseek.defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setProvider(s.provider);
      setModel(s.model);
      setApiKeySet(s.apiKeySet);
    });
  }, []);

  async function save() {
    const next = await window.api.settings.set({
      provider,
      model,
      apiKey: apiKey.trim() || undefined
    });
    setApiKey("");
    setApiKeySet(next.apiKeySet);
    onToast("设置已保存，密钥只留在这台电脑");
  }

  return (
    <aside className="settings-pane">
      <h2>模型与迁移</h2>
      <p>选 Cursor SDK，或直接走 DeepSeek / OpenAI / 智谱。密钥用系统钥匙串加密，导出记忆时不会带上。</p>

      <label className="field">
        <span>后端</span>
        <select
          value={provider}
          onChange={(e) => {
            const next = e.target.value as ProviderId;
            setProvider(next);
            setModel(PROVIDER_DEFAULTS[next].defaultModel);
          }}
        >
          {(Object.keys(PROVIDER_DEFAULTS) as ProviderId[]).map((id) => (
            <option key={id} value={id}>
              {PROVIDER_DEFAULTS[id].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>模型</span>
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
      <label className="field">
        <span>API Key {apiKeySet ? "（已保存）" : "（未设置，将用本地粗整理）"}</span>
        <input
          type="password"
          value={apiKey}
          placeholder={apiKeySet ? "要更换再贴新的" : "sk-… 或 cursor_…"}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <div className="actions">
        <button className="solid" onClick={() => void save()}>
          保存设置
        </button>
      </div>

      <h2 style={{ marginTop: 28 }}>Chrome 书签</h2>
      <p>读取本机 Google Chrome 的收藏，全部写入「收藏网址」。已有相同网址会跳过。</p>
      <div className="actions">
        <button
          className="solid"
          onClick={async () => {
            const result = await window.api.transfer.importChrome();
            onToast(result.message);
            if (result.ok) onImported?.();
          }}
        >
          导入 Chrome 书签
        </button>
      </div>

      <h2 style={{ marginTop: 28 }}>换电脑</h2>
      <p>导出 zip，到另一台机器选导入。路径里的家目录会写成占位符。</p>
      <div className="actions">
        <button
          className="ghost"
          onClick={async () => onToast((await window.api.transfer.export()).message)}
        >
          导出
        </button>
        <button
          className="ghost"
          onClick={async () => onToast((await window.api.transfer.import("merge")).message)}
        >
          导入并跳过已有
        </button>
        <button
          className="ghost"
          onClick={async () => onToast((await window.api.transfer.import("overwrite")).message)}
        >
          导入并覆盖同 id
        </button>
      </div>
    </aside>
  );
}
