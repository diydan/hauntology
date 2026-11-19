import type { TimeOfDay, WeatherClass } from "./types";

/**
 * Scripted atmospheric lines (`conditions` 5.3; Requirement 5.2): at least five variants per
 * `(WeatherClass, TimeOfDay)`, written strictly inside the story with no news, crime, death,
 * real events, digits, markup, or pet names.
 */
export const WEATHER_LINES: Readonly<Record<WeatherClass, Readonly<Record<TimeOfDay, readonly string[]>>>> = Object.freeze({
  clear: {
    dawn: [
      "The sky outside has cleared just before sunrise. Stand still a moment.",
      "Pale light gathers along the sill. It will be bright here soon.",
      "First light is thin and clear beyond the glass. Nothing hides in it.",
      "The air is calm and clear at this hour. Look closely at the room.",
      "Dawn begins to wash the corners pale. Take your time looking.",
    ],
    day: [
      "It is a clear day outside, and the room looks almost ordinary in this light.",
      "The light comes straight through the glass today. Nothing blurs the corners.",
      "Outside the sky holds no cloud at all. Inside, something stays quiet.",
      "The light of the day is clear across the floor, and you may look well in it.",
      "Even in clear light, the house keeps what it wishes to keep.",
    ],
    dusk: [
      "The light is going now, clear and slow at the window.",
      "It is a clean dusk on the glass, and the shadows are clear in the hall.",
      "The evening sky fades from pale amber into quiet blue.",
      "At dusk the room gathers its corners back to itself.",
      "Daylight slips away without a cloud to hold it back.",
    ],
    night: [
      "The night sky is open outside, cold and dark above the roof.",
      "It is a clear night. Everything inside looks closer in the dark.",
      "Beyond the glass the air is still and clear. Only the house speaks.",
      "Night lies clear across the roof tiles. Tread softly as you go.",
      "The dark outside is wide and calm. Stay and listen a while.",
    ],
  },
  cloud: {
    dawn: [
      "Grey cloud holds back the sunrise this morning. The light stays muted.",
      "An overcast dawn hangs low past the window. The room stays dim.",
      "Cloud covers the first hour of light. Walk gently through the quiet.",
      "Even as morning begins, heavy cloud keeps the corners soft.",
      "Under the pale cloud, the light of the hour is still only half there.",
    ],
    day: [
      "The cloud is flat and grey, and it keeps the light even on the floor today.",
      "The sky sits grey behind the panes, as if the afternoon cannot decide.",
      "Overcast daylight softens every edge in the room.",
      "High cloud turns the whole day the colour of old ash.",
      "Outside is overcast and still; inside, the house takes its own time.",
    ],
    dusk: [
      "Thick cloud draws dusk in early, turning the window dark.",
      "The evening gathers under a lid of low cloud.",
      "Between cloud and twilight, it is hard to tell what moves in the corner.",
      "Dusk is over the house now, and a grey cloud lies low on the glass.",
      "Cloud swallows the last light before the clock reaches the hour.",
    ],
    night: [
      "Cloud lies low on the roof tonight, and it holds the dark close to the house.",
      "Not a break shows in the clouds tonight. Only the room answers.",
      "The night sits low and covered. Keep your voice gentle here.",
      "Cloud presses darkness nearer to the glass tonight.",
      "With the sky covered, every small sound in the hall is easier to hear.",
    ],
  },
  fog: {
    dawn: [
      "Fog leans close against the morning glass, white and unhurried.",
      "The world stops a few paces past the sill in this dawn fog.",
      "Mist softens the early light until nothing outside has an edge.",
      "Thick morning fog keeps the house to itself at this hour.",
      "Through the dawn mist, only the room you stand in is clear.",
    ],
    day: [
      "There is pale fog beyond the glass, and it hides all that is past the yard.",
      "Today the mist stays put and wraps the house in white.",
      "Even at midday, fog narrows the view to these walls alone.",
      "The fog blurs the light at the window into something very quiet.",
      "Outside is lost in mist. Look inside for what belongs here.",
    ],
    dusk: [
      "Dusk sinks straight into fog, and the panes turn opaque.",
      "Mist thickens with twilight until the window shows only itself.",
      "The evening is here in a wall of grey fog, and it is quiet.",
      "In foggy dusk, the lantern light seems to reach only halfway.",
      "Fog closes the distance beyond the glass while twilight settles.",
    ],
    night: [
      "There is thick fog at night, and it turns the window to a mirror.",
      "Night fog clings to the eaves and hushes everything outside.",
      "Out beyond the sill there is only mist tonight. Stay inside.",
      "The mist keeps the night quiet outside, so every step on the floor is clear.",
      "It is foggy at night, and only the sounds inside the hall are clear.",
    ],
  },
  rain: {
    dawn: [
      "Thin rain whispers down the panes as morning begins.",
      "An early shower taps steadily along the sill in dawn light.",
      "Rain blurs the first grey light on the glass.",
      "There is soft rain in the morning on the roof above us.",
      "Water beads slowly down the glass while the house wakes.",
    ],
    day: [
      "Steady rain crosses the glass today, cool and patient.",
      "Afternoon rain drums lightly against the frame while you walk.",
      "Rain keeps everyone indoors, which suits this place well enough.",
      "Grey light and falling rain turn the room inward today.",
      "Listen to the rain on the roof while you look around.",
    ],
    dusk: [
      "Evening rain shines faintly on the sill as light fades.",
      "Rain deepens the hush of dusk across every room.",
      "Raindrops catch the last pale glow along the window frame.",
      "With dusk and rain together, the corners grow thoughtful.",
      "It is dusk and there is steady rain on the glass.",
    ],
    night: [
      "Night rain taps quietly against the panes. You have plenty of time.",
      "Outside it rains into the dark; inside, the air keeps still.",
      "Rain runs slowly down the window glass through the night.",
      "Listen past the rain tonight. Something smaller waits in the room.",
      "The roof answers every drop tonight while you stand here.",
    ],
  },
  storm: {
    dawn: [
      "There is a storm in the morning and the light at the sill is dim.",
      "Rough weather presses against the shutters before the day has started.",
      "The storm is at the window now, and it shakes the latch.",
      "Storm cloud crowds the sunrise away and leaves the room close.",
      "The morning is dark and there is a heavy storm out past the hall.",
    ],
    day: [
      "A dark storm moves overhead, dimming the afternoon to twilight.",
      "Wind and heavy cloud batter the panes while the floor holds still.",
      "In weather like this, the house prefers all doors kept shut.",
      "Rough storm light shifts across the walls from moment to moment.",
      "The storm makes a ceiling of dark grey right above the roof.",
    ],
    dusk: [
      "Storm and dusk arrive together, leaning hard against the glass.",
      "Heavy weather hurries nightfall across the window.",
      "The evening sky turns slate and restless above the roof.",
      "In stormy dusk, every draft along the wainscot wakes up.",
      "Dark gusts cross the eaves as twilight fades.",
    ],
    night: [
      "The storm rolls hard beyond the glass tonight, though the room stays still.",
      "Outside the gale pushes at the eaves; inside, it barely breathes.",
      "Dark storm weather circles the roof through the night.",
      "Let the weather rage outside tonight. Here we speak quietly.",
      "It is a loud storm night, but this room is still quiet.",
    ],
  },
  snow: {
    dawn: [
      "Pale snow hushes the morning outside the window frame.",
      "Snowlight comes cold and clean through the glass at dawn.",
      "Everything beyond the sill lies white and quiet this morning.",
      "There is fresh snow out there in the first light of day.",
      "It is quiet in the morning when the snow is on the ground.",
    ],
    day: [
      "Snow drifts softly past the glass today and quiets the yard.",
      "Cold white light rises from the snow outside to touch the ceiling.",
      "Falling snow blurs every fence and path beyond the house.",
      "In snowy daylight the corners look brighter and yet colder.",
      "Snow keeps falling outside, patient as dust in an empty room.",
    ],
    dusk: [
      "Twilight turns the falling snow pale blue outside the sill.",
      "The snow holds the last light of dusk longer than the dark ground.",
      "In the snow at dusk, it is so still you can hear your own coat.",
      "The cold blue light at dusk is on the snow.",
      "Snowflakes pass the window softly as evening arrives.",
    ],
    night: [
      "Night settles soft and white over the snow outside.",
      "Even in darkness, snow casts a faint cool hush on the glass.",
      "The snow at night is quiet and there is not a sound.",
      "No footstep sounds outside in this snow, only yours on the boards.",
      "Cold night and falling snow keep the world far from the door.",
    ],
  },
});

export function pickWeatherLine(weather: WeatherClass, timeOfDay: TimeOfDay, rng = Math.random): string {
  const variants = WEATHER_LINES[weather][timeOfDay];
  const raw = rng();
  const r = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return variants[Math.floor(r * variants.length)] as string;
}
