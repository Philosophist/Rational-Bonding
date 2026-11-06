# Level 1: A Lone Proton (hydrogen tutorial)

*Rational Bonding · level design, 2026-11-06 · builds on
`SIMULATION_APPROACH.md` and `GAME_DESIGN.md`*

## At a glance

| | |
|---|---|
| **System** | One bare proton, then a cloud of 24 protons (an H⁺ plasma), all inside the sealed **system sphere** (§2a) |
| **Target state** | At least **10 neutral H₂ molecules** at the same time, held for 10 game seconds |
| **Weapons** | Electron gun (from the start), photon gun (unlocked in beat 3), atom launcher (hydrogen only, beat 5) |
| **Constraint** | None on the first play. Replays add an energy budget and a timer for star ratings. |
| **Modes** | Same level in VR and in the flat-screen window. Nothing is grabbed: every change is made by firing. |
| **Length** | About 15 minutes for a first-time player |

The tutorial teaches the controls and the first chapter of a school chemistry
course at the same time: what a proton, an ion and an atom are, how electrons
and light trade energy, what orbitals look like, and why hydrogen gas is made
of H₂ molecules rather than single atoms.

## 1. Where it sits in the lesson plan

Most high-school and first-year chemistry courses run in roughly this order.
The campaign follows it, and the tutorial is a short tour of the first four
rows that later levels go into properly.

| # | Unit in a typical chemistry course | Tutorial beat | Later levels |
|---|---|---|---|
| 1 | Atoms: protons, electrons, neutrons, charge | 1, 2 | |
| 2 | Isotopes and atomic mass | (rare deuterium find, §6) | Level 2: Heavy Hydrogen |
| 3 | Light and electrons: spectra, energy levels, orbitals | 2, 3 | Act I of `GAME_DESIGN.md` (First Light to Rydberg Ladder) |
| 4 | Ions | 1, 4 | Ion Hunter |
| 5 | Electron configuration and the periodic table | | Lithium Problem, Orbital Lab |
| 6 | Covalent bonding | 5 | Act III (H₂ spin, water) |
| 7 | Reactions and energy | 5 (bond energy as fireworks) | Hydrogen meets oxygen (`SIMULATION_APPROACH.md` §6) |
| 8 | Nuclear chemistry | | Act II |

For teachers, the tutorial touches these US Next Generation Science
Standards (NGSS) performance expectations:

- **HS-PS2-4**: Coulomb's law (the proton pulling the electron, protons pushing
  each other apart).
- **HS-PS4-1**: wavelength, frequency and energy of light.
- **HS-PS4-4**: different wavelengths of light have different effects on matter.
- **HS-PS1-1**: outer electrons explain how an element behaves (hydrogen's
  single electron and its half-full 1s shell).
- **HS-PS1-4**: energy released when bonds form (the H₂ fireworks).

## 2. The setting and the instruments

Open space, a starfield, and in front of the cockpit a single glowing point:
a proton. It continues Steve's 2019 VR scene (a hydrogen atom floating in
space), but starting one step earlier, before the atom exists.

Cockpit instruments used in this level (panels in VR, screen edges in the
window):

- **Field view** (toggle): electric field lines and a faint "potential
  landscape" grid that dips around positive charges and rises around negative
  ones.
- **Spectrometer**: every photon emitted or absorbed, as a line at its real
  wavelength, with a strip for ultraviolet and infrared that the eye can't
  see.
- **Energy ladder**: the hydrogen levels E_n = −13.6 eV / n², with the
  electron's current level lit.
- **Census**: counts of H⁺, H, H⁻, H₂⁺ and H₂ in the sphere.
- **Time scale**: "1 s = …" as in `GAME_DESIGN.md` §8.

## 2b. How charges are drawn: as fields, not balls

A proton is about 60,000 times smaller than the hydrogen atom's 1s cloud, and
an electron has no measured size at all. Drawn to scale they would be
invisible. What a charge really spreads through space is its **electric
field**, so the game draws each free charge as a glow of its field:

- **Brightness follows field strength**, which falls off as 1/r². The centre
  would be infinitely bright, so brightness is mapped on a logarithmic scale
  with a cap, and the HUD's legend says so.
