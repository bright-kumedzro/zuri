/** Currency detection and regional (purchasing-power adjusted) prices for the hosted API plans. */

export interface Currency {
  code: string;
  label: string;
  /** Monthly price per plan, in whole units. Yearly billing is 20% off. */
  pro: number;
  business: number;
}

export const CURRENCIES: Currency[] = [
  { code: "USD", label: "US$ · USD", pro: 12, business: 49 },
  { code: "EUR", label: "€ · EUR", pro: 11, business: 45 },
  { code: "GBP", label: "£ · GBP", pro: 10, business: 39 },
  { code: "NGN", label: "₦ · NGN", pro: 6500, business: 26000 },
  { code: "GHS", label: "GH₵ · GHS", pro: 60, business: 240 },
  { code: "KES", label: "KSh · KES", pro: 650, business: 2600 },
  { code: "ZAR", label: "R · ZAR", pro: 99, business: 399 },
  { code: "INR", label: "₹ · INR", pro: 399, business: 1599 },
  { code: "BRL", label: "R$ · BRL", pro: 29, business: 119 },
];

/** Best guess from the browser's time zone, then its language region. */
export function detectCurrency(): string {
  const saved = localStorage.getItem("zuri.currency");
  if (saved && CURRENCIES.some((c) => c.code === saved)) return saved;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const byZone: [RegExp, string][] = [
    [/^Africa\/Lagos/, "NGN"], [/^Africa\/Accra/, "GHS"], [/^Africa\/Nairobi/, "KES"],
    [/^Africa\/Johannesburg/, "ZAR"], [/^Europe\/(London|Belfast)/, "GBP"], [/^Europe\//, "EUR"],
    [/^Asia\/(Kolkata|Calcutta)/, "INR"], [/^America\/(Sao_Paulo|Fortaleza|Recife|Bahia|Manaus|Belem)/, "BRL"],
  ];
  for (const [re, code] of byZone) if (re.test(tz)) return code;
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const byRegion: Record<string, string> = { NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", GB: "GBP", IN: "INR", BR: "BRL" };
  return byRegion[region] ?? "USD";
}

export function formatPrice(amount: number, code: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: amount < 100 && amount % 1 ? 2 : 0 }).format(amount);
}

/** Yearly plans are 20% off, rounded to something that looks like a price. */
export function yearly(amount: number): number {
  const v = amount * 0.8;
  return v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}
