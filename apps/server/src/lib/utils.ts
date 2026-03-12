import crypto from "node:crypto";

export const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const sha256 = (input: string) =>
  crypto.createHash("sha256").update(input).digest("hex");

export const cleanText = (value: string) =>
  value.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();

export const estimateTokensFromText = (text: string) => Math.ceil(text.length / 4);

const blockedParams = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "ref",
  "source",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export const normalizeUrl = (input: string) => {
  const url = new URL(input);
  url.hash = "";
  Array.from(url.searchParams.keys()).forEach((key) => {
    if (blockedParams.has(key) || key.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  });
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
};

export const limitText = (text: string, maxChars: number) =>
  text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export const toBoolean = (value: number | boolean | null | undefined) => Boolean(value);