- **Positive and negative get different colours**, chosen not to clash with
  the cyan and magenta the orbital renderer uses for wave phase.
- **Fields add up.** Two protons make one brighter, stretched glow. When an
  electron is captured, its field and the proton's cancel outside the atom,
  so the glow **fades away** as the atom becomes neutral, and the electron
  cloud (the orbital) takes its place. Neutralizing is literally visible.
- **A free electron is also a small wave packet.** Its position is only
  known to within its wavelength (about a nanometre for a slow electron,
  bigger than the atom), so its glow is slightly smeared. This is the
  uncertainty principle at work, and it matters for aiming (beat 2).

## 2a. The system sphere

Every level takes place in a sealed **system sphere**. The player can't leave
it, and neither can matter. It behaves like this:

- **Matter stays in.** Protons, electrons, atoms and molecules bounce off the
  wall without losing energy and without reacting with it. That's the one
  idealization: a real wall would absorb some heat and, if it were bare metal,
  turn H atoms into H₂ on its surface. The best real wall for keeping atomic
  hydrogen is a Teflon coating, as in hydrogen masers.
- **Light leaves.** Photons cross the wall and escape. The spectrometer records
  every escaping photon, so it shows what a telescope looking at this cloud
  would see. Escaping light takes its energy with it, which is how a real gas
  cloud cools.
- **Inside, light only does what it really does:**
  - **Bare protons (H⁺) ignore light almost completely.** With no electron
    they have nothing to absorb with, and the scattering off a bare proton is
    about three million times weaker than off an electron. Photons pass
    straight through an ion cloud.
  - **Neutral atoms absorb photons that match a jump**, and re-emit them in a
    random direction (fluorescence). A resonant photon in a dense neutral
    cloud can be passed from atom to atom many times before it escapes. This
    is real *radiation trapping*.
  - **Light pushes, a little.** Every photon carries momentum. An H atom that
    emits or absorbs a 121.6 nm photon recoils at about **3 m/s**. At room
    temperature, atoms already move at around 2,500 m/s, so the push is real
    but small. The engine includes it, and the player won't notice it unless
    the gas is very cold. (It's the same effect that lets physicists cool
    atoms with lasers.)
- **Later levels can build the wall.** A shell of atoms or a cold grain-coated
  wall turns escaping light into fluorescence or heat, and catches atoms so
  they meet and make H₂. Both are real and make good tools for later levels.

Tutor lines below are written in plain words and kept short. They appear as a
voice line plus a caption, and each can be replayed from the log.

## 3. The beats

### Beat 1: Meet the proton

**The player sees** a glow, brightest at the centre and fading outward,
showing the strength of the proton's electric field (see §2b). Field lines
radiate outward when Field view is on.

> *Tutor:* "This is a proton. It's also a hydrogen ion, written H⁺: a
> hydrogen atom that has lost its only electron. It carries one unit of
> positive charge, and that charge reaches out into space as an electric
> field. Turn on Field view to see it."

**The player does**: flies around it (teaches movement) and toggles Field
view. A stray electron drifts in from off-screen, curves toward the proton,
swings past it and leaves. This shows the pull, and that a fast-moving
electron isn't caught just because it's attracted.

**Physics**: Coulomb's law, F = k·q₁q₂/r². The field lines' density follows
1/r². The stray electron follows a real hyperbolic orbit around the proton.

**Done when** the player has looked at the field from two sides and toggled
it once.

### Beat 2: First capture (electron gun)

> *Tutor:* "Your gun fires electrons. Electrons are negative, so the proton
> pulls them in. But an electron can only stay if it gets rid of its energy,
> and it does that by giving off light. Fire a slow electron at the proton."

**The player does**: fires electrons. The speed dial starts at "slow".

- **Most passes miss.** An electron is only caught if it gives off a photon
  while it swings past, and that is unlikely on any one pass. The chance is
  much higher when the electron is **slow** and passes **close**, because
  that's where it is pulled hardest and swings most sharply. So aim matters:
  a near-miss with a slow electron is far more likely to be caught than a
  wide or fast one.
- **The aim cone.** The gun shows a faint cone where the electron will
  actually go. It can't be a perfect line, because the electron is a wave
  (§2b), and slower electrons have wider cones. That sets up a real
  trade-off: slow electrons are easier to catch but harder to aim.
