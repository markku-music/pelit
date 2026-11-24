const listen = document.getElementById('listen');
let take = null, listening = false, replayFrame = 0;

function discardTake() {
  finishReplay();
  const old = take;
  take = null;
  listen.hidden = true;
  if (!old) return;
  if (old.recorder.state !== 'inactive') old.recorder.stop();
  if (old.url) URL.revokeObjectURL(old.url);
}

function startTake(resuming) {
  if (resuming && take?.recorder.state === 'paused') {
    take.started = audio.currentTime;
    take.recorder.resume();
    return;
  }
  discardTake();
  if (!window.MediaRecorder) return;
  let source, gain, output;
  function disconnectRecording() {
    source?.disconnect();
    gain?.disconnect();
    output?.stream.getTracks().forEach(track => track.stop());
  }
  try {
    source = audio.createMediaStreamSource(microphone.engine.stream);
    gain = audio.createGain();
    gain.gain.value = 10 ** (6 / 20);
    output = audio.createMediaStreamDestination();
    output.channelCount = 1;
    source.connect(gain);
    gain.connect(output);
    const recorder = new MediaRecorder(output.stream);
    const session = {recorder, frames:[], hits:[], chunks:[], elapsed:0, started:audio.currentTime};
    recorder.ondataavailable = e => { if (e.data.size) session.chunks.push(e.data); };
    recorder.onstop = () => {
      disconnectRecording();
      if (take !== session || !session.chunks.length || !session.frames.length) return;
      session.url = URL.createObjectURL(new Blob(session.chunks, {type:recorder.mimeType}));
      session.chunks.length = 0;
      listen.hidden = false;
    };
    recorder.start(1000);
    take = session;
    captureFrame();
  } catch {
    disconnectRecording();
    tell('Äänitys ei käynnistynyt.');
  }
}

function captureFrame() {
  if (take?.recorder.state !== 'recording') return;
  take.frames.push({time:take.elapsed + audio.currentTime - take.started, beat,
    tuner:readTuner(), note:soundingNote.textContent, cue:cue.textContent, accuracy:accuracyLabel.textContent,
    score, hits:take.hits.splice(0), finger:hint.hidden ? null : targetIndex});
}

function pauseTake(done) {
  if (take?.recorder.state !== 'recording') return;
  captureFrame();
  take.elapsed += audio.currentTime - take.started;
  if (done) take.recorder.stop();
  else take.recorder.pause();
}

function showReplayFrame(f) {
  showTuner(f.tuner);
  beat = f.beat;
  draw();
  soundingNote.textContent = f.note;
  cue.textContent = f.cue;
  scoreLabel.textContent = f.score;
  accuracyLabel.textContent = f.accuracy;
  if (f.finger === null) hint.hidden = true;
  else if (items[f.finger]) showFingering(items[f.finger]);
}

function finishReplay() {
  if (!listening) return;
  listening = false;
  cancelAnimationFrame(replayFrame);
  take.player.pause();
  take.player.onended = take.player.onerror = null;
  showReplayFrame(take.frames[take.frames.length - 1]);
  for (const n of items) if (n.hit) n.el.classList.add('accepted');
  beat = duration;
  draw();
  soundingNote.textContent = '—';
  for (const control of [play, bpm, tempoSlider, level, metronome]) control.disabled = false;
  window.kulkusetSnow?.setPaused(true);
  listen.textContent = 'Kuuntele oma soitto';
}

listen.onclick = async () => {
  if (listening) { finishReplay(); return; }
  if (!take?.url) return;
  const session = take;
  const player = session.player = new Audio(session.url);
  listening = true;
  for (const control of [play, bpm, tempoSlider, level, metronome]) control.disabled = true;
  listen.textContent = 'Lopeta kuuntelu';
  for (const n of items) n.el.classList.remove('accepted');
  window.kulkusetSnow?.setPaused(false);
  let index = 0;
  const render = () => {
    if (!listening || take !== session || session.player !== player) return;
    let current;
    while (index < session.frames.length && session.frames[index].time <= player.currentTime) {
      current = session.frames[index++];
      for (const id of current.hits) {
        items[id].el.classList.add('accepted');
        celebrate(items[id].el);
      }
    }
    if (current) showReplayFrame(current);
    replayFrame = requestAnimationFrame(render);
  };
  player.onended = finishReplay;
  player.onerror = () => { finishReplay(); tell('Kuuntelu ei käynnistynyt.'); };
  showReplayFrame(session.frames[0]);
  try { await player.play(); render(); }
  catch { if (listening && session.player === player) player.onerror(); }
};

const showTuner = ResonatorTuner.mount(document.getElementById('tuner'));
function readTuner() {
  return ResonatorTuner.read(microphone, items[targetIndex]?.name ?? '—');
}
function updateLiveTuner() {
  if (!game.hidden && !document.hidden && !listening) showTuner(readTuner());
  requestAnimationFrame(updateLiveTuner);
}
requestAnimationFrame(updateLiveTuner);
