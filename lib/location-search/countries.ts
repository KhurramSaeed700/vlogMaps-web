// ISO 3166-1 territories, localized by the runtime's ICU data. Country filters
// are only inferred from full names, never ambiguous two-letter abbreviations.
const codes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ")
let countryNames: Map<string, string> | undefined

export function lookupCountryName(value: string, normalize: (value: string) => string) {
  if (!countryNames) {
    countryNames = new Map()
    for (const locale of ["en", "de", "fr", "es", "pt", "it", "pl", "tr", "ru", "uk", "ar", "ur", "fa", "hi", "bn", "ja", "zh", "ko", "vi", "th", "id", "nl", "sv", "el", "he"]) {
      const names = new Intl.DisplayNames([locale], { type: "region" })
      for (const code of codes) {
        const name = names.of(code)
        if (name && name !== code) countryNames.set(normalize(name), code.toLowerCase())
      }
    }
    for (const [name, code] of Object.entries({ usa: "us", "u s a": "us", "united states of america": "us", uk: "gb", "u k": "gb", "great britain": "gb", "south korea": "kr", "north korea": "kp", "czech republic": "cz", turkey: "tr", "uae": "ae" })) countryNames.set(name, code)
    countryNames.delete("georgia") // ambiguous with the US state
  }
  return countryNames.get(normalize(value)) ?? null
}
