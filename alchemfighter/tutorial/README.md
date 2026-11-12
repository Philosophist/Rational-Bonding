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
| `physics.js` | Pure physics, no DOM: constants, Kramers capture cross sections, per-pass capture odds, aim cone, hydrogen decay table, Coulomb motion in the sphere, Stark mixing, atoms sharing an excitation (pairs and groups) |
| `orbitals.js` | Hydrogen wavefunctions, ported unchanged from the rebuild's `prototype/index.html` |
| `render.js` | WebGL2: stars, the sphere's wall, field glows, ray-marched electron clouds, lines, the VR panel; draws once per eye in VR |
| `mat4.js` | Small matrix helpers for the flat camera and the headset's eyes |
| `game.js` | Beats, tutor lines, flight controls, the gun, the cascade, the HUD |
| `light.js` | Pure maths for light: the exact field of an oscillating dipole, its stream function and contour lines, field-line tracing, the photon's path and targets (pilot-wave view), and the driven and emitting clouds' shares |
| `physics.test.mjs`, `light.test.mjs` | Unit tests: `node --test alchemfighter/tutorial/*.test.mjs` |

## The physics, and where it is simplified

- **Motion** is classical Coulomb motion of every charge (velocity Verlet with adaptive steps).
  Matter bounces off the wall without losing energy, like a ball off a curved mirror (angle in
  equals angle out); light passes through it.
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
- **2s** can't give off a single photon by itself. Left alone it gives off two, sharing 10.2 eV,
  after about 0.12 s: 76 million times longer than 2p, and it is not cut short, so a lone 2s atom
  just waits. What lets it go is the electric field of a loose charge (a bare proton or a free
  electron), which mixes 2s with 2p (Stark mixing; the two sit only the Lamb shift, 4.4 µeV,
  apart). The rate is Γ(2p) × the share of 2p mixed in: 2,740 per second at 1 V/cm (measured:
  about 2,780), levelling off at half of 2p's rate above about 477 V/cm. Any loose charge inside
  the 40 nm sphere is past that, so 2s then lasts about 3.2 ns and leaves as one Lyman-α photon,
  its charge swinging along the field. With no loose charge anywhere, the tutor suggests firing an
  electron past the atom.
- **Photon recoil** is applied to the atom (about 3 m/s for Lyman-alpha).
- **Time: one clock, nothing pauses.** At full speed 1 screen second is 40 fs. The player picks
  a game speed (×0.1 to ×2). When something worth watching happens, the whole system slows down
  together:
  - an electron within 4 nm of a proton: until it moves at most about 1.5 nm per screen second;
  - an electron settling into its new cloud, or an atom changing shape: ×0.01;
  - an atom starting to send light: until one swing of its charge takes 2 screen seconds, held
    for 5 s the first two times (2 s after), then easing back up (e-fold per second);
  - a photon in flight: until light covers 25 nm per screen second (1 s = 83 attoseconds). Light
    from an atom a fast electron bumped up slows things less, to 300 nm per second.
  Rare events (captures, steps down, collisions) all run RATE_BOOST = 600,000 times faster than in
  nature, so a 1.6 ns step down takes 2.7 fs here, and they keep their real proportions. An
  excited atom waits its sampled real lifetime with no fixed hold, so 2p steps down almost at once
  and 3s (159 ns) lingers about 100 times longer. 2s keeps its real 0.12 s too (see above).
  - atoms swinging an excitation between them (below): until one swing there and back takes
    3 screen seconds. That is held for 6 s the first two times (2.5 s after), then the clock eases
    back up and the swinging speeds up into a blur.
- **Light is Maxwell's exact field** (`light.js`). An atom changing level swings its charge like
  a tiny antenna (an oscillating dipole), and the game draws the exact field of that swing, close
  in and far out, at the light's real wavelength and with every part arriving at the speed of
  light (retarded time). Nothing is shrunk to make ripples show. Hydrogen's light (97 to 1,875 nm)
  is longer than the 80 nm system, so most of what is inside is near field: the lines loop from one
  end of the swing to the other and breathe in and out, and only for Lyman light do loops start to
  break off and travel out near the far wall.
  - *Straight swing (Δm = 0):* the electric field lines are drawn exactly, as the contour lines of
    the Hertz stream function Ψ = sin²θ·[p(t_r)/R + ṗ(t_r)/c] in 6 planes through the axis (equal
    steps in Ψ, so lines crowd where the field is strong). Magnetic field lines are rings around
    the axis (green), brighter where B is stronger.
  - *Circular swing (Δm = ±1):* electric field lines are followed out from the atom in 3D and wind
    into spirals; magnetic lines are followed round as loops.
  - *Envelope:* the swing starts the moment the atom is in the upper level and fades as e^(−t/2τ)
    (its own rate of change is included in ṗ and p̈, so even a one-cycle pulse is exact)
    (the single-atom result of quantum electrodynamics, Wigner–Weisskopf), τ the level's lifetime
    on the game's clock. When the photon is found, the swing stops and the rest of the wave, now
    empty, runs out at c.
  - *No flicker:* a swing faster than 1.2 per screen second blends into its average
    (nested surfaces of equal average field strength), fully so above 2.2 per second. Glow view
    always shows the average, dimmer.