- **Feedback.** After each pass, the HUD shows how close it came and the
  capture chance it had ("closest pass 0.3 nm, chance 2%"), so the player
  learns what a good shot is.
- **Too fast**: the electron swings around the proton and escapes, like the
  stray in beat 1. The tutor says "Too fast to catch. Try slower and closer."
- **Slow and close**: the proton captures it. An electron cloud blooms around it,
  first large and lobed, then stepping down in a cascade of flashes until it
  settles into the small round 1s cloud. Each step sends out a photon, shown
  as a wave packet and as a line on the spectrometer. Very often one of them
  is the red **H-alpha** line at 656.3 nm, the colour of glowing hydrogen
  nebulae.

> *Tutor:* "You just made a hydrogen atom. The electron dropped down an
> energy staircase and every step came out as light. It stops at the bottom
> step, called 1s. It can't fall any further and never lands on the proton:
> 1s is the lowest energy an electron can have here."

**Physics** (this is what "as it happens in nature" means here):

- In nature a free electron is rarely caught straight into 1s. It is
  usually caught into a higher level (n = 2, 3, 4 …) and **cascades** down,
  giving off one photon per jump. This is *radiative recombination*, and it is
  why hydrogen clouds in space glow red: in typical nebula conditions about
  45% of captures produce an H-alpha photon on the way down.
- The game picks the capture level from real recombination cross sections
  (slower electrons are captured much more readily) and each downward jump
  from the real branching ratios and lifetimes already used in the prototype.
- If the electron does go straight to 1s, a single ultraviolet photon carries
  away 13.6 eV plus the electron's kinetic energy (wavelength shorter than
  91.2 nm). The tutorial shows this case once, labelled, so both are seen.
- Real capture is very unlikely per pass: for a slow electron, roughly one
  pass in many thousands even when aimed well. The game multiplies every
  chance by the same factor, so the **shape** stays real (slower and closer
  is better, by the real ratios) while a good shot succeeds within a few
  tries. The HUD shows the factor (see §7).

**Done when** one neutral hydrogen atom exists.

### Beat 3: Light up the atom (photon gun)

The photon gun unlocks. This beat reuses the prototype's photon gun, orbital
renderer and spectrum, which already implement the real hydrogen lines and
selection rules.

> *Tutor:* "Now your gun can also fire light. Light comes in packets called
> photons, and a photon's colour, its wavelength, sets its energy. Shorter
> wavelength means more energy. The electron only takes a photon whose energy
> exactly matches a jump on its staircase."

**The player does**, guided:

1. Fires at **121.6 nm** (Lyman-alpha, ultraviolet). The electron jumps from
   1s to **2p**: the cloud stretches from a sphere into a dumbbell, sloshing
   while it changes. A moment later (real lifetime 1.6 ns, shown on the time
   scale) it drops back and a 121.6 nm photon flies out.
2. Fires a wavelength that matches nothing, say 140 nm. The photon passes
   through or scatters. "No matching step, so nothing happens."
3. Fires at **102.6 nm** (Lyman-beta). The electron jumps to **3p**. Most
   of the time it jumps straight back and one 102.6 nm photon comes out. About
   one time in eight it goes down in steps instead: a **red 656.3 nm** photon
   first, landing in 2s, and then ultraviolet light carrying the remaining
   10.2 eV. The player keeps firing until they see a step-down (the cascades
   from beat 2 show the same thing, so a lucky streak never blocks progress).

> *Tutor:* "Look at the spectrometer. One ultraviolet photon went in. A red
> one and an ultraviolet one came out, and their energies add up exactly to
> the one you fired. Big jump, short wavelength. Small jump, long
> wavelength."

4. **Free play** for a minute: the spectrometer marks every line the player
   discovers. Higher levels (n = 4, 5) have bigger, stranger clouds.

**Physics**: E_photon = hc/λ, and 1240 eV·nm / λ gives the energy in eV.
1s → 3p is 12.09 eV; 3p → 2s is 1.89 eV (red) and the
remaining 10.20 eV leaves from 2s. 2s can't give off a single photon, so in
empty space it waits about 0.12 s and emits two photons that share the
10.20 eV. Near other charges (the ions of beat 4) the electric field mixes 2s with 2p and it drops
almost at once with one 121.6 nm photon (field quenching). Both are real, and
the prototype, which currently treats 2s as stable, needs both added. A single photon from 1s only reaches p
orbitals (Δl = ±1); d and f shapes are left to Act I levels such as Balmer
Red, and the tutor mentions that "some shapes need two photons, and you'll
learn those later".

