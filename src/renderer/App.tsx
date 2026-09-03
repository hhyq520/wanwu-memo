import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "@shared/types";
import { ChatPane } from "./components/ChatPane";
import { ItemDetail } from "./components/ItemDetail";
import { SettingsPane } from "./components/SettingsPane";
import { accession, locationLine, TYPE_LABEL } from "./labels";

type View = "library" | "chat" | "settings";

export function App() {
  const [view, setView] = useState<View>("library");
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [toast, setToast] = useState("");

  const [allItems, setAllItems] = useState<CatalogItem[]>([]);

  async function reload(nextCategory = category) {
    const [cats, list, all] = await Promise.all([
      window.api.catalog.categories(),
      query.trim()
        ? window.api.catalog.search(query.trim())
        : window.api.catalog.list(nextCategory === "全部" ? undefined : nextCategory),
      window.api.catalog.list()
    ]);
    setCategories(cats);
    setItems(list);
    setAllItems(all);
  }

  useEffect(() => {
    void reload();
  }, [category]);

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
    setItems((prev) => [item, ...prev.filter((x) => x.id !== item.id)]);
    setAllItems((prev) => [item, ...prev.filter((x) => x.id !== item.id)]);
    setSelected(item);
    void window.api.catalog.categories().then(setCategories);
  }

  const showDetail = view === "library" && selected;
  const side =
    view === "chat" ? (
      <ChatPane
        onSaved={onSaved}
        onOpenItem={(item) => {
          setSelected(item);
          setView("library");
        }}
        onToast={showToast}
      />
    ) : view === "settings" ? (
      <SettingsPane onToast={showToast} onImported={() => void reload()} />
    ) : showDetail ? (
      <ItemDetail
        item={selected}
        categories={categories}
        onClose={() => setSelected(null)}
        onSaved={onSaved}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((x) => x.id !== id));
          setSelected(null);
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
        <button
          className={`tab ${view === "library" && category === "全部" ? "is-on" : ""}`}
          onClick={() => {
            setView("library");
            setCategory("全部");
          }}
        >
          全部
        </button>
        {categories.map((name) => (
          <button
            key={name}
            className={`tab ${view === "library" && category === name ? "is-on" : ""}`}
            onClick={() => {
              setView("library");
              setCategory(name);
            }}
          >
            <span>{name}</span>
            {counts.get(name) ? <span className="tab-count">{counts.get(name)}</span> : null}
          </button>
        ))}
        <div className="drawer-foot">
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
              {items.length === 0 && (
                <div className="empty">这一格还是空的。去对话里说「记住……」，或先在设置里接上模型。</div>
              )}
              {items.map((item) => (
                <button key={item.id} className="card" onClick={() => setSelected(item)}>
                  <div className="card-head">
                    <span className={`stamp ${item.type}`}>{TYPE_LABEL[item.type]}</span>
                    <span className="accession">{accession(item.id)}</span>
                  </div>
                  <h3 className="card-title">{item.title}</h3>
                  <p className="card-summary">{item.summary || item.body.slice(0, 72) || item.howto}</p>
                  {locationLine(item) && (
                    <div className={`pathline ${item.pathMissing ? "missing" : ""}`}>
                      {locationLine(item)}
                    </div>
                  )}
                </button>
              ))}
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
