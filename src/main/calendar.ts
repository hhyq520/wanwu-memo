import { spawn } from "node:child_process";
import { listUnlinkedReminders, setCalendarEventId } from "./catalog";
import type { CatalogItem } from "@shared/types";

const CALENDAR_NAME = "万物备忘";

const SCRIPT = `on run argv
  set itemId to item 1 of argv
  set eventTitle to item 2 of argv
  set eventNotes to item 3 of argv
  set actionName to item 4 of argv
  set calName to item 5 of argv
  set marker to "wanwu-id:" & itemId
  set monthList to {January, February, March, April, May, June, July, August, September, October, November, December}

  tell application "Calendar"
    launch
    set targetCal to missing value
    repeat with c in calendars
      if (name of c as text) is calName then
        set targetCal to c
        exit repeat
      end if
    end repeat
    if targetCal is missing value then
      if actionName is "delete" then return ""
      set targetCal to make new calendar with properties {name:calName}
    end if

    set doomedIds to {}
    repeat with e in events of targetCal
      try
        if description of e contains marker then set end of doomedIds to id of e
      end try
    end repeat
    repeat with eid in doomedIds
      set eidText to contents of eid
      delete (first event of targetCal whose id is eidText)
    end repeat
    if actionName is "delete" then return ""

    set y to item 6 of argv as integer
    set m to item 7 of argv as integer
    set dday to item 8 of argv as integer
    set hh to item 9 of argv as integer
    set mm to item 10 of argv as integer
    set ss to item 11 of argv as integer
    set startDate to current date
    set day of startDate to 1
    set year of startDate to y
    set month of startDate to (item m of monthList)
    set day of startDate to dday
    set time of startDate to (hh * hours + mm * minutes + ss)
    set endDate to startDate + (15 * minutes)
    set notes to eventNotes & linefeed & marker
    tell targetCal
      set newEvent to make new event at end of events with properties {summary:eventTitle, description:notes, «property wr1s»:startDate, «property wr5s»:endDate}
    end tell
    tell newEvent
      make new display alarm at end of display alarms with properties {trigger interval:0}
    end tell
    return id of newEvent
  end tell
end run
`;

function runCalendarScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-", ...args], { timeout: 120000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript 退出 ${code}`));
    });
    child.stdin.write(SCRIPT);
    child.stdin.end();
  });
}

function eventCopy(item: CatalogItem): { title: string; notes: string } {
  const title = (item.title || "未命名").replace(/\s+/g, " ").trim();
  const detail = [item.summary, item.howto].filter(Boolean).join("\n").slice(0, 500);
  return {
    title: `提醒：${title}`,
    notes: detail || "来自万物备忘"
  };
}

export async function syncItemCalendar(item: CatalogItem): Promise<void> {
  if (process.platform !== "darwin") return;
  const active = item.remindKind !== "none" && item.remindAt > 0 && item.remindDismissedAt === 0;
  if (!active && !item.calendarEventId) return;
  try {
    if (!active) {
      await runCalendarScript([item.id, "", "", "delete", CALENDAR_NAME, "0", "0", "0", "0", "0", "0"]);
      setCalendarEventId(item.id, "");
      return;
    }
    const copy = eventCopy(item);
    const when = new Date(item.remindAt);
    const eventId = await runCalendarScript([
      item.id,
      copy.title,
      copy.notes,
      "upsert",
      CALENDAR_NAME,
      String(when.getFullYear()),
      String(when.getMonth() + 1),
      String(when.getDate()),
      String(when.getHours()),
      String(when.getMinutes()),
      String(when.getSeconds())
    ]);
    setCalendarEventId(item.id, eventId);
  } catch (error) {
    console.error("日历提醒失败", error);
  }
}

export async function removeItemCalendar(itemId: string): Promise<void> {
  if (process.platform !== "darwin" || !itemId) return;
  try {
    await runCalendarScript([itemId, "", "", "delete", CALENDAR_NAME, "0", "0", "0", "0", "0", "0"]);
  } catch (error) {
    console.error("删除日历提醒失败", error);
  }
}

export async function syncUnlinkedCalendars(): Promise<void> {
  if (process.platform !== "darwin") return;
  for (const item of listUnlinkedReminders()) {
    await syncItemCalendar(item);
  }
}