**Honesty note in the HUD**: all the Lyman photons are ultraviolet and
invisible to the eye. They are drawn in a false violet with a "UV" tag, and
the spectrometer shows where they really are.

**Done when** the player has excited the atom twice and seen a cascade.

### Beat 4: Neutralize the cloud

The view pulls back to show the whole system sphere. 23 more protons drift
inside it, spread out because they repel each other; the outer ones press
against the wall. The first atom sits among them.

> *Tutor:* "A cloud of hydrogen ions. Notice they keep their distance: like
> charges push each other apart. Turn each one into a neutral atom with your
> electron gun."

**The player does**: catches electrons on all 24 protons. As they neutralize,
the field lines disappear one by one, and the census counts H⁺ down and H up.

**What the player learns by doing**:

- Neutral atoms stop pushing each other and stop curving electrons. Field view
  makes this very visible.
- Firing **too fast** at a neutral atom knocks its electron back out
  (electron-impact ionization, threshold 13.6 eV). The tutor warns once:
  "That electron hit so hard it knocked the other one out."
- Stray cascade photons from one atom can be absorbed by a neighbour, which
  then glows too: a quick, pretty demonstration of how light passes through a
  gas (radiation trapping, already in the prototype).

**Physics**: Coulomb dynamics for all charged particles; capture and
ionization outcomes from cross sections. A pure proton cloud pushes itself
outward (Coulomb repulsion) until the sphere's wall holds it, so before the
player starts, the protons sit spread out near the wall. Neutral atoms stop
pressing outward and drift freely.

**Done when** no H⁺ is left (or the player moves on with at least 20 neutral
atoms).

### Beat 5: Make hydrogen gas (the real objective)

> *Tutor:* "Hydrogen atoms don't like being alone. Two of them can share their
> electrons and become one H₂ molecule, and almost all the hydrogen around you
> on Earth is H₂. Make at least ten. There's a catch, and finding it is the
> point of this level."

The goal is open: **10 or more H₂ in the sphere at once, held for 10 seconds**.
Atoms drift and collide on their own. The player learns that two atoms bumping
into each other *almost never* stick, and has to find a way to make them stick.
The tutor gives hints only if the player is stuck, revealing one route at a
time (after 60 s, 120 s, 180 s and 240 s).

**Why two atoms bump and bounce (the catch).** When two H atoms meet with
their electron spins opposite, they fall into a bond and release 4.5 eV. That
energy stays in the pair as violent vibration, more than enough to fly apart
again, so they do, within one vibration. A bond only lasts if something
carries the energy away. And if their spins are parallel (3 times out of 4
for random atoms), they just repel.

The routes that work, all of them real:

| Route | What the player does | Real chemistry | Where it happens in nature |
|---|---|---|---|
| **Third body** | Launch a hydrogen atom (atom launcher) into a colliding pair at the right moment. The third atom leaves fast, carrying the energy, and the pair stays bonded. | Three-body recombination, H + H + M → H₂ + M | Dense gas: lab hydrogen, stars' atmospheres, Jupiter |
| **Dust grain** | A small cold grain drifts through the sphere. Steer atoms onto it by bouncing photons or electrons off them; atoms stick, wander across the surface, meet, and an H₂ pops off. | Surface catalysis: the grain soaks up the energy | **The main way H₂ forms in space today** |
| **H⁻ shortcut** | Fire one *extra* slow electron at a neutral atom to make H⁻ (a faint infrared photon flashes out). H⁻ meets an H, forms H₂ instantly and throws the spare electron out. | H + e⁻ → H⁻ + photon, then H⁻ + H → H₂ + e⁻ | **How the first molecules formed after the Big Bang** |
| **H₂⁺ shortcut** | Leave a proton un-neutralized. It grabs a neutral atom to make H₂⁺ (one electron holding two protons). Another H atom collides with it, takes the bond, and the proton is set free again. | H⁺ + H → H₂⁺ + photon, then H₂⁺ + H → H₂ + H⁺ | Also in the early universe |

