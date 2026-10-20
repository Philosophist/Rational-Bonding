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

## 8. Time scaling

Atomic events happen in nanoseconds; nuclear and chemical ones span from
femtoseconds to billions of years. Each level declares a **time dilation**
(the prototype uses 1 game second = 1 ns) and keeps **ratios** between
lifetimes real. Players learn that 2p decays ten times faster than 3d because it
actually does.

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
- [x] Orbital Lab: elements H–Kr, Slater screening, real/complex basis,
      superpositions, whole-atom shell view

Next:

- [ ] Ship flight model and hazards (stray photons, other atoms) so the fighter
      part has stakes
- [ ] Electron gun and electron-impact cross sections
- [ ] Hartree–Fock radial tables for Tier 2 atoms
- [ ] Two-atom level: H₂ bonding with baked molecular orbitals
- [ ] Data-provenance format for imported research results
- [ ] Decide between Godot 4 and WebGPU for production

## 11. Honest limits of the current prototype

- Fine structure, Lamb shift and hyperfine splitting are ignored; resonance
  tolerance (±0.4%) is far wider than real linewidths so the game is playable.
- Decay picks the final m uniformly among allowed values instead of using
  Clebsch–Gordan weights.
- Absorption to n ≥ 5 is not modelled; such photons pass through.
- Slater screening ignores aufbau exceptions (Cr, Cu) and uses integer n.
- 2s is treated as stable (its real lifetime, 0.12 s, is about 10⁸ times longer
  than 2p's).
