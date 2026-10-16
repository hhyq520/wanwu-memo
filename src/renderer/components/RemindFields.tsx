import type { RemindKind } from "@shared/types";
import { remindSummary } from "@shared/remind";

interface Props {
  kind: RemindKind;
  date: string;
  createdAt?: number;
  onChange: (kind: RemindKind, date: string) => void;
}

export function RemindFields({ kind, date, createdAt, onChange }: Props) {
  return (
    <label className="field">
      <span>提醒</span>
      <select value={kind} onChange={(e) => onChange(e.target.value as RemindKind, date)}>
        <option value="none">不提醒</option>
        <option value="year">一年后，提前一天</option>
        <option value="date">指定日期的前一天</option>
        <option value="at">到指定时刻</option>
      </select>
      {kind === "date" ? (
        <input type="date" value={date} onChange={(e) => onChange("date", e.target.value)} />
      ) : null}
      <p className="field-hint">{remindSummary(kind, date, createdAt)}</p>
    </label>
  );
}