The H⁻ and H₂⁺ routes reward players who understood beats 2 and 4: the same
electron gun that neutralized the cloud is now a catalyst. The tutor's last
hint points at the H⁻ route because it uses only the gun the player has
practised with.

**Hazards that undo progress**, each a real effect:

- **Too-fast electrons** split molecules (electron impact excites H₂ to a
  repulsive state at around 9 to 10 eV and it falls apart) or ionize atoms.
- **Hard ultraviolet photons** between 11.2 and 13.6 eV (about 91 to 111 nm)
  are absorbed by H₂ and break it roughly 10 to 15% of the time. This is what
  destroys H₂ around young stars. Lyman-alpha (121.6 nm) doesn't.
- **Heat**: each new H₂ releases energy, so a busy sphere warms up. Above a few
  thousand kelvin, H₂ shakes itself apart. Making molecules too fast in one
  spot can cook them; the dust grain also acts as a cooler.

**Fireworks**: every bond forming is a flash. The new molecule glows hot
(blackbody colour from its real vibrational energy), the third body or the
ejected electron streaks away, and freshly made H₂ shines in the infrared on
the spectrometer as it calms down. The bond itself is a glowing bridge whose
brightness follows the bond order (`SIMULATION_APPROACH.md` §3c).

> *Tutor (on the first H₂):* "Two atoms, one molecule. Each electron now
> belongs to both protons, and each atom's 1s shell is full with two
> electrons. That's a covalent bond, the same kind that holds water and DNA
> together."

**Done when** the census shows 10 or more H₂ for 10 seconds. The end screen
shows which routes the player used, the light they made (a spectrum of the
whole level), and a button to **export the result** (`SIMULATION_APPROACH.md`
§3e): the final H₂ geometries and an xtb input file.

**Star ratings on replay**: use less energy, finish faster, or make H₂ by all
four routes.

## 4. Steve's questions, answered

### Why do neutral hydrogen atoms end up as H₂?

A hydrogen atom has one electron, but its 1s orbital has room for two (one
spin up, one spin down). When two atoms come close, their 1s clouds overlap
and merge into a shared **bonding orbital** that wraps around both protons.
Both electrons can sit in it, as long as their spins are opposite, and each
electron is now pulled by two protons instead of one. That lowers the energy
by 4.5 eV, a lot by chemical standards: the H–H bond (436 kJ/mol) is the
strongest single bond between two atoms of the same element. A third atom can't join, because the bonding
orbital is full, so H₂ stops there. (H₃⁺, with only two electrons, does exist
in space, but neutral H₃ falls apart.)

So given the chance, hydrogen atoms pair up, and at everyday temperatures they
stay paired. Above about 3,000 K collisions are violent enough to split H₂
again, which is why the Sun's surface holds atoms, not molecules.

The part that matters most for the game is **how** they pair: two atoms
alone can't, because the released energy has nowhere to go (beat 5 explains
it). They need a third atom, a surface, or a charged helper. This is real and
it turns the objective into a puzzle with four honest solutions.

### What changes when neutrons are attached?

| | Protium ¹H | Deuterium ²H (D) | Tritium ³H (T) |
|---|---|---|---|
| Nucleus | 1 proton | 1 proton + 1 neutron | 1 proton + 2 neutrons |
| Mass (u) | 1.008 | 2.014 | 3.016 |
| Share of natural hydrogen | 99.985% | 0.015% (1 in 6,420 in seawater) | about 1 in 10¹⁸ |
| Stable? | Yes | Yes | No: beta decay to helium-3, half-life 12.3 years |
| H-alpha line (red) | 656.28 nm | 656.10 nm | 656.04 nm |
| Molecule's bond energy D₀ | H₂ 4.48 eV | D₂ 4.56 eV | T₂ 4.59 eV |
| Molecule's vibration | H₂ 4161 cm⁻¹ | D₂ 2994 cm⁻¹ | T₂ about 2464 cm⁻¹ |
| Speed at the same temperature | 1 | 0.71 | 0.58 |

