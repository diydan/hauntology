/**
 * The two fixed word lists of the puzzles: A to Z only, 3 to 5 letters, gentle (no death or gore words, no real
 * names). `READ_WORDS` are read in Hidden words; `BOARD_WORDS` are spelled on the Spirit board and each gets one
 * line of the Whisper in the ghost-voice Library.
 */
export const READ_WORDS_4 = ["MOON", "DUSK", "LAMP", "BELL", "FERN", "WIND", "DAWN", "REED", "MOTH", "LACE", "MIST", "TIDE"] as const;
export const READ_WORDS_6 = ["CANDLE", "SHADOW", "WILLOW", "BREATH", "WINTER", "GARDEN", "FOREST", "MIRROR", "SILVER", "VELVET", "HOLLOW", "BRANCH"] as const;
export const READ_WORDS_5 = ["EMBER", "QUILT", "HAZEL", "LINEN", "FROST", "SHADE", "PEARL", "MAPLE", "STONE", "FLAME", "NIGHT", "PLUME"] as const;
export const BOARD_WORDS_3 = ["ELM", "OAK", "OWL", "FOG", "DEW", "FIR", "KEY", "URN", "HAT", "SUN", "BEE", "ORB"] as const;
export const BOARD_WORDS_4 = ["HUSH", "DOOR", "STAR", "ROSE", "DOVE", "LEAF", "SNOW", "RAIN", "BIRD", "HALL", "GLOW", "HOME"] as const;
export const BOARD_WORDS_5 = ["GHOST", "MAPLE", "RAVEN", "CLOCK", "SPOON", "CHAIR", "BREAD", "OCEAN", "TOWER", "HONEY", "STORM", "TRAIN"] as const;

export const READ_WORDS = [...READ_WORDS_4, ...READ_WORDS_5, ...READ_WORDS_6] as const;
export const BOARD_WORDS = [...BOARD_WORDS_3, ...BOARD_WORDS_4, ...BOARD_WORDS_5] as const;
export type BoardWord = (typeof BOARD_WORDS)[number];

/**
 * A few gentle words about each Spirit board word, never the word itself: spoken after the word and shown under the
 * board (a phone voice alone is not clear for short words such as URN and FIR).
 */
export const BOARD_CLUES: Readonly<Record<BoardWord, string>> = {
  ELM: "a tall tree", OAK: "a strong tree", OWL: "a bird of the night", FOG: "low grey cloud", DEW: "drops on morning grass", FIR: "an evergreen tree",
  KEY: "it opens a lock", URN: "a tall jar", HAT: "worn on the head", SUN: "it rises each morning", BEE: "it makes honey", ORB: "a glowing ball",
  HUSH: "be very quiet", DOOR: "you open it to come in", STAR: "it shines at night", ROSE: "a red flower", DOVE: "a white bird", LEAF: "it grows on a tree",
  SNOW: "cold, white and soft", RAIN: "it falls from the clouds", BIRD: "it can fly", HALL: "a long room", GLOW: "a soft light", HOME: "where you live",
  GHOST: "a spirit you cannot touch", RAVEN: "a big black bird", CLOCK: "it tells the time", SPOON: "you eat soup with it", CHAIR: "you sit on it", BREAD: "baked from flour",
  OCEAN: "a very big sea", TOWER: "a tall, thin building", HONEY: "sweet, made by bees", STORM: "wind, rain and thunder", TRAIN: "it runs on rails", MAPLE: "a tree with red leaves",
};
