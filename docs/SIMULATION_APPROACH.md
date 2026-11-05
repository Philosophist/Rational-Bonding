# Alchem Fighter: Choosing the Chemistry Simulation

*Rational Bonding · proposal, 2026-11-05 · companion to `GAME_DESIGN.md`*

## The short answer

Professional drug-discovery software doesn't use one method. It uses a ladder:
cheap methods to explore, expensive ones to check. Alchem Fighter should copy
that ladder instead of picking one rung.

1. **Live in the headset (every frame):** a *reactive, bond-order force field*,
   our own lightweight cousin of ReaxFF built on the Universal Force Field's
   rules so it covers every element. Bonds can form and break, energy is
   released or absorbed, and the released energy drives the fireworks: hot
   atoms glow and excited atoms emit their **real spectral lines**, the same
   lines that colour real fireworks.
2. **Checked in the background (seconds):** a snapshot of the player's system
   is re-scored with a professional fast method, **GFN2-xTB** (semi-empirical
   quantum chemistry) or a **machine-learned potential** (MACE, AIMNet2 or
   similar). The game shows where its own fast answer agrees and where it
   doesn't.
3. **Exported for the pros (one button):** the system and its trajectory are
   saved in standard formats, with ready-to-run input files for xtb, ORCA,
   OpenMM and LAMMPS. That is the "worth re-running in a real simulator" step.

For platform: **design for VR first and build it on the web** (three.js with
WebXR), which continues your 2019 A-Frame scene and keeps it on
rationalbonding.com and itch.io. Keep the physics core separate from the
graphics so it can move into Godot 4 later if the Quest headset needs more
speed.

The rest of this document explains why.

---

## 1. What "validate a drug" means for us

Simulations don't validate drugs on their own. Regulators approve drugs on lab
and clinical evidence. What simulations do is **decide which experiments are
worth doing**: they rank thousands of candidate molecules so chemists only
make and test the promising ones.

That is exactly the bar you set for the game. An experiment done in Alchem
Fighter should be good enough to say "this is worth checking properly", and
then the professional tool decides whether it's worth a real lab. So the game
needs to get these right:

| Must be right | Can be approximate |
|---|---|
| Which atoms bond to which (valence, bond topology) | Exact energies to better than ~10% |
| Molecule shapes (bond lengths within ~0.05 Å, sensible angles) | Absolute reaction rates |
| Whether a reaction releases or absorbs energy | Barrier heights beyond "low, medium, high" |
| Which of two products is more stable, when they differ clearly | Solvent effects in detail |
| Charges going the right way (which atom gets the electrons) | Quantum effects beyond what the lookup tables give |
| Atomic spectra (we already use exact data) | Long-time behaviour (hours of chemistry in seconds) |

If those hold, a player's result is a sensible starting point for a
professional run, and the export makes that run easy.

## 2. The methods professionals use

From cheapest to most accurate. "Cost" is a rough order of magnitude per atom
per time step, relative to a classical force field; real numbers depend
heavily on system size and hardware.

