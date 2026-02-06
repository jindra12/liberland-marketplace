import { Currencies, IsoCode, isoCodes } from "@sctg/currencies";

export const getCurrencies = () => (Object.keys(isoCodes) as IsoCode[])
  .sort()
  .map((code) => ({
    label: `${code} — ${Currencies.getCurrencyName(code)}`,
    value: code,
  }));