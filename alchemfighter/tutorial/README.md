# Level 1: Electromagnetic Stardust (first playable slice)

Beats 1 and 2 of [`docs/levels/01-hydrogen-tutorial.md`](../../docs/levels/01-hydrogen-tutorial.md),
in the browser window or a PC VR headset (WebXR, the Enter VR button). Live at `rationalbonding.com/alchemfighter/tutorial/` once merged.

- **Beat 1, meet the proton:** a lone proton drawn as the glow of its electric field (log scale,
  capped), with Field view lines.
- **Beat 2, first capture:** the electron gun, with an aim cone that is wider for slower electrons
  (the electron is a wave). Every pass is reported with its closest approach, its chance in the
  game and its real chance. On a capture the electron cloud appears in the level it landed in and
  steps down to 1s, giving off one photon per step, which the spectrometer in the sphere's wall
  records as it passes out.

## Files

| File | Role |
|---|---|
| `physics.js` | Pure physics, no DOM: constants, Kramers capture cross sections, per-pass capture odds, aim cone, hydrogen decay table, Coulomb motion in the sphere |
| `orbitals.js` | Hydrogen wavefunctions, ported unchanged from the rebuild's `prototype/index.html` |
| `render.js` | WebGL2: stars, the sphere's wall, field glows, ray-marched electron clouds, lines, the VR panel; draws once per eye in VR |
| `mat4.js` | Small matrix helpers for the flat camera and the headset's eyes |
| `game.js` | Beats, tutor lines, flight controls, the gun, the cascade, the HUD |
| `physics.test.mjs` | Unit tests: `node --test alchemfighter/tutorial/physics.test.mjs` |

## The physics, and where it is simplified

