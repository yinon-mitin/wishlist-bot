/** ISO 4217 currencies with exactly two minor-unit digits. Amounts are stored as integers in minor units. */
export const SUPPORTED_CURRENCIES: readonly string[] = [
  'RUB', 'ILS', 'USD', 'EUR', 'GBP', 'UAH', 'KZT', 'PLN', 'CHF', 'CAD', 'AUD', 'TRY', 'GEL', 'AMD',
  'BYN', 'CZK', 'SEK', 'NOK', 'DKK', 'AED', 'CNY', 'INR', 'BRL', 'MXN', 'SGD', 'HKD', 'NZD', 'ZAR', 'RON', 'BGN',
];

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.includes(code);
}
