import { useState } from "react";
import { keepRemindDate } from "@shared/remind";
import type { CatalogItem, ItemDraft, ItemType, RemindKind } from "@shared/types";
import { TYPE_LABEL } from "../labels";
import { RemindFields } from "./RemindFields";

interface Props {
  draft: ItemDraft;
  onSaved: (item: CatalogItem) => void;
  onToast: (text: string) => void;
}

export function ConfirmCard({ draft, onSaved, onToast }: Props) {
  const [local, setLocal] = useState<ItemDraft>(draft);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const saved = await window.api.catalog.upsert(local);
      onSaved(saved);
      onToast("已存入柜中");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm-card">
      <div className="card-head">
        <span className={`stamp ${local.type}`}>{TYPE_LABEL[local.type]}</span>
        <span className="accession">待确认</span>
      </div>
      <label className="field">
        <span>标题</span>
        <input value={local.title} onChange={(e) => setLocal({ ...local, title: e.target.value })} />
      </label>
      <label className="field">
        <span>类型</span>
        <select
          value={local.type}
          onChange={(e) => setLocal({ ...local, type: e.target.value as ItemType })}
        >
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>分类</span>
        <input
          value={local.category || ""}
          onChange={(e) => setLocal({ ...local, category: e.target.value })}
        />
      </label>
      <label className="field">
        <span>加锁</span>
        <input
          type="checkbox"
          checked={Boolean(local.private)}
          onChange={(e) => setLocal({ ...local, private: e.target.checked })}
        />
        <p className="field-hint">
          {local.private ? "已加锁，平时不显示，搜索也找不到。" : "说「加锁」时会勾上。平时不显示。"}
        </p>
      </label>
      <RemindFields
        kind={local.remindKind || "none"}
        date={local.remindDate || ""}
        createdAt={local.createdAt}
        onChange={(kind: RemindKind, date: string) =>
          setLocal({
            ...local,
            remindKind: kind,
            remindDate: keepRemindDate(kind, kind === "date" ? date : local.remindDate || "")
          })
        }
      />
      {local.type === "app" && (
        <label className="field">
          <span>软件名</span>
          <input
            value={local.appName || ""}
            onChange={(e) => setLocal({ ...local, appName: e.target.value })}
          />
        </label>
      )}
      {(local.type === "project" || local.type === "app") && (
        <label className="field">
          <span>路径</span>
          <input
            value={local.path || ""}
            placeholder={local.type === "app" ? "/Applications/VidBee.app" : ""}
            onChange={(e) => setLocal({ ...local, path: e.target.value })}
          />
        </label>
      )}
      {(local.type === "url" || local.url) && (
        <label className="field">
          <span>网址</span>
          <input value={local.url || ""} onChange={(e) => setLocal({ ...local, url: e.target.value })} />
        </label>
      )}
      {local.type === "project" && (
        <label className="field">
          <span>启动命令</span>
          <input
            value={local.launchCommand || ""}
            onChange={(e) => setLocal({ ...local, launchCommand: e.target.value })}
          />
        </label>
      )}
      {local.type === "note" && (
        <label className="field">
          <span>原文</span>
          <textarea
            value={local.body || ""}
            onChange={(e) => setLocal({ ...local, body: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        <span>一句话</span>
        <input
          value={local.summary || ""}
          onChange={(e) => setLocal({ ...local, summary: e.target.value })}
        />
      </label>
      <button className="solid" disabled={busy} onClick={save}>
        {busy ? "保存中…" : "确定，存起来"}
      </button>
    </div>
  );
}
