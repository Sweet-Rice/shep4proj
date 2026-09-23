import { describe, expect, it } from "vitest";
import { redactBodyText } from "./body.ts";

const PII = ["Jane Doe"];

describe("redactBodyText - key-based name faking", () => {
  it("does not fake Workday UI/navigation labels under taskName/hubName/widget/label/title", () => {
    const body = JSON.stringify({
      taskName: "View Academic Record",
      hubName: "Student Homepage",
      widget: "Announcements",
      label: "Jane Doe",
      title: "Jane Doe",
    });
    const out = JSON.parse(redactBodyText(body, PII) ?? "{}");
    expect(out.taskName).toBe("View Academic Record");
    expect(out.hubName).toBe("Student Homepage");
    expect(out.widget).toBe("Announcements");
    // Even when the label value happens to match the --pii list verbatim,
    // the key itself is a UI label, not a person-name field, so it isn't
    // forced through fakeName - but redactFreeText's pii pass still catches
    // the literal string.
    expect(out.label).not.toBe("Jane Doe");
    expect(out.title).not.toBe("Jane Doe");
  });

  it("fakes real person-name keys regardless of value shape", () => {
    const body = JSON.stringify({
      fullName: "Jane Doe",
      preferredName: "Jane",
      legalName: "Jane Doe",
      studentName: "Jane Doe",
      displayName: "Jane Doe",
      firstName: "Jane",
      lastName: "Doe",
    });
    const out = JSON.parse(redactBodyText(body, PII) ?? "{}");
    for (const key of [
      "fullName",
      "preferredName",
      "legalName",
      "studentName",
      "displayName",
      "firstName",
      "lastName",
    ]) {
      expect(out[key]).toMatch(/^Student /);
    }
  });

  it("fakes a plain `name` key only when the value looks like a person name and matches --pii", () => {
    const body = JSON.stringify({
      name: "Jane Doe",
      // Menu-style label under a plain "name" key: not in the --pii list,
      // and doesn't look like a 2-4 word capitalized person name shape? It
      // does look like it, so the pii-list check is what saves it here.
      name2: "Financial Aid",
    });
    const out = JSON.parse(redactBodyText(body, PII) ?? "{}");
    expect(out.name).not.toBe("Jane Doe");
    expect(out.name).toMatch(/^Student /);
  });

  it("leaves a plain `name` key alone when the value doesn't match the --pii list", () => {
    const body = JSON.stringify({ name: "Financial Aid" });
    const out = JSON.parse(redactBodyText(body, PII) ?? "{}");
    expect(out.name).toBe("Financial Aid");
  });

  it("leaves a plain `name` key alone when the value doesn't look like a person name", () => {
    const body = JSON.stringify({ name: "financial-aid-widget" });
    const out = JSON.parse(redactBodyText(body, PII) ?? "{}");
    expect(out.name).toBe("financial-aid-widget");
  });
});