The neutron has no charge, so it doesn't change the electric pull on the
electron. Chemically, all three are hydrogen: same orbitals, same single bond,
same bond length (0.74 Å). The differences all come from **mass**:

- **Slower and heavier.** At the same temperature D moves at 71% and T at 58%
  of protium's speed, and hits harder for the same speed.
- **Slower vibrations and slightly stronger bonds.** A bond is like a spring;
  heavier balls on the same spring shake more slowly. Quantum mechanics says a
  bond can never sit perfectly still (zero-point energy), and a slower spring
  wastes less energy on that shaking, so D₂ is a little harder to break than
  H₂. It also makes reactions that move a hydrogen slower for D: breaking a
  C–D bond is up to about 7 times slower than a C–H bond. Chemists call this
  the kinetic isotope effect and use it to work out reaction mechanisms.
- **Tunnelling.** Light protium can slip through energy barriers (quantum
  tunnelling) far more easily than D or T.
- **Shifted colours.** The heavier nucleus wobbles less as the electron orbits
  it, so the energy levels shift very slightly and the spectral lines move by
  about 0.03% (0.18 nm for H-alpha). This is exactly how deuterium was
  discovered, by Harold Urey in 1931.
- **Nuclear behaviour.** Tritium is radioactive. Its neutron turns into a
  proton and it becomes helium-3, firing out an electron (beta particle, up to
  18.6 keV). A T₂ molecule that does this becomes a HeT⁺ ion and breaks apart.

### How common is each, and why?

- **Protium is almost everything** because nearly all hydrogen in the universe
  is protons left over from the Big Bang, and a single proton is perfectly
  stable.
- **Deuterium is a fossil from the first 20 minutes of the universe.** While
  the universe cooled, protons and neutrons fused into deuterium, and most of
  that was quickly fused on into helium-4. A trace survived (about 1 in 40,000
  hydrogen atoms in the cosmos). Stars only *destroy* deuterium, so there is
  no source making new amounts. Earth's oceans have about six times the cosmic
  share (1 in 6,420), most likely because the water that formed Earth's
  oceans came from ice made in cold parts of the early solar system, where
  heavy water collects more easily.
- **Tritium barely exists** because it decays with a 12.3-year half-life. The
  little that is around is made all the time when cosmic-ray neutrons hit
  nitrogen in the upper atmosphere, and in nuclear reactors.
- **No heavier isotopes survive.** Hydrogen-4 and up fall apart in about
  10⁻²² s. And one neutron is all a proton can comfortably hold: the
  deuteron is held together by only 2.2 MeV and has no excited states at all.

## 5. Isotopes in gameplay

The physics engine gives each particle its **real mass, nuclear spin and
spectrum**, so isotopes behave differently without special rules. What the
player notices:

| Effect | How it shows up |
|---|---|
| Mass | D and T drift and dodge more slowly, move less when hit by an electron or photon, and knock harder as a third body |
| Vibration | D₂ visibly shakes more slowly than H₂; HD shakes in between |
| Bond strength | D₂ survives slightly more heat and harder UV than H₂ |
| Spectrum | A photon tuned for protium **misses** deuterium. The player must retune by the isotope shift |
| Radioactivity | Tritium sits quietly, then (with a time skip) spits an electron and turns into helium-3 |
| Neutron gun | Slow neutrons are captured by protons to make deuterium, with a 2.2 MeV gamma-ray flash. Fast neutrons mostly bounce off, losing about half their energy per hit, because a neutron and a proton have the same mass |

### In the tutorial (Level 1)

The tutorial uses **natural hydrogen**. With 24 atoms at the real abundance,
there's about a 0.4% chance that one of them is deuterium. Keep it: on roughly
one play in 270 a deuteron appears, the census highlights it, and the player
gets a "Heavy Find" badge with a one-line explanation. It teaches abundance
honestly: rare means rare.

### Level 2: Heavy Hydrogen (proposed)

The neutron gun unlocks. Target: **3 D₂ molecules and 1 HD** (or similar).

