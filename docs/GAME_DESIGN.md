# Alchem Fighter: Game Design Document

*Rational Bonding · working draft*

## 1. Pitch

A space fighter where the "space" is the inside of matter. You fly a ship at the
scale of atoms. Your guns fire **photons, electrons, protons, neutrons and whole
atoms**. Every campaign level is a simulation of a real physical system with a
**target state**, and you win by steering the system into that state with the
particles you fire.

There is also a **creative mode**: a sandbox that works like a chemical Minecraft
with the depth of a universe simulator, where you can build atoms, molecules,
materials and eventually stars from the same particles.

The guiding rule is **physically honest, not physically exhaustive**. Every
outcome the game shows should be one that real physics allows, with the right
tendencies (which things are likely, which are rare, which are forbidden), while
the cost of computing it stays small enough for an ordinary PC.

## 2. Core loop

1. **Read the system.** Instruments show the current state: energy levels,
   orbital shapes, charges, bonds, isotopes.
2. **Pick a weapon and tune it.** Choose a particle, then its energy,
   polarization or spin, and the direction you fire from.
3. **Fire and watch the physics answer.** Absorption, scattering, ionization,
   capture, decay, bonding. The response follows real selection rules and real
   probabilities.
4. **Reach and hold the target state** before the system relaxes away from it.

Skill comes from understanding the physics, not from twitch aim. The atom is
always at the centre of your sights; the hard parts are *what* you fire, *when*,
and *from where*.

## 3. Arsenal

| Weapon | Real interaction | Tuning controls | What it does in play |
|---|---|---|---|
| **Photon gun** | Absorption, stimulated emission, photoionization, Compton scattering | Wavelength, polarization (π, σ+, σ−), firing angle | Excite electrons between orbitals; knock them out; trigger lasing |
| **Electron gun** | Electron impact excitation and ionization, electron capture, reduction | Kinetic energy, spin | Change charge state, make anions, drive chemistry |
| **Proton gun** | Proton capture, (p,γ) and (p,n) reactions, Coulomb barrier | Kinetic energy (MeV) | Raise atomic number, so you transmute the element |
| **Neutron gun** | Neutron capture, fission, elastic scattering | Kinetic energy (thermal to fast) | Make isotopes, set off beta decay chains, split heavy nuclei |
| **Atom launcher** | Collisions, bonding, reactions | Element, velocity, orientation | Build molecules, start reactions, deposit material |

Each weapon is "ammo-limited" by an energy budget, so a level can be solved
cheaply with clever tuning or expensively with brute force.

## 4. Campaign structure

Every level states a **system**, a **target state**, and a **constraint**.

### Act I: The single atom (prototype covers the first five)

| # | Level | Target | Physics lesson |
|---|---|---|---|
| 1 | First Light | H 1s → 2p | Resonance: only photons that match an energy gap are absorbed (Lyman-α, 121.6 nm) |
| 2 | Balmer Red | H 3d, held 2 s | Selection rule Δl = ±1 forces a two-photon climb; 2p lives only 1.6 ns |
| 3 | Spin the Cloud | H 3d m=+2 | Circular polarization carries angular momentum (Δm = +1) |
| 4 | The Dark State | H 2s, held 3 s | Metastable states; stimulated emission as a tool |
| 5 | Rydberg Ladder | H 4f m=+3 | Stack three σ+ photons from UV to infrared |
| 6 | Ion Hunter | He⁺ ground state | Ionization energies; electron gun introduced |
| 7 | Lithium Problem | Li 2p from 2s | Shielding and quantum defects in multi-electron atoms |

### Act II: Nuclei

Transmute elements with protons and neutrons. For example: make deuterium, then
helium-3, then helium-4 via the pp-chain; breed plutonium-239 from uranium-238
by neutron capture and two beta decays; survive a level where every capture
risks a fission chain.

### Act III: Molecules

Form H₂ from two H atoms by choosing approach spin (singlet bonds, triplet
repels). Break the O–H bond in water with a photon of the right energy. Catalyse
a reaction by lowering its barrier.

### Act IV: Matter and stars

Dope silicon into a working p–n junction. Build a laser from a gain medium and
pump photons. Final act: start a star by compressing hydrogen until the pp-chain
ignites, then steer it through the CNO cycle.

## 5. Creative mode

Creative mode uses the same simulation stack as the campaign with the target
states taken away.

- **Build** atoms from protons, neutrons and electrons, with real nuclear
  stability (nuclides off the valley of stability decay at their real
  half-lives, time-scaled).
- **Bond** atoms into molecules; geometries come from orbital hybridization and
  VSEPR at the coarse level, and from precomputed quantum-chemistry data where
  available.