| Method | What it is | Can bonds break? | Elements | Rough cost | Used in drug work for | Examples |
|---|---|---|---|---|---|---|
| **Docking** | Score how a rigid-ish molecule fits a protein pocket | No | Organic | Tiny | First screening of millions of molecules | AutoDock Vina, Glide |
| **Classical force-field MD** | Atoms are balls, bonds are springs, charges are fixed | **No** (bonds are fixed at the start) | Organic + common ions | 1× | The workhorse: how drugs and proteins move, nanoseconds to microseconds | AMBER, CHARMM, OPLS, OpenFF force fields in OpenMM, GROMACS, AMBER, Desmond |
| **Free-energy perturbation (FEP)** | MD that slowly morphs molecule A into B to measure binding strength | No | Organic | 1× but many runs | Predicting how tightly a drug binds, to about 1 kcal/mol | FEP+, OpenFE, GROMACS |
| **Reactive force fields** | Springs whose strength depends on bond order, so bonds can form and break | **Yes** | Per parameter set (C/H/O, metals, etc.) | ~10–100× | Rare in drugs; standard for combustion, explosives, batteries, materials | ReaxFF in LAMMPS and AMS |
| **Machine-learned potentials** | A neural network trained on quantum calculations predicts forces | Yes, within what it was trained on | Organic sets (ANI, MACE-OFF, AIMNet2) or near-universal (MACE-MP, Meta's UMA) | ~100–1,000× | Fast becoming common: near-DFT accuracy for ligands and reactions at a fraction of the cost | MACE, AIMNet2, ANI-2x, UMA via OpenMM-ML or ASE |
| **Semi-empirical QM** | Simplified quantum mechanics with fitted parameters | Yes | Almost all (GFN-xTB: up to radon) | ~1,000–10,000× | Quick geometries, conformers, screening reactions | xtb (GFN2-xTB), MOPAC (PM7) |
| **Density functional theory (DFT)** | Proper quantum mechanics of the electron density | Yes | All | ~10⁵–10⁶× | Reaction mechanisms, charges and torsions used to build force fields | ORCA, Gaussian, Q-Chem, Psi4, PySCF, CP2K |
| **QM/MM** | DFT for the reacting part (e.g. an enzyme's active site), classical MD for the rest | Yes, in the QM zone | All | Set by the QM part | Enzymes, covalent drugs | ORCA, Q-Chem, CP2K, AMBER |
| **Coupled cluster, CCSD(T)** | Near-exact quantum chemistry, the "gold standard" | Yes | All | Enormous; small molecules only | Reference numbers that everything else is checked against | ORCA, Psi4, Molpro |

Three things stand out for a game:

- **The standard drug-discovery tool, classical MD, can't make fireworks.** Its
  bonds are fixed, so nothing burns, nothing reacts. It's the wrong live engine
  for us, though it's the right *export target* for "does this molecule hold
  together and how does it move".
- **Reactive force fields are exactly what fireworks need**, and ReaxFF is
  routinely used to simulate combustion. But each ReaxFF parameter set only
  covers certain elements and chemistries, and creative mode needs the whole
  periodic table.
- **Fast quantum and ML methods have become the honest referees.** GFN2-xTB
  covers nearly the whole periodic table and runs in seconds for a hundred
  atoms on a laptop. ML potentials like MACE and AIMNet2 give near-DFT
  answers much faster than DFT. Neither is fast enough to run 90 times a second
  for thousands of atoms on a headset, but both are fast enough to *check* the
  game's answer.

A fun coincidence: FEP is officially called **alchemical** free-energy
calculation, because it transmutes one molecule into another. That's a natural
late-campaign level for a game called Alchem Fighter.

## 3. The recommended engine: three speeds

```
   every frame (90 Hz)          every few seconds                on request
 ┌──────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
 │  LIVE                │   │  CHECK                  │   │  EXPORT                 │
 │  reactive bond-order │──▶│  GFN2-xTB or ML         │──▶│  .xyz / .pdb / .sdf     │
 │  force field + event │   │  potential re-scores a  │   │  + inputs for xtb, ORCA,│
 │  layer (fireworks)   │◀──│  snapshot; corrects and │   │  OpenMM, LAMMPS         │
 │  in the headset      │   │  flags disagreements    │   │  + provenance notes     │
 └──────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### 3a. Live: a reactive force field that covers every element

The live engine combines two well-tested ideas:

- **Universal Force Field (UFF) rules** give sensible bond lengths, angles and
  stiffness for any pair of elements from per-element numbers (radius,
  electronegativity, preferred geometry). That is how creative mode can let
  the player bond any atom to any other and still get a believable shape.
- **ReaxFF-style bond orders** make it reactive. Each bond's strength fades
  smoothly as atoms move apart, so bonds can break; valence is tracked so
  carbon doesn't make six bonds; charges flow between atoms (charge
  equilibration) so oxygen pulls electrons toward itself.
- **Real bond energies.** Each element pair's bond energy is calibrated
  against published data and against GFN2-xTB, stored with its source like the
  provenance table in `GAME_DESIGN.md` §6. For chemistries where an official
  ReaxFF set exists (for example hydrogen and oxygen burning), we can test our
  numbers against it directly.

Budget: a few hundred atoms with full detail on a standalone Quest headset,
a few thousand on a PC headset or desktop, more with WebGPU compute when it's
stable in headsets (see §5). Atoms far from the action can be frozen or
merged, like distant terrain in a game.

### 3b. The event layer: honest slow motion and rare events

Bonds vibrate every ~10–30 femtoseconds, while most reactions at room
temperature wait milliseconds or longer for a lucky collision. No single
slow-motion speed shows both, which the game already handles for light
(`GAME_DESIGN.md` §8). Chemistry does the same:

- **Wave view:** about 1 screen second = 1 picosecond. Bonds visibly stretch,
  snap and form. This is where fireworks happen.
- **Wait view:** when nothing is happening, the game jumps ahead using
  **reaction rates** (computed from barrier heights, the way professional
  "kinetic Monte Carlo" does), and shows the real time skipped on the HUD.
- The player's weapons cheat the waiting honestly: a photon, a fast electron
  or a hot atom supplies the energy to get over the barrier *now*, which is
  how real chemistry gets started too (sparks, light, heat).

### 3c. The fireworks are the physics

Real fireworks are chemistry made visible, so the visuals can be accurate and
spectacular at the same time:

| What you see | Where it comes from | Accuracy |
|---|---|---|
| Atoms glowing white-orange when a reaction releases energy | The released energy heats atoms; colour from the temperature (blackbody) | Real temperatures from the simulation |
| Coloured flashes: red, green, blue, yellow | Excited atoms and molecules emit their own spectral lines: strontium red, barium green, copper blue, sodium yellow | Line positions from NIST data, as the hydrogen levels already are |
| Photons flying out | The prototype's existing wave-packet photons, now emitted by molecules | Same physics as the photon gun |
| Bonds as glowing bridges that thin and snap | Brightness follows the live bond order | Directly from the force field |
| Electron clouds shifting toward oxygen or chlorine | Live charges from charge equilibration | Approximate, correct direction |
| A shockwave when a reaction makes gas | Hot product molecules flying apart | From the dynamics |
| Detailed orbital clouds for small molecules | Precomputed DFT orbitals baked into textures (`GAME_DESIGN.md` Tier 3) | Professional quality, looked up |

### 3d. Check: professional methods as referees

A background process takes snapshots of the player's system and re-scores
them with GFN2-xTB or an ML potential:

- Shows a **confidence meter** ("Lab check: game and xTB agree within 4%").
- Where they disagree, the referee's answer wins: the game nudges its numbers
  for that bond type, or flags the result as "unverified".
- This is also how we tune the live engine during development: run thousands
  of test molecules through both and fix the worst mismatches.

Where it runs is a cost decision for later. Options: on the player's PC (free
for us, works for PC VR and desktop), in the browser if a WebAssembly build of
a referee proves fast enough, or on a small server (costs money each month, so
probably only for the paid version or for "submit to the community" builds).
The game must work fully without it.

### 3e. Export: hand the experiment to a professional

One button, available in campaign and creative mode, writes a folder with:

- **Structures:** `.xyz` (extended XYZ, any element), `.pdb`, `.sdf`/`.mol`
  (what drug-discovery tools read).
- **Trajectory:** the last few picoseconds as extended XYZ, so a professional
  can see the exact event.
- **Ready-to-run inputs:**
  - `xtb`: geometry optimisation and a short MD run (free, fast, runs on a laptop).
  - `ORCA`: DFT single-point and optimisation with a sensible modern default (free for academics).
  - `OpenMM`: a Python script for classical MD of stable products, or ML-potential MD through OpenMM-ML.
  - `LAMMPS`: ReaxFF input when the chemistry matches a published parameter set.
- **A plain-English README** saying which numbers came from the game, which
  from the referee, and what a professional should check first.

This is the promise in the game's pitch made concrete: players do an
experiment, and anyone with a laptop and free tools can test it properly.

## 4. Why not just use one professional method live?

| Option | Why not (as the live engine) |
|---|---|
| Classical MD only | Can't break or form bonds, so no reactions and no fireworks |
| ReaxFF only | Needs a matching parameter set per chemistry; no set covers the whole periodic table, so creative mode would hit walls |
| ML potential only | Too slow for thousands of atoms at 90 Hz on a headset today; also unreliable outside its training data (a creative-mode player *will* find odd molecules) |
| xTB or DFT only | 1,000 to a million times too slow for live play |

The three-speed design uses each where it's strong. As headsets and ML
potentials get faster, the ML referee can move closer to live, and the game's
accuracy rises without redesigning anything.

## 5. Platform: VR first, built on the web

Your 2019 vision (`alchemfighter/vr/`) is an A-Frame WebVR scene: a hydrogen
atom floating in zero-gravity space against a starfield, a gaze cursor, and
"Rational Bonding Presents Alchem Fighter". The current prototype is plain
WebGL2 in the browser. The natural path keeps both:

**Build with three.js and WebXR.** A-Frame itself is built on three.js, so this
is the same family, just with more control. One URL then works:

- in a Quest browser as full VR, with hand controllers;
- on a PC VR headset through a desktop browser;
- on a flat screen and phone as a "window" mode, for testing and for the free
  itch.io version.

**What VR changes in the design:**

- **90 frames a second is a hard floor**, or players feel sick. The simulation
  runs in a separate worker at its own pace and the renderer smooths between
  steps, so a slow chemistry step never drops a frame.
- **The ship is a cockpit.** A fixed cockpit frame around the player greatly
  reduces motion sickness when flying, and it's where the instruments live.
- **Creative mode becomes hands-on:** grab an atom, feel it snap into a bond
  (controller vibration scaled by bond energy), pull a molecule apart. Research
  groups already do this with real simulations in VR (the open-source
  NanoVer/Narupa project, and Nanome, which pharmaceutical companies use),
  so it's a proven way to handle molecules.
- **Electron clouds cost twice as much in stereo.** The raymarched orbital
  shader needs lower resolution, foveated rendering, or baked impostors for
  distant atoms.

**The honest risk:** standalone Quest headsets have phone-class graphics
chips, and WebGPU compute inside WebXR on Quest's browser is still marked
*experimental* (added in browser v146, April 2026, and still behind flags for
some features in v152). Until it's stable, the live engine runs on the CPU in
WebAssembly, which limits it to a few hundred detailed atoms on a standalone
headset.

**The escape hatch:** write the physics core as an engine-independent module
(Rust compiled to WebAssembly, as `GAME_DESIGN.md` §9 already suggests). If the
web can't go fast enough on headsets, the same core plugs into **Godot 4**
with native OpenXR and the Meta and Steam stores, without rewriting the
chemistry. The repo's `Alchem_Fighter_GODOT/` stub is Godot 3 and would be
replaced, not upgraded.

## 6. Suggested order of work

1. **Physics core, small:** the reactive force field for H, C, N, O, Cl, Na,
   plus a test suite that compares bond lengths and bond energies of ~30 small
   molecules against GFN2-xTB reference numbers checked into the repo.
2. **Export button** (structures and xtb input). Cheap, and it delivers the
   "re-run it professionally" promise from day one.
3. **First chemistry level: hydrogen meets oxygen.** Two H₂ and one O₂ become
   water with a flash. It is the best-studied combustion reaction there is,
   with ReaxFF parameters and many published simulations to compare against.
4. **WebXR mode** with hand-grabbing for a creative-mode first slice.
5. **Fireworks metals** (strontium, barium, copper, sodium) with real emission
   lines: a "make a red firework" level.
6. **Referee (xTB or ML) on PC**, then decide whether a server is worth paying for.
7. **Revisit WebGPU-in-WebXR** on Quest; if still experimental, measure whether
   Godot 4 is needed.

## 7. Open questions for Steve

- Is a **PC-VR-first** release acceptable (more power, fewer players), or must
  the standalone Quest browser be the main target from the start?
- Should the free itch.io version include the **export button**, or is that a
  paid-version or community feature?
- Are you willing to pay for a small **referee server** later, or should the
  referee only ever run on the player's own computer?

## Sources and further reading

- Narupa / NanoVer, interactive molecular dynamics in VR: O'Connor et al.,
  *J. Chem. Phys.* 150, 220901 (2019), [arXiv:1902.01827](https://arxiv.org/abs/1902.01827)
- MACE-OFF machine-learned force field for organic molecules: Kovács et al.,
  *JACS* (2025), [arXiv:2312.15211](https://arxiv.org/abs/2312.15211)
- Meta Quest Browser release notes (WebGPU in WebXR, experimental):
  [v146.0](https://developers.meta.com/horizon/downloads/package/browser/146.0/),
  [v152.1](https://developers.meta.com/vr/downloads/package/browser/152.1?view=full_width)
- GFN2-xTB: Bannwarth, Ehlert and Grimme, *J. Chem. Theory Comput.* 15, 1652 (2019)
- ReaxFF: van Duin et al., *J. Phys. Chem. A* 105, 9396 (2001); Senftle et al.,
  *npj Comput. Mater.* 2, 15011 (2016)
- UFF: Rappé et al., *J. Am. Chem. Soc.* 114, 10024 (1992)
- Atomic emission lines: [NIST Atomic Spectra Database](https://physics.nist.gov/asd)