1. A proton and a neutron gun. Fast neutrons ricochet off; the player learns
   to slow them by bouncing them off other protons first (this is how a
   reactor's moderator works). A slow neutron is captured: gamma flash, and
   the proton becomes a deuteron.
2. Neutralize it with the electron gun. The photon gun's protium tuning no
   longer hits: the player retunes by 0.033 nm at Lyman-alpha (and sees the
   shift on the spectrometer, as Urey did).
3. Make D₂ by the routes from Level 1, noticing it moves slower and shakes
   slower.
4. Bonus: a second capture makes tritium. It's about 600 times less likely
   than the first, which is exactly why heavy water is used to slow neutrons
   in reactors without swallowing them. Wait (time skip) and watch it decay.
   This teases Act II.

**Design note**: the prototype draws spectral lines about 10⁵ times wider than
real so they can be hit (`GAME_DESIGN.md` §11). At that width the 0.033 nm
isotope shift disappears. Level 2 needs a **precision mode** on the photon
gun (narrower game width, finer dial) or the shift must be exaggerated with a
HUD label. Precision mode is the more honest choice.

## 6. Physics model for this level

This level is the first test of the live engine in `SIMULATION_APPROACH.md`,
but it needs a few pieces that the reactive force field alone doesn't cover,
because it deals with bare charges and single atoms rather than molecules.

| Piece | Model | Accuracy |
|---|---|---|
| Free protons, electrons, ions | Classical motion in Coulomb fields, bouncing off the sphere wall | Exact for paths at these energies; quantum outcomes are chosen at events |
| Atom's electron cloud and spectrum | The prototype's exact hydrogen wavefunctions, levels, lifetimes and selection rules (Tier 0) | Exact (fine structure ignored) |
| Capture, ionization, excitation by electrons | Tabulated cross sections (radiative recombination by level; electron-impact ionization and excitation) | Real data, with the overall rate scaled up and labelled |
| H + H bonding | The exact H₂ potential curves: singlet X¹Σg⁺ (bonding) and triplet b³Σu⁺ (repulsive), with the spin of each encounter chosen 1 : 3 | Reference-quality published curves |
| Third body, grain, H⁻ and H₂⁺ routes | Event layer (`SIMULATION_APPROACH.md` §3b) with real rate coefficients, and real dynamics for the third-body collision | Real ratios, scaled rates |
| H₂ vibration and heating | Vibrational levels from the potential curve; temperature from the kinetic energy of all particles | Exact levels |
| Isotopes | Real masses enter every equation above; reduced-mass corrections to the spectrum | Exact |

**For the reactive force field (`SIMULATION_APPROACH.md` §3a):** H₂, HD and
D₂ become the first test molecules. The force field's H–H bond must match the
exact curve's bond length (0.741 Å) and energy (4.48 eV) before later levels
use it. That gives the physics core a precise, trusted first target.

**Export:** at the end the player can export the H₂ molecules as `.xyz` with an
xtb input file. Hydrogen is the simplest possible check for a professional
tool, so the export button is testable from Level 1.

## 7. Honest limits (shown in the HUD or the level's info page)

- **Rates are sped up.** In a real cold cloud, an electron passing a proton is
  captured only rarely, and H₂ formation takes thousands of years. The game
  keeps which outcomes are likely and which are rare, and scales overall rates
  so a level takes minutes. The HUD's time scale and a "rates ×N" tag say so.
- **The wall is idealized.** Matter bounces off it without sticking or
  reacting, like the Teflon-coated bulbs hydrogen masers use to keep atoms
  from recombining, only perfect. Light passes straight through it.
- **Wavelengths drawn compressed**, lines widened, and fine structure ignored,
  as listed in `GAME_DESIGN.md` §11.
- **Grain surface chemistry is simplified** to "stick, wander, meet, leave",
  with real binding energies for hydrogen on ice or carbon grains.

## 8. Steve's decisions (2026-11-06)

| Question | Decision |
|---|---|
| Where does the level take place? | A sealed **system sphere** (§2a): matter stays in, light escapes. |
| How are free charges drawn? | As the glow of their electric field (§2b). |
| Does aim matter for electron capture? | **Yes:** most passes miss, as in reality; slow and close passes are caught more often (beat 2). |
| Should the wall become a tool in later levels? | **Yes:** a cold wall atoms stick to, or a shell that catches light. |
| Hints for making H₂? | **One route at a time**, only when the player is stuck. |
| Level 2? | **Heavy Hydrogen** (isotopes and the neutron gun), before the light-and-orbitals levels. |