- **Zoom out** continuously: atom → molecule → crystal or fluid → planet → star.
  Each zoom level swaps to a cheaper model that keeps the important behaviour of
  the level below (see Section 6).
- **Save, share and challenge**: a creative build can be published as a
  campaign-style level with its own target state.

## 6. Simulation fidelity ladder

Realism has to be cheap at the scale the player is looking at. Each tier is
the cheapest model that still gives correct tendencies at that scale.

| Tier | Scale | Model | Runtime cost | Status |
|---|---|---|---|---|
| 0 | One-electron atoms (H, He⁺, Li²⁺…) | **Exact** hydrogenic wavefunctions ψ_nlm evaluated in a GPU shader | Trivial | **Working in prototype** |
| 1 | Multi-electron atoms | Hydrogenic orbitals with Slater-rule screening Z_eff; spherically averaged total density | Trivial | **Working in prototype** (Orbital Lab) |
| 2 | Atoms, better | Tabulated Hartree–Fock / Roothaan–Hartree–Fock radial functions (Clementi–Roetti, Bunge tables) as 1-D textures | Very low | Next |
| 3 | Small molecules | Orbitals and densities precomputed offline (PySCF, DFT or CCSD) and baked into 3-D textures | Low at runtime, offline cost | Planned |
| 4 | Reactions | Potential energy surfaces and barriers from literature or offline calculations; reactive force fields (ReaxFF-style) for dynamics | Medium | Planned |
| 5 | Bulk and stars | Continuum and statistical models (equations of state, reaction networks with real rates) | Low | Planned |

The game never solves the Schrödinger equation for a large system live. It
**looks up** answers computed offline by better methods, and interpolates them.

### Where quantum computing fits

Quantum computers are a candidate source of the offline data, not something the
game runs on. The realistic picture today:

- Quantum hardware has computed ground-state energies of small molecules (H₂,
  LiH, BeH₂, small hydrogen chains) with variational (VQE) and phase-estimation
  methods. For these sizes classical methods (full CI, CCSD(T), DMRG) are still
  as accurate and much cheaper.
- The expected advantage is for **strongly correlated** systems: transition-metal
  catalysts such as the nitrogenase FeMoco cluster, cytochrome P450 active
  sites, and some high-temperature-superconductor models. Classical methods
  struggle there.

So the data pipeline is:

1. **Use the best available result** for each quantity the game needs (bond
   energy, barrier height, excitation energy, spectrum). Rank sources by
   method: experiment > CCSD(T) / full CI / DMRG > quantum-hardware results that
   have been benchmarked > DFT > semi-empirical.
2. **Store it with provenance** (method, basis set, reference) in a data table
   the game loads, so players and modders can see where a number came from.
3. **Swap in quantum results as they mature.** When a published quantum
   computation beats classical methods on a system the game uses (for example a
   catalyst level in Act III), it replaces the old value. The game doesn't
   change; its data gets more accurate.
4. **Extract tendencies, not just numbers.** For gameplay what matters is
   ordering and selection: which reaction path is favoured, which state is
   long-lived, which transition is forbidden. Those can be encoded as rules and
   probabilities even where exact numbers are uncertain.

## 7. Rendering the electron cloud

The prototype uses a single full-screen GPU shader that raymarches the
probability density |ψ|² through a bounding sphere.

- **Exact functions.** Each sample evaluates the radial function (associated
  Laguerre polynomial) and angular function (associated Legendre polynomial ×
  e^{imφ}) by recurrence. Normalization constants are computed on the CPU and
  checked numerically (error < 0.01% for all orbitals up to n = 5).
- **Two layers.** A soft emissive fog shows the full density (brightness ∝
  √(ρ/ρ_max) so faint outer lobes stay visible), and a glowing skin marks the
  surface enclosing 90% of the probability, which is the textbook "orbital
  shape".
- **Phase as colour.** Cyan for positive, magenta for negative, violet and amber
  for imaginary phase. Complex (definite-m) states show their phase winding
  around the axis.
- **Superpositions.** During a transition the shader mixes the old and new
  states with a time-varying relative phase, so the cloud visibly sloshes back
  and forth. That oscillating charge is the dipole that absorbs or emits the
  photon.
- **Real or complex basis.** Chemistry's familiar shapes (p_x, d_xy, d_z²) are
  real combinations of the definite-m states. The campaign uses the complex
  states because polarization changes m. The Lab offers both.
