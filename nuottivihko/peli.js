const midiByName = {'g¹':67,'a¹':69,'h¹':71,'c²':72,'d²':74};
const lane = document.querySelector('.lane');
const items = [], track = [];
let duration = 0;
let selectedSong = null;

function loadSong(song) {
  selectedSong = song;
  lane.replaceChildren();
  items.length = track.length = 0;
  duration = 0;
  for (const [name, beats] of song.notes) {
    if (name !== null) {
      const el = document.createElement('div');
      el.className = 'note';
      el.innerHTML = '<img class="tail" alt="" src="kuvat/pyrsto.webp"><div class="head"><span class="name"></span></div>';
      el.querySelector('.name').textContent = name;
      lane.append(el);
      const note = {el, name, midi:midiByName[name], start:duration, beats, tail:el.firstChild};
      items.push(note);
      track.push(note);
    }
    duration += beats;
  }
  // One shared boundary for adjacent stars, including the time between notes across rests.
  for (let i = 0; i < items.length; i++) {
    const note = items[i];
    const previousStart = items[i - 1]?.start ?? note.start - note.beats;
    const nextStart = items[i + 1]?.start ?? note.start + note.beats;
    note.opens = (previousStart + note.start) / 2;
    note.closes = (note.start + nextStart) / 2;
  }
  for (let start = 0; start <= duration; start += 4) {
    const el = document.createElement('i');
    el.className = 'barline';
    lane.append(el);
    track.push({el, start});
  }
  document.getElementById('song-title').textContent = song.title;
  play.textContent = 'Käynnistä';
  beat = from = -4;
  targetIndex = mistakes = 0;
  early = waiting = false;
  hint.hidden = true;
  resetResults();
  tell('Soita tässä');
}
const colours = ['#fff4c6','#ffd473','#ed987d','#91d3c7'];
function celebrate(star) {
  const burst = document.createElement('div');
  burst.className = 'burst';
  const flash = document.createElement('i');
  flash.className = 'flash';
  burst.append(flash);
  const scale = Math.min(1.3, Math.max(.65, lane.clientWidth / 900));
  for (let n = 0; n < 18; n++) {
    const piece = document.createElement('i');
    piece.className = 'confetti';
    const angle = (n + Math.random() * .5) * 2 * Math.PI / 18;
    const radius = scale * (45 + Math.random() * 48);
    const style = piece.style;
    style.setProperty('--dx', Math.cos(angle) * radius + 'px');
    style.setProperty('--dy', Math.sin(angle) * radius + 8 * scale + 'px');
    style.setProperty('--spin', n * 29 + 'deg');
    style.setProperty('--color', colours[n % colours.length]);
    style.setProperty('--w', 3 + n % 3 + 'px');
    style.setProperty('--h', 4 + n % 5 + 'px');
    burst.append(piece);
  }
  star.append(burst);
  burst.addEventListener('animationend', event => {
    if (event.target === burst) burst.remove();
  });
}
// Alkuperäinen Taktell Junior WAV on mukana, jotta myös paikallinen index.html toimii.

const bpm = document.getElementById('bpm');
const tempoSlider = document.getElementById('bpm-slider');
const metronome = document.getElementById('metronome');
const play = document.getElementById('play');
let secondsPerBeat = .75, beat = -4, from = -4, origin = null;
let audio, sample, frame = 0, timer = null, nextClick = -4, pendingStart = null;
const scheduled = new Map();
const timingSegments = [];
const level = document.getElementById('level');
const cue = document.getElementById('cue');
const hint = document.querySelector('.hint');
let targetIndex = 0, waiting = false, early = false, mistakes = 0;
const scoreLabel = document.getElementById('score');
const accuracyLabel = document.getElementById('accuracy');
let score = 0;
function setScore(value) {
  score = value;
  scoreLabel.textContent = String(value);
}
function resetResults() {
  setScore(0);
  for (const note of items) {
    note.hit = false;
    note.timing = null;
    note.el.classList.remove('accepted');
  }
  showAccuracy();
}
function showAccuracy() {
  const measured = items.filter(note => note.hit && note.timing !== null);
  const total = measured.reduce((sum, note) => sum + note.timing, 0);
  accuracyLabel.textContent = measured.length ? Math.round(total / measured.length) + ' %' : '—';
}
function recordTiming(note, playedBeat) {
  if (note.timing !== null) return;
  const offset = playedBeat - note.start;
  const span = offset < 0 ? note.start - note.opens : note.closes - note.start;
  note.timing = 100 * Math.max(0, 1 - Math.abs(offset) / span);
  if (note.hit) showAccuracy();
}
function practice() { return level.value === '1'; }
function tell(text) { if (cue.textContent !== text) cue.textContent = text; }

