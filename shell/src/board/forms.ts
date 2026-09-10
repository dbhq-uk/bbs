import { caller } from "../auth";

/// A terminal form: a sequence of prompts filled one at a time, which is
/// how a board asked for anything. No focus management, no tab order, no
/// simultaneous fields - you answer, you press RETURN, you move on.
export type Field = { key: string; label: string; secret?: boolean };

export type Form = {
  title: string;
  fields: Field[];
  at: number;
  values: Record<string, string>;
  status: string;
  busy: boolean;
};

export function newForm(title: string, fields: Field[]): Form {
  return { title, fields, at: 0, values: {}, status: "", busy: false };
}

export function formLines(f: Form): string[] {
  const out = ["", `   ${f.title}`, "   " + "─".repeat(f.title.length), ""];
  f.fields.forEach((field, i) => {
    const v = f.values[field.key] ?? "";
    const shown = field.secret ? "*".repeat(v.length) : v;
    const cursor = i === f.at && !f.busy ? "_" : "";
    const done = i < f.at;
    out.push(`   ${field.label.padEnd(12)} ${shown}${cursor}${done ? "" : ""}`);
    out.push("");
  });
  if (f.status) out.push(`   ${f.status}`, "");
  // ESC, not Q. A form takes every character as typed, so Q is a letter
  // here and always was - the legend named a key the form cannot honour
  // without making it impossible to have a Q in a password.
  out.push("   RETURN to continue   ESC to abandon");
  return out;
}

/// Applies a keypress. Returns true when the last field has been answered
/// and the form is ready to submit.
export function formKey(f: Form, key: string): boolean {
  if (f.busy) return false;
  const field = f.fields[f.at];
  if (!field) return false;

  if (key === "Enter") {
    if (!(f.values[field.key] ?? "").length) return false;
    if (f.at < f.fields.length - 1) {
      f.at++;
      return false;
    }
    return true;
  }
  if (key === "Backspace") {
    f.values[field.key] = (f.values[field.key] ?? "").slice(0, -1);
    return false;
  }
  if (key.length === 1) {
    // As typed. The comment here used to say "passwords keep their case"
    // above a line that read `field.secret ? key : key` - a no-op guarding
    // against something that had already happened one layer up, where every
    // key was uppercased before a form ever saw it.
    f.values[field.key] = (f.values[field.key] ?? "") + key;
  }
  return false;
}

export function whoLine(): string {
  const c = caller();
  const tier = c.sl >= 100 ? "SYSOP" : c.sl >= 20 ? "MEMBER" : c.sl <= 0 ? "TWIT" : "GUEST";
  return `${c.handle}  (${tier})`;
}
