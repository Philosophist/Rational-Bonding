# Level 1: Electromagnetic Stardust (first playable slice)

Beats 1 and 2 of [`docs/levels/01-hydrogen-tutorial.md`](../../docs/levels/01-hydrogen-tutorial.md),
in the browser window or a PC VR headset (WebXR, the Enter VR button). Live at `rationalbonding.com/alchemfighter/tutorial/` once merged.

- **Beat 1, meet the proton:** a lone proton drawn as the glow of its electric field (log scale,
  capped), with Field view lines.
- **Beat 2, first capture:** the electron gun, with an aim cone that is wider for slower electrons
  (the electron is a wave). Every pass is reported with its closest approach, its chance in the
  game and its real chance. On a capture the electron cloud appears in the level it landed in and
  steps down to 1s, giving off one photon per step, which the spectrometer in the sphere's wall
  records as it reflects back in.

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
- **2s** decays by two photons sharing 10.2 eV after about 0.12 s, shown as a labelled time skip.
- **Photon recoil** is applied to the atom (about 3 m/s for Lyman-alpha).
- **Time:** 1 screen second is 40 fs while particles fly, and 25 ns during a cascade (free
  particles wait meanwhile). Light is drawn slowed down so you can see it leave. The player can
  pick a game speed (×0.1 to ×2), and the clock slows automatically (down to ×0.03) while an
  electron is within 4 nm of a proton, so it never moves faster than about 2.5 nm per screen
  second there. Capture odds are per pass, so slow motion doesn't change them.
- **Light as a wave:** each photon is drawn as its electromagnetic wave: a grid on the expanding
  wavefront, a few ripples deep. Lines from pole to pole follow the electric field (photon colour);
  rings around the axis follow the magnetic field (green). Brightness follows the dipole pattern
  (sin²θ for Δm = 0, (1 + cos²θ)/2 for Δm = ±1) and fades as the wave spreads. The wall is a
  mirror: every bit of wavefront reflects like a ray (geometric optics), so after a bounce the
  grid folds into caustics. The spectrometer records the photon when the wave first touches the
  wall. Waves fade after 12 s, at most 16 at once. The atom's recoil uses one direction drawn
  from the same pattern. Atoms never store photons: each is made when the electron drops.
- **The sealed box:** nothing escapes the mirror, so the energy from every catch stays inside.
  The game keeps a record of every photon in the box, separate from the drawn waves, which fade.
  - *Lyman light* (121.6, 102.6, 97.3 nm) is exactly the colour that lifts a 1s electron to 2p,
    3p or 4p. For that colour an atom's target area (about 7,000, 4,400 and 3,800 nm²) is bigger
    than the sphere's cross-section (πR² ≈ 5,000 nm²). On its way out the wave meets each resting
    atom with chance σ·w/(4πr²); after the wall, each crossing (mean chord 4R/3) has chance Σσ/πR².
    The atom gives the light back, so it is passed between atoms forever (radiation trapping).
  - *Photoionization:* any photon with more energy than an atom's electron is bound by (13.6 eV
    from 1s, 3.4 from n = 2, 1.5 from n = 3, 0.85 from n = 4) can knock it free. Kramers'
    cross-section, σ = 7.9e-4 nm² · n · (I/E)³ (6.3e-4 nm² measured for 1s); a photon loose in
    the box meets a given atom at rate c·σ/V. Excited atoms are drawn for far longer than they
    live, so for them the clock runs at their real lifetime.
  - *Collisions:* an electron faster than 10.2 eV can bump a 1s atom to n = 2 (σ ≈ 0.02 ln x / x
    nm², x = E/10.2 eV) and one faster than 13.6 eV can ionize it (Lotz formula), at rate n·σ·v.
  - These rare events run on the capture clock (RATE_BOOST, about 24 ns of real time per second
    of play), so their balance with capture is kept.
  - *Momentum:* a capture keeps the pair's momentum, every photon given off or absorbed kicks the
    atom by hν/c (about 3 m/s for Lyman-α), and an ionized atom's proton recoils from its electron.
  - *The gauge* under the counts shows the free electrons' average energy and where the box would
    settle once its energy is shared out: the Saha balance, solved from the total energy (motion,
    Coulomb, binding and loose light), with one electron per proton counted. For 11 protons it is
    about 75% ionized near 15,000 °C. That is the lesson of Acid Neutrality: it ends after you
    neutralize every proton and watch for 20 s, or after 10 catches and 3 re-ionizations.
  - *Not modelled:* elastic electron–atom and atom–atom collisions (tiny energy exchange),
    free–free absorption, and capture into n ≥ 5. Three-body recombination happens only as far
    as the classical Coulomb motion produces it.
- **Photosensitivity:** the start card carries a warning and a "Start in Glow view" button;
  wall-hit flashes were removed and the capture flash dimmed.
- **Acid Neutrality:** after the first atom, 10 more protons appear at random spots (at least
  7 nm apart). The goal is to give every one an electron, then see whether it stays neutral (see "The sealed box"). Protons this far apart barely move:
  their repulsion is about 0.1 eV, and they are 1,836 times heavier than an electron.
- **Pacing of a capture:** the electron spirals in over 3 s, and each step down holds its shape
  for at least 1.5 s and then morphs over 1.5 s, so each photon comes out about 3 s apart.
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
