'use strict';

/**
 * Curated ayah references, grouped by theme.
 *
 * This file is the human-maintained source of truth for WHICH verses the
 * plugin may show. The actual Arabic text, transliteration and translations
 * are pulled from verified Quran APIs by `npm run build:data` and committed
 * to data/ayahs.json, so the runtime never needs network access.
 *
 * Themes (matching the original claude-code-quran project):
 *   ilm       - knowledge, learning, reflection, intention
 *   tawakkul  - reliance on Allah, effort, trust
 *   shukr     - gratitude, remembrance, reflection on blessings
 *   ihsan     - excellence, character, mercy, speech
 *   sabr      - patience, perseverance, hardship
 *
 * An ayah may belong to more than one theme; it is then weighted once per
 * theme it appears in, which is intentional.
 */

module.exports = {
  ilm: [
    '96:1', '96:3', '96:4', '96:5',
    '2:31', '2:32', '2:151', '2:164', '2:269',
    '3:7', '3:190', '3:191',
    '4:82',
    '6:97',
    '10:5',
    '16:43',
    '17:36', '17:85',
    '18:109',
    '20:114',
    '29:43',
    '31:27',
    '35:28',
    '39:9',
    '41:53',
    '45:13',
    '50:37',
    '51:21',
    '55:4',
    '58:11',
    '68:1',
    '90:10',
  ],

  tawakkul: [
    '2:216', '2:286',
    '3:122', '3:145', '3:159', '3:173',
    '5:23',
    '7:89',
    '8:2',
    '9:51', '9:129',
    '10:85',
    '11:88',
    '12:67',
    '14:12',
    '25:58',
    '26:217',
    '27:79',
    '29:60',
    '33:3',
    '39:38',
    '40:44',
    '48:4',
    '51:58',
    '64:13',
    '65:2', '65:3', '65:7',
    '67:29',
    '73:9',
    '92:7',
  ],

  shukr: [
    '2:152', '2:172',
    '6:141',
    '7:10',
    '10:58',
    '14:7', '14:34',
    '16:14', '16:18', '16:53', '16:78', '16:83', '16:114',
    '23:78',
    '27:19', '27:40',
    '31:12', '31:14',
    '32:9',
    '34:13',
    '35:12',
    '36:35',
    '39:66',
    '40:64',
    '43:73',
    '56:70',
    '67:23',
    '76:2',
    '80:32',
  ],

  ihsan: [
    '2:83', '2:177', '2:195',
    '3:92', '3:104', '3:110', '3:134', '3:148',
    '4:36', '4:58', '4:125',
    '5:93',
    '7:56',
    '16:90', '16:97',
    '17:23', '17:24',
    '25:63',
    '28:77',
    '29:69',
    '41:34',
    '42:40',
    '49:11', '49:12', '49:13',
    '55:60',
    '68:4',
    '90:17',
    '103:3',
  ],

  sabr: [
    '2:45', '2:153', '2:155', '2:156', '2:177', '2:250',
    '3:146', '3:200',
    '11:115',
    '12:83', '12:90',
    '13:24',
    '16:42', '16:127',
    '25:75',
    '28:80',
    '32:24',
    '39:10',
    '41:35',
    '42:43',
    '46:35',
    '47:7',
    '57:23',
    '70:5',
    '76:24',
    '90:17',
    '103:3',
  ],
};
