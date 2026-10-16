import type { ItemDraft, RemindKind } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

const REMEMBER_RE = /记住|记一下|存下来|帮我记|记下/;
const YEAR_RE = /一年内(?:先)?(?:别|不)|一年后再|一年后提醒|满一年|过一年|明年再提醒|一年后/;
const NONE_RE = /不用提醒|不要提醒|别提醒|无需提醒|不设提醒/;
const VAGUE_RE = /到时候|那天|某个时间|以后提醒|提醒一下|提醒我/;
const LEAD_RE = /前一天|提前一天|提前1天|之前一天|之前1天/;

export function asRemindKind(value: unknown): RemindKind {
  return value === "year" || value === "date" || value === "at" || value === "none" ? value : "none";
}

export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatLocalDate(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIsoDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

export function computeRemindAt(kind: RemindKind, date: string, createdAt: number): number {
  if (kind === "year") {
    const created = new Date(startOfLocalDay(createdAt));
    const anniversary = new Date(created.getFullYear() + 1, created.getMonth(), created.getDate()).getTime();
    return anniversary - DAY_MS;
  }
  if (kind === "date") {
    const target = parseIsoDate(date);
    if (target == null) return 0;
    return target - DAY_MS;
  }
  if (kind === "at") {
    const at = Number(date);
    return Number.isFinite(at) && at > 0 ? at : 0;
  }
  return 0;
}

export function formatLocalDateTime(ms: number): string {
  const date = new Date(ms);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${formatLocalDate(ms)} ${hour}:${minute}`;
}

export function keepRemindDate(kind: RemindKind, date: string): string {
  if (kind === "at") return /^\d{11,16}$/.test(date) ? date : "";
  if (kind === "date") return parseIsoDate(date) ? date : "";
  return "";
}

export function remindSummary(kind: RemindKind | undefined, date: string | undefined, createdAt?: number): string {
  if (kind === "year") {
    if (!createdAt) return "记下满一年的前一天提醒，这一年内不出现。";
    return `满一年的前一天提醒（${formatLocalDate(computeRemindAt("year", "", createdAt))} 起）`;
  }
  if (kind === "date") {
    const target = parseIsoDate(date || "");
    if (target == null) return "指定日期的前一天提醒，还没选到有效日期。";
    return `${date} 的前一天提醒（${formatLocalDate(target - DAY_MS)} 起）`;
  }
  if (kind === "at") {
    const at = Number(date);
    if (!Number.isFinite(at) || at <= 0) return "到点提醒，时间没读准。";
    return `${formatLocalDateTime(at)} 提醒`;
  }
  return "不提醒";
}

export function dueLine(
  item: { remindKind: RemindKind; remindDate: string; remindAt: number },
  now = Date.now()
): string {
  if (item.remindKind === "at") {
    const label = formatLocalDateTime(item.remindAt);
    return now >= item.remindAt ? `到点了 ${label}` : `${label} 提醒`;
  }
  const targetDay = startOfLocalDay(item.remindAt + DAY_MS);
  const today = startOfLocalDay(now);
  const label = item.remindDate || formatLocalDate(targetDay);
  if (item.remindKind === "year") {
    if (today < targetDay) return `明天满一年（${formatLocalDate(targetDay)}）`;
    if (today === targetDay) return `今天满一年（${formatLocalDate(targetDay)}）`;
    return `已满一年（${formatLocalDate(targetDay)}）`;
  }
  if (today < targetDay) return `明天是 ${label}`;
  if (today === targetDay) return `就是今天 ${label}`;
  return `日期已过 ${label}`;
}

export interface StampedReminder {
  draft: ItemDraft;
  note: string;
}

export function stampReminder(text: string, draft: ItemDraft, now = Date.now()): StampedReminder {
  const intent = parseReminderIntent(text, now);
  if (intent.action === "ambiguous") {
    return {
      draft: { ...draft, remindKind: "none", remindDate: "" },
      note: "这句里的时间我没读准，提醒先空着。要过多久，或哪一天的前一天提醒？"
    };
  }
  if (intent.action === "at") {
    return { draft: { ...draft, remindKind: "at", remindDate: String(intent.at) }, note: "" };
  }
  if (intent.action === "date") {
    return { draft: { ...draft, remindKind: "date", remindDate: intent.date }, note: "" };
  }
  if (intent.action === "year") {
    return { draft: { ...draft, remindKind: "year", remindDate: "" }, note: "" };
  }
  if (intent.action === "none") {
    return { draft: { ...draft, remindKind: "none", remindDate: "" }, note: "" };
  }
  return { draft, note: "" };
}

type Intent =
  | { action: "at"; at: number }
  | { action: "date"; date: string }
  | { action: "year" }
  | { action: "none" }
  | { action: "ambiguous" }
  | { action: "unchanged" };

function parseReminderIntent(text: string, now: number): Intent {
  const source = text.trim();
  if (!source) return { action: "unchanged" };
  const exact = extractExactMoment(source, now);
  if (exact.ambiguous) return { action: "ambiguous" };
  if (exact.at != null) return { action: "at", at: exact.at };
  const found = extractDate(source, now);
  if (found.ambiguous) return { action: "ambiguous" };
  if (found.date) return { action: "date", date: found.date };
  if (YEAR_RE.test(source)) return { action: "year" };
  if (NONE_RE.test(source)) return { action: "none" };
  if (VAGUE_RE.test(source) || LEAD_RE.test(source)) return { action: "ambiguous" };
  if (REMEMBER_RE.test(source)) return { action: "year" };
  return { action: "unchanged" };
}

function extractExactMoment(text: string, now: number): { at: number | null; ambiguous: boolean } {
  const durations = collectDurations(text, now);
  if (durations.some((hit) => hit.at == null)) return { at: null, ambiguous: true };
  if (durations.length > 0) {
    durations.sort((a, b) => a.index - b.index);
    return { at: durations[0].at, ambiguous: false };
  }
  const clock = extractClock(text);
  if (clock?.invalid) return { at: null, ambiguous: true };
  if (!clock) return { at: null, ambiguous: false };
  const day = extractDate(text, now);
  if (day.ambiguous) return { at: null, ambiguous: true };
  let base = day.date ? parseIsoDate(day.date) : startOfLocalDay(now);
  if (base == null) return { at: null, ambiguous: true };
  let at = base + clock.minutes * 60_000;
  if (!day.date && at <= now) at += DAY_MS;
  return { at, ambiguous: false };
}

function collectDurations(text: string, now: number): { index: number; at: number | null }[] {
  const hits: { index: number; at: number | null }[] = [];
  const half = /(?:(\d+(?:\.\d+)?|[零一二两三四五六七八九十百千两]+)\s*个\s*)?半\s*个?\s*(小时|分钟|钟头)/g;
  for (const match of text.matchAll(half)) {
    const base = match[1] ? cnNumber(match[1]) : 0;
    const amount = base == null ? null : base + 0.5;
    hits.push({ index: match.index ?? -1, at: amount == null ? null : addDuration(now, amount, match[2]) });
  }
  const duration =
    /(?:再过|再|过|等)?\s*(\d+(?:\.\d+)?|半|[零一二两三四五六七八九十百千两]+)\s*个?\s*(秒钟|秒|分钟|小时|钟头|天|周|星期|个月|分|日|年)/g;
  for (const match of text.matchAll(duration)) {
    const index = match.index ?? -1;
    if (hits.some((hit) => Math.abs(hit.index - index) < 2)) continue;
    const unit = match[2];
    const number = match[1];
    if (unit === "年" && /^\d{4}$/.test(number)) continue;
    if (unit === "年" && /年\s*\d{1,2}\s*月/.test(text.slice(index))) continue;
    if (unit === "年" && number === "一" && /一年内|满一年|过一年|明年再/.test(text)) continue;
    if (unit === "日" && text[index + match[0].indexOf(number) - 1] === "月") continue;
    const numberAt = index + match[0].lastIndexOf(number);
    if ((unit === "天" || unit === "日") && (number === "一" || number === "1") && /前$/.test(text.slice(Math.max(0, numberAt - 2), numberAt))) {
      continue;
    }
    if (unit === "分" && text[index + match[0].length] === "钟") continue;
    const amount = cnNumber(number);
    hits.push({ index, at: amount == null || amount < 0 ? null : addDuration(now, amount, unit) });
  }
  return hits.filter((hit) => hit.index >= 0);
}

function addDuration(now: number, amount: number, unit: string): number | null {
  if (!Number.isFinite(amount)) return null;
  const date = new Date(now);
  if (unit === "年") {
    const whole = Math.trunc(amount);
    date.setFullYear(date.getFullYear() + whole);
    return finishDuration(date.getTime() + (amount - whole) * 365.25 * DAY_MS);
  }
  if (unit === "个月") {
    const whole = Math.trunc(amount);
    date.setMonth(date.getMonth() + whole);
    return finishDuration(date.getTime() + (amount - whole) * 30 * DAY_MS);
  }
  const unitMs: Record<string, number> = {
    秒: 1000,
    秒钟: 1000,
    分: 60_000,
    分钟: 60_000,
    小时: 3_600_000,
    钟头: 3_600_000,
    天: DAY_MS,
    日: DAY_MS,
    周: 7 * DAY_MS,
    星期: 7 * DAY_MS
  };
  const size = unitMs[unit];
  if (!size) return null;
  return finishDuration(now + amount * size);
}

function finishDuration(at: number): number | null {
  if (!Number.isFinite(at) || at > Date.UTC(9999, 0, 1)) return null;
  return at;
}

function cnNumber(raw: string): number | null {
  if (raw === "半") return 0.5;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const digit = (char: string) => {
    if (char === "两") return 2;
    const index = "零一二三四五六七八九".indexOf(char);
    return index >= 0 ? index : null;
  };
  let total = 0;
  let current = 0;
  for (const char of raw) {
    if (char === "十") current = (current || 1) * 10;
    else if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (char === "千") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (char === "零") continue;
    else {
      const value = digit(char);
      if (value == null) return null;
      current = current >= 10 && current % 10 === 0 ? current + value : current * 10 + value;
      if (current < 10 && total === 0) {
        // single digit or the ones place after 十 is handled above
      }
    }
  }
  return total + current;
}

function extractClock(text: string): { minutes: number; invalid?: boolean } | null {
  const colon = /(\d{1,2}):(\d{2})/.exec(text);
  const spoken =
    /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|今晚|夜里)?\s*(\d{1,2})\s*点\s*(?:(\d{1,2})|半|一刻|三刻)?/.exec(text);
  if (!colon && !spoken) return null;
  const colonFirst = colon && (!spoken || (colon.index ?? 0) <= (spoken.index ?? 0));
  if (colonFirst && colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 23 || minute > 59) return { minutes: 0, invalid: true };
    return { minutes: hour * 60 + minute };
  }
  if (!spoken) return null;
  let hour = Number(spoken[2]);
  const part = spoken[1] || "";
  const minuteWord = spoken[3];
  let minute = 0;
  if (minuteWord == null) {
    const tail = spoken[0];
    if (tail.includes("半")) minute = 30;
    else if (tail.includes("三刻")) minute = 45;
    else if (tail.includes("一刻")) minute = 15;
  } else minute = Number(minuteWord);
  if (part === "下午" || part === "傍晚" || part === "晚上" || part === "今晚" || part === "夜里") {
    if (hour < 12) hour += 12;
  } else if (part === "凌晨" && hour === 12) hour = 0;
  else if ((part === "中午" || part === "早上" || part === "上午" || part === "清晨") && hour === 12) hour = part === "中午" ? 12 : 0;
  if (hour > 23 || minute > 59) return { minutes: 0, invalid: true };
  return { minutes: hour * 60 + minute };
}

function extractDate(text: string, now: number): { date: string; ambiguous: boolean } {
  const hits: { index: number; at: number | null }[] = [];
  const push = (index: number, at: number | null) => {
    if (index >= 0) hits.push({ index, at });
  };

  for (const match of text.matchAll(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})[日号]?/g)) {
    push(match.index ?? -1, calendarDate(Number(match[1]), Number(match[2]), Number(match[3]), now));
  }
  for (const match of text.matchAll(/(明年|后年|今年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g)) {
    const year = yearFromWord(match[1], now);
    push(match.index ?? -1, calendarDate(year, Number(match[2]), Number(match[3]), now, !match[1]));
  }
  const tomorrow = text.search(/大后天|后天|明天/);
  if (tomorrow >= 0) {
    const word = /大后天|后天|明天/.exec(text.slice(tomorrow))?.[0];
    const extra = word === "大后天" ? 3 : word === "后天" ? 2 : 1;
    push(tomorrow, startOfLocalDay(now) + extra * DAY_MS);
  }
  for (const match of text.matchAll(/下周([一二三四五六日天])/g)) {
    push(match.index ?? -1, weekdayOnNextWeek(now, match[1]));
  }
  for (const match of text.matchAll(/(?:星期|周)([一二三四五六日天])/g)) {
    if (text.slice(Math.max(0, (match.index ?? 0) - 1), match.index).endsWith("下")) continue;
    push(match.index ?? -1, upcomingWeekday(now, match[1]));
  }

  if (hits.length === 0) return { date: "", ambiguous: false };
  hits.sort((a, b) => a.index - b.index);
  const first = hits[0];
  if (first.at == null || hits.some((hit) => hit.at == null)) return { date: "", ambiguous: true };
  return { date: formatLocalDate(first.at), ambiguous: false };
}

function yearFromWord(word: string | undefined, now: number): number {
  const year = new Date(now).getFullYear();
  if (word === "明年") return year + 1;
  if (word === "后年") return year + 2;
  return year;
}

function calendarDate(
  year: number,
  month: number,
  day: number,
  now: number,
  rollForward = false
): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (!rollForward) return date.getTime();
  const today = startOfLocalDay(now);
  if (date.getTime() < today) {
    const next = new Date(year + 1, month - 1, day);
    if (next.getMonth() !== month - 1 || next.getDate() !== day) return null;
    return next.getTime();
  }
  return date.getTime();
}

const DOW: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function upcomingWeekday(now: number, label: string): number | null {
  const target = DOW[label];
  if (target == null) return null;
  const start = startOfLocalDay(now);
  const current = new Date(start).getDay();
  const delta = (target - current + 7) % 7;
  return start + delta * DAY_MS;
}

function weekdayOnNextWeek(now: number, label: string): number | null {
  const target = DOW[label];
  if (target == null) return null;
  const start = startOfLocalDay(now);
  const current = new Date(start).getDay();
  const untilMonday = (8 - current) % 7 || 7;
  const monday = start + untilMonday * DAY_MS;
  const fromMonday = target === 0 ? 6 : target - 1;
  return monday + fromMonday * DAY_MS;
}