function position(now) {
  return origin === null || waiting ? beat : clockBeat(now);
}
// This clock keeps musical time even while the practice playhead waits on a star.
function clockBeat(now) {
  return from + Math.max(0, now - origin) / secondsPerBeat;
}
// Timestamped reattacks can arrive after a tempo change or a practice wait.
function rememberClock() {
  timingSegments.push({at:origin, from, secondsPerBeat});
}
function beatAtAttack(time) {
  for (let i = timingSegments.length - 1; i >= 0; i--) {
    const segment = timingSegments[i];
    if (time >= segment.at)
      return segment.from + (time - segment.at) / segment.secondsPerBeat;
  }
  return null;
}
function cancelClicks(futureOnly = false) {
  for (const [n, click] of scheduled) {
    if (futureOnly && click.when <= audio.currentTime) continue;
    click.source.stop();
    scheduled.delete(n);
  }
}
function schedule() {
  if (origin === null || waiting) return;
  const now = audio.currentTime;
  while (true) {
    const n = nextClick;
    if (n >= duration || (practice() && n > (items[targetIndex]?.start ?? duration))) return;
    const when = origin + (n - from) * secondsPerBeat;
    if (when > now + .12) return;
    nextClick++;
    if (when < now - .02 || (n >= 0 && !metronome.checked) || scheduled.has(n)) continue;
    const source = audio.createBufferSource();
    source.buffer = sample;
    source.connect(audio.destination);
    scheduled.set(n, {source, when});
    source.onended = () => {
      source.disconnect();
      if (scheduled.get(n)?.source === source) scheduled.delete(n);
    };
    source.start(Math.max(now, when));
  }
}
function updateSettings(value) {
  if (origin !== null) {
    const now = audio.currentTime;
    from = clockBeat(now);
    origin = Math.max(now, origin);
    nextClick = origin > now ? Math.ceil(from) : Math.floor(from) + 1;
    cancelClicks(true);
  }
  secondsPerBeat = 60 / value;
  if (origin !== null) rememberClock();
  schedule();
}
function setTempo(input) {
  let value = Math.round(Number(input.value));
  if (!Number.isFinite(value) || value < 40 || value > 180) value = Math.round(60 / secondsPerBeat);
  bpm.value = tempoSlider.value = String(value);
  if (secondsPerBeat !== 60 / value) updateSettings(value);
}
bpm.addEventListener('change', () => setTempo(bpm));
tempoSlider.addEventListener('input', () => setTempo(tempoSlider));
metronome.addEventListener('change', () => updateSettings(Math.round(60 / secondsPerBeat)));
function draw() {
  const width = lane.clientWidth, step = width * .142;
  for (const item of track) {
    const ahead = item.start - beat;
    item.el.hidden = ahead > 5 || ahead < -8;
    item.el.style.transform = 'translateX(' + (width / 2 + ahead * step) + 'px)';
    if (item.tail) item.tail.style.width = step * item.beats + 'px';
  }
}
// Dot order: left thumb, L1–L3, R1–R3, right little finger (E-flat key).
const fingerings = {67:'11110001', 69:'11100001', 71:'11000001', 72:'01000001', 74:'10111110'};
function showFingering(target) {
  const keys = hint.querySelector('.keys');
  keys.replaceChildren();
  for (const [i, closed] of [...fingerings[target.midi]].entries()) {
    const dot = document.createElement('i');
    dot.className = (closed === '1' ? 'down ' : '') + (i === 0 || i === 7 ? 'side' : '');
    keys.append(dot);
  }
  document.getElementById('finger-title').textContent = target.name + ' · Sormitus';
  hint.hidden = false;
}
function releaseWait() {
  if (!waiting) return;
  waiting = false;
  from = beat;
  origin = audio.currentTime;
  rememberClock();
  nextClick = Math.floor(beat) + 1;
}
function markHit(target) {
  if (target.hit) return;
  target.hit = true;
  target.el.classList.add('accepted');
  setScore(score + 1);
  if (target.timing !== null) showAccuracy();
  celebrate(target.el);
}
function nextTarget(played) {
  if (played) markHit(items[targetIndex]);
  releaseWait();
  targetIndex++;
  early = false;
  mistakes = 0;
  hint.hidden = true;
  tell('Soita tässä');
}
// A shared midpoint belongs to the following star. The last outer edge is inclusive.
const beatEpsilon = 1e-9;
function pastWindow(note, atBeat) {
  return note === items[items.length - 1]
    ? atBeat > note.closes + beatEpsilon
    : atBeat >= note.closes - beatEpsilon;
}
function isSounding(midi, incoming) {
  if (!microphone.ready || !micVoice || micVoice === incoming ||
      micVoice.ended || micVoice.midi !== midi) return false;
  const state = microphone.getState();
  if (!state.aboveGate || Number(state.note?.id) !== midi) return false;
  return !state.accepted || Number(state.accepted.id) === midi;
}
function progress(incoming = null) {
  if (origin === null) return;
  beat = position(audio.currentTime);
  while (targetIndex < items.length) {
    const target = items[targetIndex];
    if (beat + .000001 < target.start) break;
    if (early) { nextTarget(true); continue; }
    if (practice() || !pastWindow(target, beat)) {
      if (isSounding(target.midi, incoming)) {
        nextTarget(true);
        continue;
      }
    }
    if (practice()) {
      beat = target.start;
      waiting = true;
      tell('Soita ' + target.name);
      break;
    }
    if (!pastWindow(target, beat)) break;
    nextTarget(false);
  }
}
function inputNote(voice, at) {
  if (origin === null) return;
  const playedBeat = beatAtAttack(at);
  if (playedBeat === null) return;
  progress(voice);
  const target = items[targetIndex];
  const measured = waiting && playedBeat >= target.start ? target : items.find(note =>
    playedBeat >= note.opens - beatEpsilon && !pastWindow(note, playedBeat));
  if (!measured) return;
  if (measured.midi === voice.midi) {
    recordTiming(measured, playedBeat);
    if (measured !== target) {
      if (measured.start <= beat) markHit(measured);
    } else if (beat >= target.start - .000001) nextTarget(true);
    else early = true;
  } else if (measured === target && !early && practice()) {
    mistakes++;
    tell('Odotetaan ' + target.name);
    if (mistakes >= 2) showFingering(target);
  }
  draw();
}
level.addEventListener('change', () => {
  if (!practice()) {
    if (waiting && origin !== null) nextTarget(false);
    else waiting = false;
    hint.hidden = true;
    tell('Soita tässä');
  }
});
function animate() {
  if (origin === null) return;
  progress();
  draw();
  if (beat >= duration) { pause(); return; }
  frame = requestAnimationFrame(animate);
}
function pause() {
  window.kulkusetSnow?.setPaused(true);
  beat = Math.min(duration, position(audio.currentTime));
  if (waiting) from = clockBeat(audio.currentTime);
  origin = null;
  cancelAnimationFrame(frame);
  clearInterval(timer);
  cancelClicks();
  draw();
  play.textContent = beat >= duration ? 'Soita uudelleen' : 'Jatka';
}
play.onclick = async () => {
  if (game.hidden) return;
  if (origin !== null) { pause(); return; }
  const context = microphone.engine.context;
  if (!microphone.ready || !context || pendingStart === context) return;
  pendingStart = audio = context;
  try {
    await context.resume();
    if (!sample) {
      const bytes = Uint8Array.from(atob(sampleWav), ch => ch.charCodeAt(0));
      const decoded = await context.decodeAudioData(bytes.buffer);
      if (microphone.engine.context !== context) return;
      sample = decoded;
    }
    if (document.hidden || game.hidden || microphone.engine.context !== context) return;
    if (beat >= duration) {
      beat = -4; targetIndex = 0; mistakes = 0;
      resetResults();
      early = waiting = false; hint.hidden = true;
    }
    if (!waiting) from = beat;
    origin = audio.currentTime + .05;
    timingSegments.length = 0;
    rememberClock();
    nextClick = play.textContent === 'Jatka' ? Math.floor(beat) + 1 : Math.ceil(beat);
    if (beat === -4) nextClick = -4;
    play.textContent = 'Tauko';
    window.kulkusetSnow?.setPaused(false);
    schedule();
    timer = setInterval(schedule, 25);
    frame = requestAnimationFrame(animate);
  } catch (error) {
    if (microphone.engine.context === context) {
      play.textContent = 'Yritä uudelleen';
      play.title = 'Äänentoisto ei käynnistynyt.';
    }
  } finally {
    if (pendingStart === context) pendingStart = null;
  }
};
window.addEventListener('resize', draw);

