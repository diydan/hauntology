// The lip-synced talking clips of the footage test page (section 8): one still face that speaks one line, made by the owner (docs/story/art/clips/hero-*.mp4).
// `name` is the clip's file without its folder; the build copies docs/story/art/clips/<name>.mp4 to media/lip-<name>.mp4 when that folder exists (it is not in git).
// `text` is the line the clip speaks, word for word, so it is on screen as words too.
export const LIPSYNC = Object.freeze([
  { name: 'hero-whisper-meet', who: 'The Whisper', label: 'Meeting the ghost', text: 'Hello. I was waiting. I did not mind. I am very good at waiting.' },
  { name: 'hero-whisper-haunt-cold-spot', who: 'The Whisper', label: 'Haunt: a cold spot', text: 'Did you feel that? A cold place, just there. It is only me, standing very close. I do not mean to chill you.' },
  { name: 'hero-whisper-haunt-blackout', who: 'The Whisper', label: 'Haunt: blackout', text: 'Shh. I am putting the light out for a moment. Keep your hands where I can hear them.' },
  { name: 'hero-whisper-haunt-restless', who: 'The Whisper', label: 'Haunt: restless', text: 'I cannot keep still tonight. Everything in the house is stirring. Forgive me. I get like this when someone is listening.' },
  { name: 'hero-whisper-end-haunting', who: 'The Whisper', label: 'The haunting wins', text: 'It is quiet now. Nobody found me in time. Stay a little longer, all of you. The door can wait.' },
  { name: 'hero-ashby-welcome', who: 'The Keeper, Mr. Ashby', label: 'Welcome', text: 'Ah. A visitor. I would offer tea, but you can see my difficulty.' },
  { name: 'hero-ashby-closing', who: 'The Keeper, Mr. Ashby', label: 'Closing', text: 'Well. That is that. I shall keep my secrets, and you may keep the memory of how close you were.' },
  { name: 'hero-suspect-vane-confession', who: 'Lady Vane', label: 'Confession', text: 'Oh, very well... it was me. I would like it noted that I was... provoked.' },
  { name: 'hero-suspect-cora-confession', who: 'Cora Bell', label: 'Confession', text: 'Yes. It was me. Well... I mean... the creaking was my best work.' },
  { name: 'hero-suspect-percy-confession', who: 'Percy', label: 'Confession', text: 'Oh, all right! It was me. I had prepared a longer speech. Well... I mean... it was rather good.' },
  { name: 'hero-suspect-pike-confession', who: 'Dr. Pike', label: 'Confession', text: 'It was me. There. I feel... lighter. Well... I mean... do not look at me like that.' },
  { name: 'hero-suspect-thorne-confession', who: 'Captain Thorne', label: 'Confession', text: 'Fine, fine! It was me. I am rather glad it is over. Well... I mean... I was quite good at it.' },
  { name: 'hero-suspect-dunmore-confession', who: 'Mrs. Dunmore', label: 'Confession', text: 'Right, then. It was me. Be honest, am I terribly easy to read? Well... honest, but kind, please.' },
]);

/** The file a clip is served from on the page. */
export const lipsyncFile = (name) => `media/lip-${name}.mp4`;
