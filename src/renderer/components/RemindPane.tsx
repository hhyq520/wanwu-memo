import type { CatalogItem } from "@shared/types";
import { dueLine } from "@shared/remind";
import { TYPE_LABEL } from "../labels";

interface Props {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}

export function RemindPane({ items, onOpen }: Props) {
  return (
    <section className="remind-pane">
      <h2>提醒</h2>
      <p>点开一条就记为已读，这里的数量和图标上的数字都会减 1。</p>
      {items.length === 0 ? (
        <div className="empty">现在没有到点的提醒。没写日期的条目，会在满一年的前一天出现在这里。</div>
      ) : (
        <div className="remind-list">
          {items.map((item) => (
            <button key={item.id} className="remind-card" onClick={() => onOpen(item)}>
              <span className={`stamp ${item.type}`}>{TYPE_LABEL[item.type]}</span>
              <strong>{item.title}</strong>
              <em>{dueLine(item)}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
