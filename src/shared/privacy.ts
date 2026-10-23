import type { ItemDraft } from "./types";

export type VaultIntent = "show" | "hide";

const COLLECTION =
  "锁起来的(?:卡片|项目|条目)?|锁着的|上锁的|锁住的(?:卡片)?|加锁的|私密的|私密卡片|私密项目|私密条目";

const SHOW_RE = new RegExp(
  `(?<!别)(?<!不要)(?<!别再)(?:显示|打开|看看|看一下|查看|调出|给我看).{0,12}(?:${COLLECTION})|(?:${COLLECTION}).{0,12}(?:打开|显示出来|调出来|看看)`
);

const UNLOCK_ALL_RE =
  /(?<!别)(?<!不要)(?<!别再)(?:解锁|解开)(?:一下|下)?(?:所有|全部|全都)(?:的)?(?:锁|卡片|项目|条目|私密)?|(?<!别)(?<!不要)(?<!别再)(?:所有|全部|全都)(?:的)?(?:锁|卡片|项目|条目|私密)?(?:都)?(?:解锁|解开)/;

const HIDE_RE = new RegExp(
  `(?:隐藏|藏起来|藏起|别显示|别再显示|不要显示|不要再显示|别打开|不要打开|关掉).{0,12}(?:${COLLECTION})|(?:${COLLECTION}).{0,12}(?:藏起来|隐藏|关掉)|(?:别|不要).{0,16}(?:${COLLECTION}).{0,8}(?:打开|显示)`
);

const ITEM_LOCK_RE = /加锁|锁起来|锁上|设为私密|标成私密|标为私密|别让人看到|不要让人看到|别让别人看到|不要让别人看到/;

export const ITEM_LOCK_NOTE = "这条会加锁，平时不显示。";

export function vaultIntent(text: string): VaultIntent | null {
  if (HIDE_RE.test(text)) return "hide";
  if (SHOW_RE.test(text) || UNLOCK_ALL_RE.test(text)) return "show";
  return null;
}

export function wantsItemLock(text: string): boolean {
  if (vaultIntent(text)) return false;
  const stripped = text.replace(/锁起来的|锁着的|上锁的|锁住的|加锁的/g, "");
  return ITEM_LOCK_RE.test(stripped);
}

const CONFIRM_RE = /^(确定|保存|好|好的|对|可以|行)[了吧啊呀。.!！]*$/;

export function privacySource(priorUserTexts: string[], userText: string): string {
  const current = userText.trim();
  const previous = priorUserTexts.filter(Boolean).at(-1);
  if (previous && CONFIRM_RE.test(current)) return `${previous}\n${current}`;
  return userText;
}

export function stampPrivacy(text: string, draft: ItemDraft): { draft: ItemDraft; note?: string } {
  if (!wantsItemLock(text) || draft.private) return { draft };
  return { draft: { ...draft, private: true }, note: ITEM_LOCK_NOTE };
}
