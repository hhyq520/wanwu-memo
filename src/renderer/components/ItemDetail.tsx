import { useEffect, useState } from "react";
import type { CatalogItem, ItemDraft, ItemType, LaunchAction } from "@shared/types";
import { accession, TYPE_LABEL } from "../labels";

const TYPES: ItemType[] = ["app", "project", "url", "note"];

interface Props {
  item: CatalogItem;
  categories: string[];
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  onDeleted: (id: string) => void;
  onToast: (text: string) => void;
}

export function ItemDetail({ item, categories, onClose, onSaved, onDeleted, onToast }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  function set<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    const saved = await window.api.catalog.upsert({ ...draft, id: item.id });
    onSaved(saved);
    onToast("已保存");
  }

  async function run(action: LaunchAction) {
    if (action === "copy_body") {
      const result = await window.api.clipboard.write(item.body || draft.body || "");
      onToast(result.message);
      return;
    }
    const result = await window.api.launch.run(item.id, action);
    onToast(result.message);
  }

  return (
    <aside className="detail">
      <div className="card-head">
        <span className={`stamp ${draft.type}`}>{TYPE_LABEL[draft.type]}</span>
        <span className="accession">{accession(item.id)}</span>
      </div>
      <h2>{draft.title || "未命名"}</h2>

      <label className="field">
        <span>标题</span>
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label className="field">
        <span>类型</span>
        <select value={draft.type} onChange={(e) => set("type", e.target.value as ItemType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>分类</span>
        <input
          list="category-list"
          value={draft.category || ""}
          onChange={(e) => set("category", e.target.value)}
        />
        <datalist id="category-list">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      {draft.type === "app" && (
        <label className="field">
          <span>软件名</span>
          <input value={draft.appName || ""} onChange={(e) => set("appName", e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>路径</span>
        <input
          className={item.pathMissing ? "missing" : ""}
          value={draft.path || ""}
          onChange={(e) => set("path", e.target.value)}
        />
      </label>
      <label className="field">
        <span>网址</span>
        <input value={draft.url || ""} onChange={(e) => set("url", e.target.value)} />
      </label>
      <label className="field">
        <span>启动命令</span>
        <input
          value={draft.launchCommand || ""}
          onChange={(e) => set("launchCommand", e.target.value)}
        />
      </label>
      <label className="field">
        <span>一句话</span>
        <input value={draft.summary || ""} onChange={(e) => set("summary", e.target.value)} />
      </label>
      <label className="field">
        <span>怎么用</span>
        <textarea value={draft.howto || ""} onChange={(e) => set("howto", e.target.value)} />
      </label>
      <label className="field">
        <span>原文</span>
        <textarea value={draft.body || ""} onChange={(e) => set("body", e.target.value)} />
      </label>
      <label className="field">
        <span>关键词</span>
        <input
          value={(draft.keywords || []).join("，")}
          onChange={(e) =>
            set(
              "keywords",
              e.target.value
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        />
      </label>

      <div className="actions">
        {draft.type === "app" && (
          <button className="solid" onClick={() => run("open_app")}>
            打开软件
          </button>
        )}
        {draft.path && (
          <>
            <button className="ghost" onClick={() => run("open_folder")}>
              打开文件夹
            </button>
            <button className="ghost" onClick={() => run("open_cursor")}>
              用 Cursor 打开
            </button>
          </>
        )}
        {draft.url && (
          <button className="ghost" onClick={() => run("open_url")}>
            打开网址
          </button>
        )}
        {draft.launchCommand && (
          <button className="ghost" onClick={() => run("run_command")}>
            运行启动命令
          </button>
        )}
        {draft.body && (
          <button className="ghost" onClick={() => run("copy_body")}>
            复制原文
          </button>
        )}
      </div>
      <div className="actions">
        <button className="solid" onClick={save}>
          保存
        </button>
        <button className="ghost" onClick={onClose}>
          收起
        </button>
        <button
          className="ghost"
          onClick={async () => {
            if (confirm("删除这条记忆？")) {
              await window.api.catalog.delete(item.id);
              onDeleted(item.id);
            }
          }}
        >
          删除
        </button>
      </div>
    </aside>
  );
}
