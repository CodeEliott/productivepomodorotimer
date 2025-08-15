import React, { useEffect, useRef, useState } from "react";

// PomodoroTimer.jsx
// Single-file React component (Tailwind CSS assumed)
// Default export a React component that implements:
// - selectable session lengths (120,90,60,30,15,10,5) with tooltips
// - break recommendations after selecting session length
// - circular timer (SVG) + visual progress
// - productivity grey graph with moving black dot
// - minimalist task list with checkmarks (not persistent)
// - celebration (emoji confetti) + victory sound
// - small progress counter (sessions completed)

const DURATIONS = [120, 90, 60, 30, 15, 10, 5];

const DURATION_TOOLTIPS = {
  120: "Two-hour deep-focus block — good for large, complex projects (take a longer break afterwards).",
  90: "Classic ultradian-aligned deep work — excellent for focused creative or learning sessions.",
  60: "Sustained attention for long-form work — balance intensity with a medium break.",
  30: "Great for time-boxed tasks and maintaining momentum without fatigue.",
  15: "Quick bursts to overcome inertia or do small but focused tasks.",
  10: "Micro-sprints for short chores or transitions between projects.",
  5: "Tiny bursts for micro-tasks — good for warmups and refocusing."
};

const BREAK_RECOMMENDATIONS = {
  120: [15, 20, 30],
  90: [15, 20],
  60: [10, 15],
  30: [5, 10],
  15: [3, 5],
  10: [2, 3],
  5: [1, 2]
};

// Utility to format mm:ss
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Create a sampled productivity curve for a given session length in minutes.
// We'll produce a subtle multi-peak curve scaled to session length.
function sampleProductivityCurve(minutes, samples = 200) {
  // Convert minutes to seconds for internal use
  const tMax = minutes * 60;
  // Determine number of peaks: 1 for very short, up to 2-3 for long sessions
  let peaks = 1;
  if (minutes >= 90) peaks = 3;
  else if (minutes >= 60) peaks = 2;
  else if (minutes >= 30) peaks = 1;

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * tMax; // seconds
    // build a base curve: sum of gaussians centered along the session
    let y = 0;
    for (let p = 0; p < peaks; p++) {
      const center = ((p + 1) / (peaks + 1)) * tMax;
      const width = tMax / (peaks * 3.5);
      y += Math.exp(-Math.pow((t - center) / width, 2));
    }
    // Add a slight low-frequency decay toward the end for realism
    y *= 1 - 0.15 * (t / tMax);
    points.push({ x: i / samples, y });
  }
  // normalize y to 0..1
  const ys = points.map((p) => p.y);
  const maxY = Math.max(...ys);
  return points.map((p) => ({ x: p.x, y: p.y / maxY }));
}

