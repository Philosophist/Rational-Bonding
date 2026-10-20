# Rational-Bonding

**Alchem Fighter**: an atomic-scale space fighter. Your guns fire photons,
electrons, protons, neutrons and atoms, and every level is a real physical system
you must drive into a target state.

- **Play the prototype:** open [`prototype/index.html`](prototype/index.html) in a
  WebGL2 browser. No build step.
- **Design document:** [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)

The prototype renders exact hydrogen wavefunctions in a GPU raymarching shader,
models the real hydrogen spectrum with selection rules, polarization, lifetimes
and stimulated emission, and includes an Orbital Lab (creative-mode groundwork)
for elements H to Kr.
