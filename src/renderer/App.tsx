import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem } from "@shared/types";
import { ChatPane } from "./components/ChatPane";
import { ItemDetail } from "./components/ItemDetail";
import { RemindPane } from "./components/RemindPane";
import { SettingsPane } from "./components/SettingsPane";
import { accession, cardLocationLine, TYPE_LABEL } from "./labels";

type View = "library" | "chat" | "settings" | "reminders";

export function App() {
  const [view, setView] = useState<View>("library");
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [toast, setToast] = useState("");
  const [due, setDue] = useState<CatalogItem[]>([]);
  const dueSeq = useRef(0);

  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const reloadSeq = useRef(0);

  async function reload(nextCategory = category, nextQuery = query) {
    const seq = ++reloadSeq.current;
    const q = nextQuery.trim();
    const [cats, list, all] = await Promise.all([
      window.api.catalog.categories(),
      q
        ? window.api.catalog.search(q)
        : window.api.catalog.list(nextCategory === "全部" ? undefined : nextCategory),
      window.api.catalog.list()
    ]);
    if (seq !== reloadSeq.current) return;
    setCategories(cats);
    setItems(list);
    setAllItems(all);
  }

  function acceptDue(feed: { seq: number; items: CatalogItem[] }) {
    if (feed.seq < dueSeq.current) return;
    dueSeq.current = feed.seq;
    setDue(feed.items);
  }

  useEffect(() => {
    void reload();
    void window.api.reminders.list().then(acceptDue);
    return window.api.reminders.onDue(acceptDue);
    // 只在进入页面时拉一次；之后的刷新由保存、删除、导入和检索显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("全部", allItems.length);
    for (const item of allItems) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [allItems]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  }

  function onSaved(item: CatalogItem) {
    setSelected(item);
    void reload();
  }

  async function openReminder(item: CatalogItem) {
    setDue((prev) => prev.filter((entry) => entry.id !== item.id));
    const next = await window.api.reminders.dismiss(item.id);
    acceptDue(next);
    setSelected({ ...item, remindDismissedAt: Date.now() });
    setQuery("");
    setCategory("全部");
    setView("library");
    void reload("全部", "");
  }

  function openCategory(name: string) {
    setView("library");
    setQuery("");
    setCategory(name);
    void reload(name, "");
  }

  const showDetail = view === "library" && selected;
  const side =
    view === "chat" ? (
      <ChatPane
        onSaved={onSaved}
        onRefresh={() => void reload()}
        onOpenItem={(item) => {
          setSelected(item);
          setView("library");
          void reload();
        }}
        onToast={showToast}
      />
    ) : view === "settings" ? (
      <SettingsPane onToast={showToast} onImported={() => void reload()} />
    ) : view === "reminders" ? (
      <RemindPane items={due} onOpen={(item) => void openReminder(item)} />
    ) : showDetail ? (
      <ItemDetail
        item={selected}
        categories={categories}
        onClose={() => setSelected(null)}
        onSaved={onSaved}
        onDeleted={() => {
          setSelected(null);
          void reload();
        }}
        onToast={showToast}
      />
    ) : null;

  return (
    <div className="app-shell">
      <nav className="drawer">
        <div className="brand">
          <div className="brand-kicker">LOCAL INDEX</div>
          <h1 className="brand-name">万物备忘</h1>
        </div>
        <div className="drawer-cats">
          <button
            className={`tab ${view === "library" && category === "全部" ? "is-on" : ""}`}
            onClick={() => openCategory("全部")}
          >
            <span className="tab-label">全部</span>
            <span className="tab-count">{counts.get("全部") ?? 0}</span>
          </button>
          {categories.map((name) => (
            <button
              key={name}
              className={`tab ${view === "library" && category === name ? "is-on" : ""}`}
              onClick={() => openCategory(name)}
            >
              <span className="tab-label">{name}</span>
              <span className="tab-count">{counts.get(name) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="drawer-foot">
          <button
            className={`tab ${view === "reminders" ? "is-on" : ""}`}
            onClick={() => setView("reminders")}
          >
            <span className="tab-label">提醒</span>
            <span className="tab-count is-due">{due.length}</span>
          </button>
          <button className={`tab ${view === "chat" ? "is-on" : ""}`} onClick={() => setView("chat")}>
            对话
          </button>
          <button
            className={`tab ${view === "settings" ? "is-on" : ""}`}
            onClick={() => setView("settings")}
          >
            设置
          </button>
        </div>
      </nav>

      <main className="well">
        {view === "library" ? (
          <header className="topbar">
            <input
              className="search"
              placeholder="在柜里搜标题、用途、软件名、原文……"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void reload();
              }}
            />
            <button className="ghost" onClick={() => void reload()}>
              检索
            </button>
            <button className="solid" onClick={() => setView("chat")}>
              记一笔
            </button>
          </header>
        ) : (
          <div className="drag-strip" />
        )}

        {view === "library" ? (
          <div className={`main-split ${side ? "" : "no-detail"}`}>
            <section className="cards">
              {due.length > 0 && (
                <button className="remind-banner" onClick={() => setView("reminders")}>
                  {due.length} 条提醒到点了
                </button>
              )}
              {items.length === 0 && (
                <div className="empty">这一格还是空的。去对话里说「记住……」，或先在设置里接上模型。</div>
              )}
              {items.map((item) => {
                const loc = cardLocationLine(item);
                return (
                  <div
                    key={item.id}
                    className="card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(item);
                      }
                    }}
                  >
                    <div className="card-head">
                      <span className={`stamp ${item.type}`}>{TYPE_LABEL[item.type]}</span>
                      <span className="accession">{accession(item.id)}</span>
                    </div>
                    <h3 className="card-title">{item.title}</h3>
                    <p className="card-summary">{item.summary || item.body.slice(0, 72) || item.howto}</p>
                    {loc ? (
                      <div className={`pathline ${item.pathMissing ? "missing" : ""}`}>{loc}</div>
                    ) : null}
                  </div>
                );
              })}
            </section>
            {side}
          </div>
        ) : (
          <div className="main-split no-detail" style={{ gridTemplateColumns: "1fr" }}>
            {side}
          </div>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
