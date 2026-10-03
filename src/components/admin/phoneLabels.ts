import { getCountryCallingCode, isSupportedCountry, type Labels } from "react-phone-number-input";
import en from "react-phone-number-input/locale/en";

/** "Tunisia +216" in the phone fields' country list, so the dial code is visible while choosing. */
export const COUNTRY_LABELS: Labels = Object.fromEntries(
  Object.entries(en).map(([code, name]) => [code, isSupportedCountry(code) ? `${name} +${getCountryCallingCode(code)}` : name]),
);
