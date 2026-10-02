import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), "utf8");
const tokensCss = read("tokens.css");
const componentsCss = read("components.css");

const darkStart = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
const themes = {
  light: tokensCss.slice(0, darkStart),
  dark: tokensCss.slice(darkStart),
};

function resolve(css: string, name: string, fallbackCss: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  if (value === undefined) {
    if (css === fallbackCss) {
      throw new Error(`${name} is not defined in tokens.css`);
    }
    return resolve(fallbackCss, name, fallbackCss);
  }
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  return ref?.[1] ? resolve(css, ref[1], fallbackCss) : value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("form control border contrast (WCAG 1.4.11)", () => {
  it("styles input and select borders with --border-control", () => {
    const rule =
      /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select \{[^}]*\}/.exec(
        componentsCss,
      )?.[0];
    expect(rule).toContain("border: 1px solid var(--border-control)");
  });

  for (const [theme, css] of Object.entries(themes)) {
    for (const background of ["surface", "bg", "surface-2"]) {
      it(`has at least 3:1 against --${background} in ${theme} theme`, () => {
        const border = resolve(css, "--border-control", tokensCss);
        const bg = resolve(css, `--${background}`, tokensCss);
        expect(contrast(border, bg)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