const microphone = new ResonatorSession();
microphone.setReleaseDelayMs(0);
// Bridge a brief pitch dropout, but do not let breath or room noise sustain a star.
const maxUnpitchedMs = 20;
let unpitchedMs = 0;
let micVoice = null;
let articulationEpoch = null;
const game = document.getElementById('game');
const picker = document.getElementById('song-picker');
const songList = document.getElementById('song-list');
const songStatus = document.getElementById('song-status');
const soundingNote = document.getElementById('sounding-note');
let lastSongButton = null;

for (const song of songs) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plate';
  button.textContent = song.title;
  button.onclick = () => {
    if (microphone.opening || microphone.engine.running) return;
    lastSongButton = button;
    if (song !== selectedSong) loadSong(song);
    return microphone.start();
  };
  row.append(button);
  songList.append(row);
}

function refreshMic() {
  const state = microphone.ready ? microphone.getState() : null;
  if (microphone.ready) {
    if (game.hidden && !document.hidden) {
      songStatus.textContent = '';
      picker.hidden = true;
      game.hidden = false;
      document.title = selectedSong.title + ' – Soittopeli';
      draw();
      play.focus();
    }
    // A stable new pitch is playable immediately, including a legato change.
    // The articulation observer can report that same change several blocks later.
    if (state.note && state.note.id === state.accepted?.id) {
      const midi = Number(state.note.id);
      if (micVoice?.midi !== midi || micVoice.ended) beginVoice(midi);
    }
    const label = micVoice && !micVoice.ended && state.note ? state.note.name.toLowerCase() : '—';
    if (soundingNote.textContent !== label) soundingNote.textContent = label;
    return;
  }
  endVoice();
  micVoice = null;
  articulationEpoch = null;
  const active = microphone.opening || microphone.engine.running;
  const wasPlaying = !game.hidden;
  if (wasPlaying && !active) {
    if (origin !== null) pause();
    audio = null;
    game.hidden = true;
    picker.hidden = false;
    document.title = 'Soittopeli – Valitse kappale';
  }
  let message = '';
  if (microphone.phase === 'calibrating') message = 'Mitataan pohjakohinaa. Ole hetki hiljaa.';
  else if (microphone.opening) message = 'Avataan mikrofonia…';
  else if (microphone.status.error) {
    const {name, code} = microphone.status;
    if (name === 'NotAllowedError') message = 'Salli mikrofoni selaimen asetuksissa ja valitse kappale uudelleen.';
    else if (code === 'open-timeout') message = 'Mikrofonin avaus aikakatkaistiin. Valitse kappale uudelleen.';
    else message = 'Mikrofoni ei avautunut. Tarkista yhteys ja selaimen mikrofonilupa.';
  }
  if (songStatus.textContent !== message) songStatus.textContent = message;
  for (const button of songList.querySelectorAll('button')) button.disabled = active;
  if (wasPlaying && !active && !document.hidden) lastSongButton?.focus();
}
microphone.addEventListener('change', refreshMic);
function beginVoice(midi, at = microphone.engine.context.currentTime) {
  unpitchedMs = 0;
  micVoice = {midi, ended:false};
  inputNote(micVoice, at);
}
function endVoice() {
  unpitchedMs = 0;
  if (micVoice) micVoice.ended = true;
  if (soundingNote.textContent !== '—') soundingNote.textContent = '—';
}
microphone.engine.addEventListener('silence', endVoice);
microphone.engine.addEventListener('input', ({detail}) => {
  if (detail.accepted) {
    unpitchedMs = 0;
  } else if (micVoice && !micVoice.ended) {
    unpitchedMs += detail.blockMs;
    if (unpitchedMs >= maxUnpitchedMs) endVoice();
  }
});
microphone.addEventListener('articulation', ({detail}) => {
  if (!microphone.ready) return;
  const now = microphone.engine.context.currentTime;
  // Onset is emitted immediately. Reattack carries the earlier sample timestamp.
  if (detail.kind === 'onset') articulationEpoch = now - detail.timeMs / 1000;
  if (micVoice?.midi !== detail.midi) return;
  if (detail.kind === 'reattack' || (detail.kind === 'onset' && micVoice.ended)) {
    const at = articulationEpoch === null ? now : Math.min(now, articulationEpoch + detail.timeMs / 1000);
    beginVoice(detail.midi, at);
  }
});

function leaveGame() {
  if (origin !== null) pause();
  microphone.stop();
}
document.getElementById('back-to-songs').onclick = () => {
  leaveGame();
  selectedSong = null;
};
window.addEventListener('pagehide', leaveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) leaveGame(); });