- **Electron clouds follow Schrödinger's equation live.** While a lone atom sends light, its cloud
  is part upper shape and part lower, beating at the light's real frequency (that beat is what
  swings the charge); its share in the upper level fades as e^(−t/τ). When the beat is too fast
  to show, it blends into the two shapes added together (the average). This beat is the
  semiclassical picture; in full quantum theory the atom is entangled with its photon and the
  beat only shows in the field. Spontaneous emission itself (why an excited atom starts to
  radiate, and when its photon leaves) is not in Schrödinger's equation: it needs the quantum
  theory of light, so it keeps the measured lifetimes. Resting atoms answering Lyman light is the
  group model below.
- **Pilot-wave view (on by default; P, the "Photon particle" button, or the left stick click in
  VR):** each photon is also drawn as a particle riding its wave, as in de Broglie–Bohm theory.
  It leaves when the atom's sampled lifetime is up, along a straight path drawn from the wave's
  brightness (averaged over a cycle a dipole's energy flows straight out), at c. An atom takes it
  only if the path runs through its target, a cone of solid angle σ/R² around the direction to it
  (widened where the pattern dims, so each atom's chance is exactly σ·w/(4πR²), the wave
  picture's; where two cones overlap the nearer atom wins). In this level the only thing a
  photon in flight can do to an atom is knock its electron off. With the view off only the wave is drawn; the physics is the same either way.
  Pilot waves are well established for electrons and still debated for photons, so the game
  calls it a view.
- **Light passes out through the edge** in this level (matter still bounces off it). Each photon
  gets one pass. An atom takes the whole photon or none of it, with chance σ·w/(4πr²): target area
  × the pattern's brightness that way ÷ the sphere the wave has spread over (settled by the
  photon's path, above). If no atom takes it, it is found at the wall along its path (the same
  direction sets the atom's recoil), and the spectrometer records it there.
  - *Atoms sharing one excitation (groups):* Lyman light (121.6, 102.6, 97.3 nm) is exactly
    the colour that lifts a resting 1s atom to 2p, 3p or 4p, and the whole system is smaller than
    its wavelength. So there is no photon flying from atom to atom in here: an atom in 2p, 3p or
    4p is coupled through its electric field to every resting 1s atom in the system, strongly
    inside λ/2π (19 nm for Lyman-α) and weakly beyond, and the group shares the excitation.
    The game follows one amplitude per atom, exactly, with the standard N-atom result
    (`groupMatrix`, `groupPropagator` in `physics.js`): i·dc/dt = H·c, H_ii = D_i − iΓ/2,
    H_ij = Γr·(J_ij − i·F_ij/2), where for each pair (x = 2πr/λ, p = (dipole · direction to the
    other atom)²) J = (3/4)[−(1−p)cos x/x + (1−3p)(sin x/x² + cos x/x³)] is the swinging rate and
    F = (3/2)[(1−p)sin x/x + (1−3p)(cos x/x² − sin x/x³)] the shared decay. Each frame is one
    exact step (matrix exponential), so nothing is capped however fast the swinging.
    - The excitation swings between close atoms and is passed around the group. Each cloud is
      drawn as part 1s and part p shape, by its share |c_i|² (the densities add: the shapes
      belong to different joint states of the group), each sharing atom's antenna field is drawn
      at its share's size and phase, and close atoms are joined by a faint link.
    - Light leaves at Γr·Σ F_ij·Re(c_i* c_j): up to N times one atom's rate when the atoms swing
      in step (they flash together, superradiance), far slower when they swing against each other
      (subradiance), so the in-step part goes first and what remains is a steady shape spread
      over close atoms that can hardly radiate. It lasts until its photon finally gets out, or
      until a loose charge's field shifts one atom's level against the others' (linear Stark
      shift, up to (3/2)·n(n−1)·e·a₀·F), which upsets the sharing and lets the light out. With
      bare protons or free electrons about, that shift is often larger than the coupling, so clear
      swinging is mostly seen once the system is nearly neutral or the atoms are very close.
    - The photon leaves when the chance that it is still there, Σ|c|², falls below a random draw
      (the usual quantum-jump method). Its direction is drawn from the atom's dipole pattern
      times |Σ c_i·e^(−ik·r_i)|²: the atoms' waves add up in some directions and cancel in others.
      Atoms far from all others take only a small share, so a lone far atom behaves as before.
    - Resting atoms join a group as they appear. Simplified: one excitation per group (a second
      excited atom starts its own group with the resting atoms that are left), the p orbital
      keeps its direction, the shift uses the field along the orbital's own axis, the photon is
      drawn leaving from one atom (picked by share), and below 1 nm (where real atoms would start
      to bond) the coupling is held constant.
  - *Photoionization:* any photon with more energy than an atom's electron is bound by (13.6 eV
    from 1s, 3.4 from n = 2, 1.5 from n = 3, 0.85 from n = 4) can knock it free. Kramers'
    cross-section, σ = 7.9e-4 nm² · n · (I/E)³ (6.3e-4 nm² measured for 1s), is tiny, so on one
    pass this is very rare.
  - *Free electrons* can't absorb light (they can't take its energy and its push together) and
    scatter it about 100 million times less often than an atom absorbs it, so they ignore it here.
  - *Collisions:* an electron faster than 10.2 eV can bump a 1s atom to n = 2 (σ ≈ 0.02 ln x / x
    nm², x = E/10.2 eV), and one faster than 13.6 eV can ionize it (Lotz formula). Only atoms the
    electron actually passes can be hit: each pass has chance σ·e^(−b²/s²)/(πs²) over the reach
    s = ħv/ΔE (at least 2 a₀), which sums to the real σ, times RATE_BOOST like captures, so hits
    happen within about 1 nm. The collision is done in the pair's centre-of-mass frame: the electron
    is turned by a mostly small angle (Born, dσ/dΩ ∝ 1/(θ² + θm²)) and the atom recoils, at
    hundreds of m/s (over 100 times a photon's kick).
  - *Momentum:* a capture keeps the pair's momentum (the atom then weighs proton + electron), every
    photon given off or absorbed kicks the atom by hν/c (about 3 m/s for Lyman-α), and when an atom
    comes apart its electron and proton leave with opposite momenta, so the total is kept.
  - *Neutral atoms feel fields:* a charge's field stretches a 1s atom into a dipole p = α·F
    (α = 4.5 a₀³, exact), which pulls the atom toward the stronger field and pulls back on the
    charge equally. The dipole comes from the total field, so a proton–electron pair side by side
    pulls far less than a lone proton. Excited atoms (n ≥ 2) take their full Stark dipole,
    (3/2)·n·(n−1)·e·a₀, once the field passes about 477 V/cm; we use the state that leans toward the
    field (half the Stark states lean the other way). A repulsive core balancing the pull at
    0.106 nm (n² times that for excited atoms) stops a charge passing through an atom.
  - *Atoms feel each other:* van der Waals, −C₆/r⁶ with C₆ = 6.499 hartree·a₀⁶, and the repulsive
    wall of two H atoms whose spins don't pair (a 0.56 meV well at 0.415 nm), so they bounce.
    The bonding quarter of meetings (H₂) is left for the H₂ work.
  - These pulls are real but slow at this scale: a proton 1 nm away pulls a resting 1s atom in over
    about a minute of game time at normal speed; from 5 nm it would take hours.
  - *The gauge* under the counts shows the free electrons' average energy and the photons and
    energy that have left through the edge.
  - `physics.js` also has what a sealed mirror box would need (photoionization rates, Saha
    balance). With a perfect mirror, 11 protons would settle about 75% ionized near 15,000 °C,
    which is why light has to leave for hydrogen to stay neutral.
  - *Not modelled:* H₂ and H₂⁺ bonding, H⁻, free–free absorption, two-photon absorption, capture into n ≥ 5, and field mixing of the n = 3
    and n = 4 sub-levels (the same fields that let 2s go also blend 3s, 3p and 3d).
- **Photosensitivity:** the start card carries a warning and a "Start in Glow view" button;
  the capture flash is dimmed, and a photon leaving through the wall makes only a small soft flash.
- **Acid Neutrality:** after the first atom, 10 more protons appear at random spots (at least
  7 nm apart). The goal is to give every one an electron; it ends once all are neutral and every atom has settled. Protons this far apart barely move:
  their repulsion is about 0.1 eV, and they are 1,836 times heavier than an electron.
- **Pacing of a capture:** the electron spirals in over 3 s. Each step down then swings for its
  real (sped-up) lifetime while sending its wave, and when its photon is found the atom settles
  into the lower level over 0.5 s.
- **Capture moment:** the photon leaves from the electron's position, and the electron's glow is
  then drawn spiralling into its new cloud over 2.2 s. In nature the change is a sudden quantum
  jump; the spiral only shows which electron went where.
- **Clouds lean in fields (no wobble):** a lone 1s atom is perfectly round and still, so there is no
  random shimmer. Nearby charges bend each cloud by the same field that moves the atom: 1s is drawn
  with the exact first-order wave in a field, ψ·(1 − (F·r)(1 + r/2)) (Dalgarno–Lewis), which is
  stiff (a proton 1 nm away moves it about 1%); fields above 0.02 atomic units (a proton closer
  than about 0.37 nm) are capped, because there the electron starts to be shared (H₂⁺). Excited
  clouds are shifted by their full Stark dipole, so they lean visibly. Clouds also change shape
  when light drives them and while they step down (two shapes beating), as before.
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

Not in this slice yet: the photon gun, H2, the potential-landscape grid,
and the deuterium "Heavy Find".
