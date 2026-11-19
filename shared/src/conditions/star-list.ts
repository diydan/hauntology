/**
 * Public-domain bright navigational star catalogue (`conditions` 6.1; Requirement 6.1).
 *
 * Source & Licence: Derived from the Yale Bright Star Catalogue (5th Revised Edition, Hoffleit & Warren 1991,
 * NASA/ADC public domain) and the U.S. Naval Observatory Nautical Almanac navigational star positions (J2000.0,
 * U.S. government work in the public domain; no share-alike attribution). Ordered brightest-first.
 */
export type StarCatalogEntry = Readonly<{
  ra: number;
  dec: number;
  mag: number;
  name?: string;
}>;

export const STAR_LIST: readonly StarCatalogEntry[] = Object.freeze(
  (
    [
      { ra: 101.2872, dec: -16.7161, mag: -1.46, name: "Sirius" },
      { ra: 95.9879, dec: -52.6957, mag: -0.74, name: "Canopus" },
      { ra: 213.9153, dec: 19.1824, mag: -0.05, name: "Arcturus" },
      { ra: 219.9021, dec: -60.834, mag: -0.01, name: "Rigil Kentaurus" },
      { ra: 279.2347, dec: 38.7837, mag: 0.03, name: "Vega" },
      { ra: 79.1723, dec: 45.998, mag: 0.08, name: "Capella" },
      { ra: 78.6345, dec: -8.2016, mag: 0.13, name: "Rigel" },
      { ra: 114.8255, dec: 5.225, mag: 0.34, name: "Procyon" },
      { ra: 24.4285, dec: -57.2368, mag: 0.46, name: "Achernar" },
      { ra: 88.7929, dec: 7.4071, mag: 0.5, name: "Betelgeuse" },
      { ra: 210.9559, dec: -60.373, mag: 0.61, name: "Hadar" },
      { ra: 297.6958, dec: 8.8683, mag: 0.76, name: "Altair" },
      { ra: 186.6496, dec: -63.0991, mag: 0.76, name: "Acrux" },
      { ra: 68.9802, dec: 16.5093, mag: 0.86, name: "Aldebaran" },
      { ra: 201.2982, dec: -11.1613, mag: 0.97, name: "Spica" },
      { ra: 247.3519, dec: -26.432, mag: 1.06, name: "Antares" },
      { ra: 116.329, dec: 28.0262, mag: 1.14, name: "Pollux" },
      { ra: 344.4127, dec: -29.6222, mag: 1.16, name: "Fomalhaut" },
      { ra: 310.358, dec: 45.2803, mag: 1.25, name: "Deneb" },
      { ra: 191.9303, dec: -59.6888, mag: 1.25, name: "Mimosa" },
      { ra: 152.093, dec: 11.9672, mag: 1.35, name: "Regulus" },
      { ra: 104.6565, dec: -28.9721, mag: 1.5, name: "Adhara" },
      { ra: 113.6494, dec: 31.8883, mag: 1.58, name: "Castor" },
      { ra: 187.7915, dec: -57.1132, mag: 1.63, name: "Gacrux" },
      { ra: 263.4022, dec: -37.1038, mag: 1.63, name: "Shaula" },
      { ra: 81.2828, dec: 6.3497, mag: 1.64, name: "Bellatrix" },
      { ra: 81.573, dec: 28.6075, mag: 1.65, name: "Elnath" },
      { ra: 138.2999, dec: -69.7172, mag: 1.68, name: "Miaplacidus" },
      { ra: 84.0534, dec: -1.2019, mag: 1.69, name: "Alnilam" },
      { ra: 332.0583, dec: -46.961, mag: 1.74, name: "Alnair" },
      { ra: 193.5073, dec: 55.9598, mag: 1.77, name: "Alioth" },
      { ra: 165.932, dec: 61.751, mag: 1.79, name: "Dubhe" },
      { ra: 51.0807, dec: 49.8612, mag: 1.8, name: "Mirfak" },
      { ra: 107.0979, dec: -26.3932, mag: 1.84, name: "Wezen" },
      { ra: 264.3297, dec: -42.9978, mag: 1.87, name: "Sargas" },
      { ra: 276.043, dec: -34.3846, mag: 1.85, name: "Kaus Australis" },
      { ra: 125.6285, dec: -59.5095, mag: 1.86, name: "Avior" },
      { ra: 206.8852, dec: 49.3133, mag: 1.86, name: "Alkaid" },
      { ra: 89.8822, dec: 44.9474, mag: 1.9, name: "Menkalinan" },
      { ra: 252.1662, dec: -69.0277, mag: 1.92, name: "Atria" },
      { ra: 99.428, dec: 16.3993, mag: 1.93, name: "Alhena" },
      { ra: 306.4119, dec: -56.7351, mag: 1.94, name: "Peacock" },
      { ra: 131.1759, dec: -54.7088, mag: 1.96, name: "Alsephina" },
      { ra: 95.6749, dec: -17.9559, mag: 1.98, name: "Mirzam" },
      { ra: 37.9546, dec: 89.2641, mag: 1.98, name: "Polaris" },
      { ra: 141.8968, dec: -8.6586, mag: 1.98, name: "Alphard" },
      { ra: 31.7934, dec: 23.4624, mag: 2.0, name: "Hamal" },
      { ra: 154.9931, dec: 19.8415, mag: 2.01, name: "Algieba" },
      { ra: 10.8974, dec: -17.9866, mag: 2.02, name: "Diphda" },
      { ra: 283.8164, dec: -26.2967, mag: 2.04, name: "Nunki" },
      { ra: 211.6706, dec: -36.3699, mag: 2.06, name: "Menkent" },
      { ra: 17.433, dec: 35.6206, mag: 2.05, name: "Mirach" },
      { ra: 2.0969, dec: 29.0904, mag: 2.06, name: "Alpheratz" },
      { ra: 86.9391, dec: -9.6696, mag: 2.06, name: "Saiph" },
      { ra: 222.6764, dec: 74.1555, mag: 2.08, name: "Kochab" },
      { ra: 263.7336, dec: 12.56, mag: 2.08, name: "Rasalhague" },
      { ra: 47.0422, dec: 40.9556, mag: 2.12, name: "Algol" },
      { ra: 177.2649, dec: 14.5721, mag: 2.14, name: "Denebola" },
      { ra: 200.9814, dec: 54.9254, mag: 2.23, name: "Mizar" },
      { ra: 10.1268, dec: 56.5373, mag: 2.23, name: "Schedar" },
    ] as StarCatalogEntry[]
  )
    .slice()
    .sort((a, b) => a.mag - b.mag)
    .map((entry) => Object.freeze(entry)),
);
