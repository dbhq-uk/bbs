import { may_access } from "bbs-core";
import { CONFERENCES } from "../conferences";

export type Entry = { key: string; label: string; hint?: string };

type Gated = Entry & { sl: number; flags: string; hideWhenMember?: boolean };

/// Every entry declares what it needs, so filtering and authorising come
/// from one declaration and cannot drift apart. That is the reason for
/// having a level model rather than scattering conditionals.
const ENTRIES: Gated[] = [
  ...CONFERENCES.map((c) => ({ key: c.key, label: c.name, sl: 10, flags: "" })),
  {
    key: "W",
    label: "WORLD WIDE WEB GATEWAY",
    hint: "Enter a URL. Bring back a board.",
    sl: 10,
    flags: "",
  },
  { key: "L", label: "LOG ON", sl: 10, flags: "", hideWhenMember: true },
  { key: "N", label: "NEW USER APPLICATION", sl: 10, flags: "", hideWhenMember: true },
  { key: "G", label: "GOODBYE", sl: 20, flags: "" },
];

export function menuEntries(sl: number, flags: string): Entry[] {
  return ENTRIES.filter((e) => {
    if (!may_access(sl, flags, e.sl, e.flags)) return false;
    // A logged-on member is not offered a way to log on again.
    if (e.hideWhenMember && sl >= 20) return false;
    return true;
  }).map(({ key, label, hint }) => ({ key, label, hint }));
}
