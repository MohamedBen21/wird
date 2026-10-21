# Third-party content and licenses

## Quran text and translations: quran-json
- Source: https://github.com/risan/quran-json (npm: `quran-json`)
- License: Creative Commons Attribution 4.0 (CC-BY-4.0)
- Arabic (Uthmani) text from the Noble Quran Encyclopedia (https://quranenc.com).
- English and French translations as distributed by quran-json.
- Changes: repackaged into compact per-language JSON arrays (`public/data/quran-*.json`) by `scripts/build-data.mjs`. Text is unchanged.

## Hadith: hadith-api
- Source: https://github.com/fawazahmed0/hadith-api
- License: The Unlicense (public domain)
- Collections used (Arabic, English, French editions): Forty Hadith of an-Nawawi, Forty Hadith Qudsi, Sahih al-Bukhari, Sahih Muslim.
- Changes: a curated subset, whitespace normalized, repackaged into `public/data/hadith.json` by `scripts/build-data.mjs`.

## Font: Amiri Quran
- Source: https://github.com/aliftype/amiri-quran, distributed through `@fontsource/amiri-quran`
- License: SIL Open Font License 1.1

## Software libraries
React, WXT, Vite, Vitest, TypeScript and their dependencies are used under their respective MIT/Apache-2.0 licenses.