- **Motion** is classical Coulomb motion of every charge (velocity Verlet with adaptive steps).
  Matter bounces off the wall without losing energy, in a random direction as real surfaces
  scatter (Knudsen's cosine law); light passes through it.
- **Capture odds per pass.** The total chance follows Kramers' cross section for radiative
  recombination into n = 1 to 4. How it depends on the closest approach r_p follows the classical
  radiated energy near closest approach (∝ r_p^−5/2), softened inside about the size of the n = 2
  orbit, and normalised so a uniform beam gives exactly the Kramers cross section. The HUD shows
  both the real chance and the game's, which is the real one × 600,000 (`RATE_BOOST`).
- **Aim cone:** the gun focuses the electron's wave from a 30 nm aperture, so the spot is about
  ƛ·D / 30 nm (ƛ is the electron's reduced wavelength, D the distance).
- **Where the electron lands:** shell n in proportion to Kramers' partial cross sections, sub-level
  l in proportion to 2l + 1 (a statistical simplification), then real lifetimes and branching
  ratios down to 1s. Capture into n ≥ 5 is left out for now, so the red H-alpha line shows up in
  about 1 capture in 6, fewer than in a real nebula.
- **2s** decays by two photons sharing 10.2 eV after about 0.12 s, cut short to 120 fs (logged).
- **Photon recoil** is applied to the atom (about 3 m/s for Lyman-alpha).
- **Time: one clock, nothing pauses.** At full speed 1 screen second is 40 fs. The player picks
  a game speed (×0.1 to ×2). When something worth watching happens, the whole system slows down
  together:
  - an electron within 4 nm of a proton: until it moves at most about 1.5 nm per screen second;
  - an electron settling into its new cloud, or an atom changing shape: ×0.01;
  - an excited atom waiting to step down: until its (sped-up) delay fits about 1.5 s on screen;
  - a light wave out: until light covers 25 nm per screen second (1 s = 83 attoseconds). Light
    passed from atom to atom (radiation trapping) slows things less, to 300 nm per second.
  Rare events (captures, steps down, collisions) all run RATE_BOOST = 600,000 times faster than in
  nature, so a 1.6 ns step down takes 2.7 fs here, and they keep their real proportions. 2s, which
  really lives 0.12 s, is cut short to 120 fs.
- **Light as a wave:** light moves at its real speed on the same clock. It is about 1,600 times
  faster than a 0.1 eV electron, which is why matter looks almost frozen while a wave is out.
  The wave is a grid on the expanding wavefront, a few ripples deep. Lines from pole to pole follow
  the electric field (photon colour); rings around the axis follow the magnetic field (green).
  Brightness follows the dipole pattern (sin²θ for Δm = 0, (1 + cos²θ)/2 for Δm = ±1) and fades
  as the wave spreads.
- **Light passes out through the edge** in this level (matter still bounces off it). Each photon
  gets one pass. Where its wave reaches an atom, the atom takes the whole photon or none of it,
  with chance σ·w/(4πr²): target area × the pattern's brightness that way ÷ the sphere the wave
  has spread over. When a photon is taken, by an atom or by the wall, its whole wave is gone at
  once. If no atom takes it, it is found at the wall in a direction drawn from the pattern (the
  same direction sets the atom's recoil), and the spectrometer records it there.
  - *Lyman light* (121.6, 102.6, 97.3 nm) lifts a resting 1s atom to 2p, 3p or 4p. Its target
    area is huge (about 7,000, 4,400 and 3,800 nm²), so nearby atoms usually take it and give it
    back (radiation trapping) before it gets out. Closer than about 20 nm (a fraction of the
    wavelength) the plane-wave formula breaks down and neighbours share the excitation, so one
    atom's chance is capped at 50%.
  - *Photoionization:* any photon with more energy than an atom's electron is bound by (13.6 eV
    from 1s, 3.4 from n = 2, 1.5 from n = 3, 0.85 from n = 4) can knock it free. Kramers'
    cross-section, σ = 7.9e-4 nm² · n · (I/E)³ (6.3e-4 nm² measured for 1s), is tiny, so on one
    pass this is very rare.
  - *Free electrons* can't absorb light (they can't take its energy and its push together) and
    scatter it about 100 million times less often than an atom absorbs it, so they ignore it here.
  - *Collisions:* an electron faster than 10.2 eV can bump a 1s atom to n = 2 (σ ≈ 0.02 ln x / x
    nm², x = E/10.2 eV), and one faster than 13.6 eV can ionize it (Lotz formula), at rate n·σ·v.
  - *Momentum:* a capture keeps the pair's momentum, every photon given off or absorbed kicks the
    atom by hν/c (about 3 m/s for Lyman-α), and an ionized atom's proton recoils from its electron.
  - *The gauge* under the counts shows the free electrons' average energy and the photons and
    energy that have left through the edge.
  - `physics.js` also has what a sealed mirror box would need (photoionization rates, Saha
    balance). With a perfect mirror, 11 protons would settle about 75% ionized near 15,000 °C,
    which is why light has to leave for hydrogen to stay neutral.
  - *Not modelled:* elastic electron–atom and atom–atom collisions (tiny energy exchange),
    free–free absorption, two-photon absorption and capture into n ≥ 5.
- **Photosensitivity:** the start card carries a warning and a "Start in Glow view" button;
  the capture flash is dimmed, and a photon leaving through the wall makes only a small soft flash.
- **Acid Neutrality:** after the first atom, 10 more protons appear at random spots (at least
  7 nm apart). The goal is to give every one an electron; it ends once all are neutral and every atom has settled. Protons this far apart barely move:
  their repulsion is about 0.1 eV, and they are 1,836 times heavier than an electron.
- **Pacing of a capture:** the electron spirals in over 3 s, and each step down holds its shape
  for at least 1.5 s and then morphs over 1.5 s (re-emitted trapped light: 0.3 s and 0.6 s).
- **Capture moment:** the photon leaves from the electron's position, and the electron's glow is
  then drawn spiralling into its new cloud over 2.2 s. In nature the change is a sudden quantum
  jump; the spiral only shows which electron went where.
- **Orbital wobble:** clouds shimmer like soap bubbles (quadrupole and octupole ripples), more
  while settling in or changing shape. This is artistic: a single stationary state doesn't change
  shape. The real change, two shapes mixing during a step down, is drawn too.
- **Radiation names:** every photon is named by kind (`classify` in `physics.js`: gamma, X-ray,
  extreme / far UV, UV-C / B / A, the visible colours, near / short-wave / mid / long-wave / far IR,
  microwave, radio) and by hydrogen series (Lyman, Balmer, Paschen, Brackett; "continuum" for the
  capture photon).
- **Ship:** obeys Newton's first law. Keys fire thrusters (5 nm/s², 15 with Shift), the ship
  coasts when you let go, X brakes, and the system's wall bounces it back softly.
- **Free electrons:** missed electrons stay in the sphere. There is no limit on firing; above 12
  free electrons the oldest is removed, to keep the simulation smooth.

## Views and controls

- **Field view** (default): electric field lines, green magnetic rings around moving electrons, and
  each photon's electric and magnetic waves at 90° to each other. The magnetic field is drawn 400×
  brighter than its true share (it is about v/c ≈ 1/1000 of the electric field at these speeds).
- **Glow view** (V): the calmer view, glows only.
- **Window:** drag to look, or double-click for mouse look (double-click again or Esc frees the cursor; raw movement, first reading and big jumps skipped to stop drift), click or Space to fire, W A S D to thrust, R / F up and down, X to brake,
  [ ] or the wheel for electron speed, , and . for game speed.
- **Phones and tablets:** a flight pad bottom left (thrust ▲ ▼ ◀ ▶, rise, sink, ■ brake) and the
  gun bottom right. On small screens the tutor folds into one bar showing the next goal; ⓘ opens
  it (a yellow dot means new tutor text). The ladder, spectrometer and side panels are hidden there.
- **VR:** 1 metre in the headset is drawn as 1 nm. Left stick thrusts where you look (the ship keeps drifting;
  squeeze the left grip to brake; Y changes game speed); right stick turns
  and rises or sinks; trigger fires along the right controller; A / B change electron speed; X
  switches Field / Glow view. The tutor text and odds are on a panel above the left hand.
  Tested only with a simulated headset so far.

Not in this slice yet: the photon gun, H2, the potential-landscape grid, field quenching of 2s,
and the deuterium "Heavy Find".