- **Performance.** 48 to 128 samples per pixel at 50% to 100% resolution, with
  per-pixel jitter to hide banding. Quality drops automatically if frames get
  slow. The cost is independent of how many electrons the atom has, because
  filled subshells are spherically symmetric (Unsöld's theorem) and are summed
  radially.

## 8. Time: honest slow motion

No single slow-down factor shows everything. Light crosses an atom in about
an attosecond (10⁻¹⁸ s), one cycle of its field takes about a femtosecond, and
an excited atom waits nanoseconds before it fluoresces. These span a factor of
a billion.

So the game changes the **time scale** instead of the physics. Light always
moves at c, and every process runs at its real rate for the current scale.
The HUD always shows the scale ("1 s = 10.6 as") and a real-time clock in
nanoseconds.

| View | 1 screen second = | What you can see |
|---|---|---|
| Light | ~5–20 attoseconds | Photons crossing the scene at c |
| Wave | ~1 femtosecond | The field oscillating; the cloud sloshing at the light's frequency during absorption |
| Decay | 1 nanosecond | Fluorescence delays: 2p after ~1.6 ns, 3d after ~15.6 ns |
| **Auto** (default) | switches between the three | Drops to light view the instant a photon is fired or emitted, slows to wave view during absorption, then returns to decay view while you wait |

Because the decay view keeps lifetimes at their real ratios, players learn
that 2p decays ten times faster than 3d. The log shows each fluorescence
delay next to the state's lifetime ("after 2.13 ns, τ = 1.60 ns"). Elastic
scattering, the atom's version of reflection, happens within a femtosecond.

## 8a. The photon as a wave-particle

- **Wave.** Each photon is drawn as a short electromagnetic wave packet: the
  electric field E in the photon's colour, and the magnetic field B, paler, at
  right angles. Linear (π) light oscillates in a plane along the atom's axis.
  Circular (σ±) light draws a left- or right-handed helix. The pattern moves
  rigidly at c, which is how a wave in vacuum behaves.
- **Particle.** The packet carries one quantum of energy, hν. It is absorbed
  all at once, never partly.
- **Scale honesty.** Real ultraviolet and visible wavelengths are about 1,000
  times larger than the atom, so in reality the atom sits inside a single wave
  crest. The drawn wave is compressed to fit, and the HUD shows by how much
  ("wave drawn 5,800× shorter than real"). Wavelength ordering and
  polarization are kept exactly.
- **Every photon spreads.** A photon is a wave, and waves diffract, so every
  beam widens into a cone. A laser's cone is tiny because the beam is many
  wavelengths wide; an atom's emission goes out in all directions at once.
- **Laser (narrow wave packet).** One photon with an exact wavelength that
  travels in a straight line. Drawn as the E/B packet above, nine cycles long
  with faded ends.
- **Lamp (spreading wavefront).** One photon whose wavefront opens into an 8°
  cone, drawn as ripples (rings from behind, arcs from the side) with four
  crests and faded ends. It has a ±0.3% spread of wavelengths, so it is easier
  to find a line with but weaker on it. Its chance of landing on an atom
  shrinks as the wavefront spreads over a bigger area.
- **Emission (spherical wavefront).** Fluorescence and scattered light leave
  as rings expanding around the atom. They are brightest where the atom's
  dipole radiates most: around its waist for Δm = 0, more evenly for Δm = ±1.
  When the wave reaches another atom, that atom gets one chance to absorb it.
  If it does, the whole wave vanishes at once, because one photon is absorbed
  in one place.

### Reflection is not a billiard bounce

A single atom does not reflect light like a mirror or a billiard ball. The
light shakes the electron cloud, and the shaken cloud re-radiates a fresh
wave in all directions (Rayleigh scattering), dark along the direction it was
shaken. Mirror-like reflection only appears when billions of atoms in a
surface re-radiate together and their waves add up in one direction.
Billiard-like recoil does happen for X-rays hitting free electrons (Compton
scattering), which suits a future high-energy gun.

### Systems of atoms

Levels can hold up to three atoms. Light re-emitted by one atom can be
absorbed by another, then re-emitted again. This is **radiation trapping**,
the reason the glow of a dense hydrogen gas escapes slowly.

## 8b. What decides whether a photon interacts

| Factor | Physics | In the game |
|---|---|---|
| Energy match | Absorption needs hν = E_upper − E_lower | Lorentzian line shape; the HUD shows the real natural width (e.g. 1.5×10⁻⁵ nm for H-α) next to the widened game width |
| Orbital shapes | Dipole overlap ⟨f\|r\|i⟩: selection rules Δl = ±1, and the oscillator strength f | Real hydrogen f values (1s→2p 0.416, 1s→4p 0.029) set each line's hit chance |
| Polarization and angle | Δm = 0 for π, ±1 for σ±; coupling depends on the angle to the axis | Coupling shown live as you fly |
| Above threshold | Photoionization, largest just past threshold, falling roughly as (E_th/E)³ | Ionization chance shown before you fire |
| Far from any line | Rayleigh scattering ∝ λ⁻⁴ | Photon bounces off, same colour, no delay |

The width of a line is set by the excited state's **lifetime**, not by how
big the orbital is.

## 8c. Same speed of light for every observer

Relativity only becomes visible when the observer moves fast, so the ship has
a speed control (up to ±0.3 c, toward or away from the atom).

- **Doppler shift.** The atom sees your light at λ·√((1−β)/(1+β)). Flying
  toward it blue-shifts your gun, so speed becomes a way to tune. The
  spectrometer shows both what you fire (white) and what the atom sees (cyan).
  The atom's own glow reaches you shifted the same way.
- **Aberration.** The stars crowd toward the direction you fly and turn bluer
  and brighter; behind you they thin out and redden.
- **Invariance.** Photons cross the screen at the same speed whatever your
  speed, and the readout always says c. Speed changes light's colour, never
  how fast it moves.
- Level 7, "Doppler Tuner", jams the gun at 125.0 nm. The only way to reach
  Lyman-α is to fly at about 2.8% of c (8,350 km/s).
- For playability, the view stays at a fixed distance from the atom while the
  ship is "moving".

## 9. Technology

- **Prototype:** plain WebGL2 + JavaScript in one HTML file (`prototype/index.html`).
  No build step, runs from GitHub Pages, easy to share.
- **Production candidates:**
  - **Godot 4** (the repo already has a Godot 3 project stub). The shader ports
    almost line for line to Godot's shading language, and Godot exports to
    desktop, mobile and web.
  - **Stay on the web** with WebGPU for compute shaders once the simulation
    needs particle dynamics on the GPU.
- **Physics core** as a separate, engine-independent module (JavaScript or Rust
  → WebAssembly) with its own test suite, so physics correctness is tested
  separately from the game.

## 10. Prototype status and next steps

Done:

- [x] Exact hydrogenic orbital renderer with phase colouring, boundary surfaces
      and superposition animation
- [x] Photon gun with wavelength tuning, π/σ± polarization and angle-dependent
      coupling
- [x] Real hydrogen spectrum, Δl = ±1 and Δm selection rules, ionization,
      spontaneous emission with real lifetimes and branching ratios, stimulated
      emission
- [x] Five campaign levels with target states
- [x] Crosshair aiming with straight, converging shots; laser and lamp beams
- [x] Photons drawn as E/B wave packets with correct polarization
- [x] Automatic time dilation (atto- to nanoseconds) with a live real-time clock
- [x] Oscillator strengths, photoionization cross-section, Rayleigh scattering,
      fluorescence delays
- [x] Fine tuning (◀ ▶ buttons, snapping to discovered lines, a "how close" meter)
- [x] Spreading wavefronts for lamp light, fluorescence and scattering
- [x] Multi-atom levels with radiation trapping (level 6)
- [x] Relativistic Doppler shift and aberration (level 7)
- [x] Orbital Lab: elements H–Kr, Slater screening, real/complex basis,
      superpositions, whole-atom shell view

Next:

- [ ] Ship flight model and hazards (stray photons, other atoms) so the fighter
      part has stakes
- [ ] Electron gun and electron-impact cross sections
- [ ] Electric field lines around charges (p⁺, e⁻, ions) that the ship flies through
- [ ] "Dots" view of the electron cloud: random positions sampled from |ψ|²,
      showing where measurements would find the electron
- [ ] Compton scattering gun (X-rays) with billiard-like recoil
- [ ] Hartree–Fock radial tables for Tier 2 atoms
- [ ] Two-atom level: H₂ bonding with baked molecular orbitals
- [ ] Data-provenance format for imported research results
- [ ] Decide between Godot 4 and WebGPU for production

## 11. Honest limits of the current prototype

- Fine structure, Lamb shift and hyperfine splitting are ignored. Line widths
  are about 10⁵ times wider than real so they can be hit; the HUD says so.
- Hit chances fold the oscillator strength in as f/(f + 0.1) and Rayleigh
  scattering is boosted so it can be seen. The ordering is real; the absolute
  numbers are tuned for play.
- The drawn wavelength is compressed (shown in the HUD), so the number of
  crests passing the atom doesn't match the cloud's oscillation rate. The
  cloud's rate is the real one.
- A transition never takes more than about 6 screen seconds, even in the
  slowest view.
- Decay picks the final m uniformly among allowed values instead of using
  Clebsch–Gordan weights.
- Absorption to n ≥ 5 is not modelled; such photons pass through.
- Slater screening ignores aufbau exceptions (Cr, Cu) and uses integer n.
- 2s is treated as stable (its real lifetime, 0.12 s, is about 10⁸ times longer
  than 2p's).