export default function PomodoroTimer() {
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [breakMinutes, setBreakMinutes] = useState(null);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(selectedMinutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const [tasks, setTasks] = useState([
    { id: 1, text: "Read article", done: false },
    { id: 2, text: "Write report", done: false }
  ]);
  const [newTask, setNewTask] = useState("");
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [celebrate, setCelebrate] = useState(false);

  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const startTimestampRef = useRef(null);
  const totalSecondsRef = useRef(selectedMinutes * 60);

  const curveRef = useRef(sampleProductivityCurve(selectedMinutes));

  useEffect(() => {
    // update when selectedMinutes changes (reset timer)
    setSecondsLeft(selectedMinutes * 60);
    setElapsed(0);
    totalSecondsRef.current = selectedMinutes * 60;
    curveRef.current = sampleProductivityCurve(selectedMinutes);
    setBreakMinutes(null);
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
  }, [selectedMinutes]);

  useEffect(() => {
    if (!running) return;
    if (!audioCtxRef.current) audioCtxRef.current = null; // lazily init if needed

    startTimestampRef.current = performance.now() - elapsed * 1000;

    function tick(now) {
      const elapsedSec = Math.max(0, (now - startTimestampRef.current) / 1000);
      setElapsed(elapsedSec);
      const left = Math.max(0, Math.ceil(totalSecondsRef.current - elapsedSec));
      setSecondsLeft(left);
      if (elapsedSec >= totalSecondsRef.current) {
        // session ended
        setRunning(false);
        setElapsed(totalSecondsRef.current);
        setSecondsLeft(0);
        setSessionsCompleted((s) => s + 1);
        triggerCelebration();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function startStop() {
    if (running) {
      setRunning(false);
      cancelAnimationFrame(rafRef.current);
    } else {
      // ensure break selection if required
      setRunning(true);
    }
  }

  function resetTimer() {
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
    setSecondsLeft(selectedMinutes * 60);
    setElapsed(0);
  }

  function addTask() {
    if (!newTask.trim()) return;
    setTasks((t) => [...t, { id: Date.now(), text: newTask.trim(), done: false }]);
    setNewTask("");
  }

  function toggleTask(id) {
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  // celebration: confetti and sound
  function triggerCelebration() {
    setCelebrate(true);
    playVictorySound();
    setTimeout(() => setCelebrate(false), 4200);
  }

  function playVictorySound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      // simple 3-tone melody
      o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
      o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.24);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      setTimeout(() => {
        o.stop();
        try { ctx.close(); } catch (e) {}
      }, 1000);
    } catch (e) {
      // audio not supported
    }
  }

  // Graph helpers
  const graphWidth = 700; // viewBox width
  const graphHeight = 120;

  function buildPath(points) {
    // points: [{x:0..1, y:0..1}]
    const coords = points.map((p, i) => {
      const x = p.x * graphWidth;
      const y = graphHeight - p.y * (graphHeight - 10) - 10; // padding
      return { x, y };
    });
    // build smooth path using catmull-rom -> bezier
    function catmullRom2bezier(points) {
      const d = [];
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? i : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

        const bp1x = p1.x + (p2.x - p0.x) / 6;
        const bp1y = p1.y + (p2.y - p0.y) / 6;
        const bp2x = p2.x - (p3.x - p1.x) / 6;
        const bp2y = p2.y - (p3.y - p1.y) / 6;

        if (i === 0) d.push(`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`);
        d.push(`C ${bp1x.toFixed(2)} ${bp1y.toFixed(2)} ${bp2x.toFixed(2)} ${bp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
      }
      return d.join(" ");
    }
    return catmullRom2bezier(coords);
  }

  const points = curveRef.current;
  const pathD = buildPath(points);

  // compute current dot position along the sampled curve based on elapsed fraction
  const fraction = Math.min(1, totalSecondsRef.current > 0 ? elapsed / totalSecondsRef.current : 0);
  const index = Math.floor(fraction * (points.length - 1));
  const dotPoint = points[index] || points[0];
  const dotX = dotPoint ? dotPoint.x * graphWidth : 0;
  const dotY = dotPoint ? graphHeight - dotPoint.y * (graphHeight - 10) - 10 : graphHeight / 2;

  return (
    <div className="min-h-screen bg-white flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold">Pomodoro Timer</h1>
          <p className="text-sm text-gray-500 mt-1">Modern minimalist timer for deep focus</p>
        </header>

        <main className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          {/* Circular timer */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="g" x1="0%" x2="100%">
                    <stop offset="0%" stopColor="#111827" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#111827" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="52" stroke="#e6e7e9" strokeWidth="8" fill="none" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="url(#g)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={Math.PI * 2 * 52}
                  strokeDashoffset={Math.PI * 2 * 52 * (1 - fraction)}
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="64" textAnchor="middle" fontSize="18" fontWeight="700">
                  {formatTime(secondsLeft)}
                </text>
              </svg>
            </div>

            <div className="w-full flex flex-wrap gap-3 justify-center">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  className={`px-3 py-2 rounded-lg text-sm border ${selectedMinutes === d ? "bg-black text-white border-black" : "bg-gray-50 text-gray-800 border-gray-200"}`}
                  onClick={() => setSelectedMinutes(d)}
                  title={DURATION_TOOLTIPS[d]}
                >
                  {d} min
                </button>
              ))}
            </div>

            <p className="text-center text-gray-500 text-sm mt-2">{DURATION_TOOLTIPS[selectedMinutes]}</p>

            {/* Break recommendations */}
            <div className="w-full mt-3">
              <div className="text-xs text-gray-600 mb-1">Recommended breaks</div>
              <div className="flex gap-2 flex-wrap">
                {BREAK_RECOMMENDATIONS[selectedMinutes].map((b) => (
                  <button
                    key={b}
                    className={`px-2 py-1 rounded-md text-sm border ${breakMinutes === b ? "bg-black text-white border-black" : "bg-gray-50 text-gray-800 border-gray-200"}`}
                    onClick={() => setBreakMinutes(b)}
                    title={`Suggested ${b} minute break`}
                  >
                    {b} min
                  </button>
                ))}
                <button className="px-2 py-1 rounded-md text-sm border bg-gray-50 text-gray-800 border-gray-200" onClick={() => setBreakMinutes(0)}>
                  No break
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Choose a break length — suggestions based on ultradian rhythm research.</p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={startStop}
                className="px-5 py-2 rounded-full border border-black bg-black text-white font-medium shadow-sm"
              >
                {running ? "Pause" : "Start"}
              </button>
              <button onClick={resetTimer} className="px-4 py-2 rounded-full border border-gray-200 text-sm">Reset</button>

              <div className="ml-4 text-sm text-gray-600">Sessions: <span className="font-medium text-gray-900">{sessionsCompleted}</span></div>
            </div>
          </div>

          {/* Main content area */}
          <div className="mt-6 grid grid-cols-1 gap-6">
            {/* Tasks */}
            <section className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium">Tasks</h2>
                <div className="text-xs text-gray-400">Check when done</div>
              </div>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-3 bg-white p-2 rounded-md border border-gray-100">
                    <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="w-4 h-4" />
                    <span className={`text-sm ${t.done ? "line-through text-gray-400" : "text-gray-800"}`}>{t.text}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add task" className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm" />
                <button onClick={addTask} className="px-3 py-2 rounded-md bg-black text-white text-sm">Add</button>
              </div>
            </section>

            {/* Productivity graph */}
            <section className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-800">Productivity curve</h3>
                <div className="text-xs text-gray-400">Grey = typical peaks • Black dot = your position</div>
              </div>

              <div className="w-full overflow-hidden rounded-md" style={{ background: "#fbfbfb" }}>
                <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="w-full h-28">
                  <path d={pathD} fill="none" stroke="#e0e0e0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  {/* subtle inner stroke to give depth */}
                  <path d={pathD} fill="none" stroke="#f5f5f5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

                  {/* moving dot */}
                  <circle cx={dotX} cy={dotY} r={5} fill="#000" />
                </svg>
              </div>
            </section>
          </div>
        </main>

        {/* Celebration overlay */}
        {celebrate && (
          <div className="fixed inset-0 pointer-events-none flex items-start justify-center mt-24 z-50">
            <div className="relative w-full max-w-2xl flex justify-center">
              <div className="absolute left-0 right-0 text-center">
                <div className="text-4xl">🎉</div>
                <div className="mt-2 text-lg font-semibold">Great work — session complete!</div>
              </div>
              <EmojiRain />
            </div>
          </div>
        )}

        <footer className="mt-6 text-center text-xs text-gray-400">Tip: try aligning 90–120 minute blocks with your peak focus for best results.</footer>
      </div>
    </div>
  );
}

// Simple emoji confetti / rain component (no external libs)
function EmojiRain() {
  const emojis = ["🎉", "✨", "💪", "🔥", "🥳"];
  const count = 18;
  return (
    <div className="pointer-events-none">
      <div className="relative w-full h-96 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => {
          const left = Math.random() * 100;
          const delay = Math.random() * 0.6;
          const size = 14 + Math.random() * 20;
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: `-10%`,
                fontSize: size,
                transform: `translateY(0) rotate(${Math.random() * 40 - 20}deg)`,
                animation: `fall 3.4s ${delay}s linear forwards`
              }}
            >
              {emoji}
            </span>
          );
        })}

        <style>{`
          @keyframes fall {
            to { transform: translateY(420px) rotate(360deg); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

