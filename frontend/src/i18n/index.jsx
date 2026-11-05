/* eslint-disable react-refresh/only-export-components --
   The provider and its hook are intentionally colocated: this module is
   the i18n entry point, not a component file that Fast Refresh tracks. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import en from "./en";
import zhCN from "./zh-CN";

const STORAGE_KEY = "decisiontrace.locale";
const DEFAULT_LOCALE = "zh-CN";

export const LOCALES = [
  { id: "zh-CN", label: "中文", short: "中", htmlLang: "zh-CN" },
  { id: "en", label: "English", short: "EN", htmlLang: "en" },
];

const I18nContext = createContext(null);

function normalizeLocale(value) {
  if (!value) {
    return null;
  }

  const lower = String(value).toLowerCase();

  if (lower.startsWith("zh")) {
    return "zh-CN";
  }

  if (lower.startsWith("en")) {
    return "en";
  }

  return null;
}

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function lookup(messages, key) {
  return Object.prototype.hasOwnProperty.call(messages, key)
    ? messages[key]
    : undefined;
}

function interpolate(template, params) {
  if (!params || typeof template !== "string") {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match
  );
}

function translate(messages, key, params, fallback) {
  const value =
    lookup(messages, key) ?? lookup(en, key) ?? fallback ?? key;

  return interpolate(value, params);
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    // A date-only value is a calendar day, not an instant. Parsing it as
    // local midnight avoids the UTC shift that made 2026-11-20 display as
    // the 19th in western time zones.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (dateOnly) {
      const date = new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      );

      return Number.isNaN(date.getTime()) ? null : date;
    }

    // SQLite / Pydantic can hand back "2026-11-05 14:20:00" without a
    // timezone designator. Safari rejects the space form; normalising it
    // keeps history timestamps readable in every browser.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
      return toDate(value.replace(" ", "T"));
    }
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, locale, options = {}) {
  const date = toDate(value);

  if (!date) {
    return value ? String(value) : "";
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(date);
}

function formatDateTime(value, locale, options = {}) {
  const date = toDate(value);

  if (!date) {
    return value ? String(value) : "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(
    () => readStoredLocale() ?? DEFAULT_LOCALE
  );

  const messages = locale === "en" ? en : zhCN;

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next) ?? DEFAULT_LOCALE;

    setLocaleState(normalized);

    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // A private-mode storage failure must not break the language switch.
    }
  }, []);

  const t = useCallback(
    (key, params, fallback) => translate(messages, key, params, fallback),
    [messages]
  );

  const tp = useCallback(
    (key, count, params = {}) => {
      const category =
        new Intl.PluralRules(locale).select(count) === "one"
          ? "one"
          : "other";

      const oneKey = `${key}.one`;
      const otherKey = `${key}.other`;
      const preferred =
        category === "one" && lookup(messages, oneKey) ? oneKey : otherKey;

      return translate(
        messages,
        preferred,
        { ...params, count },
        translate(messages, otherKey, { ...params, count })
      );
    },
    [locale, messages]
  );

  const te = useCallback(
    (message) => {
      if (!message) {
        return "";
      }

      if (locale === "en") {
        return message;
      }

      const exact = lookup(messages, `errors.${message}`);

      if (exact) {
        return interpolate(exact, {});
      }

      const importFailure = /^Could not import (.+)\.$/.exec(message);

      if (importFailure) {
        return `无法导入 ${importFailure[1]}。`;
      }

      return message;
    },
    [locale, messages]
  );

  const formatDateForLocale = useCallback(
    (value, options) => formatDate(value, locale, options),
    [locale]
  );

  const formatDateTimeForLocale = useCallback(
    (value, options) => formatDateTime(value, locale, options),
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    document.title = translate(messages, "app.title", {}, "DecisionTrace");
  }, [locale, messages]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      messages,
      t,
      tp,
      te,
      formatDate: formatDateForLocale,
      formatDateTime: formatDateTimeForLocale,
    }),
    [
      locale,
      setLocale,
      messages,
      t,
      tp,
      te,
      formatDateForLocale,
      formatDateTimeForLocale,
    ]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>.");
  }

  return context;
}
