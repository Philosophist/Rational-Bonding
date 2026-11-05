// The built-in fallacy library. Each definition completes the sentence
// "A <name> fallacy is when an argument ...", so a fallacy node always reads
// as a definition, and an arrow to it reads "<A> is an example of a <name> fallacy".
export const FALLACIES = [
  { name: 'Straw man', when: "misrepresents an opponent's position to make it easier to attack." },
  { name: 'Ad hominem', when: 'attacks the person making a claim instead of the claim itself.' },
  { name: 'Appeal to authority', when: "treats a claim as true only because an authority said it, especially outside that authority's expertise." },
  { name: 'Appeal to popularity', when: 'treats a claim as true because many people believe it.' },
  { name: 'Appeal to emotion', when: 'uses feelings such as fear or pity in place of reasons.' },
  { name: 'Appeal to nature', when: 'treats something as good because it is natural, or bad because it is not.' },
  { name: 'Appeal to ignorance', when: 'treats a claim as true because it has not been proven false, or false because it has not been proven true.' },
  { name: 'False dilemma', when: 'presents only two options when more exist.' },
  { name: 'Slippery slope', when: 'claims one step will lead to an extreme outcome without showing each link in the chain.' },
  { name: 'Circular reasoning', when: 'uses its conclusion as one of its own premises.' },
  { name: 'Hasty generalization', when: 'draws a broad conclusion from too few or unrepresentative cases.' },
  { name: 'Post hoc', when: 'assumes that because one thing followed another, the first caused the second.' },
  { name: 'Tu quoque', when: "dismisses a criticism by pointing out that the critic does the same thing." },
  { name: 'Red herring', when: 'brings in an irrelevant point to draw attention away from the issue.' },
  { name: 'Equivocation', when: 'uses one word in two different senses as if they were the same.' },
  { name: 'Burden of proof', when: 'demands that others disprove a claim instead of supporting it.' },
  { name: 'Gish gallop', when: 'buries the other side under so many weak points that they cannot all be answered.' },
];

// "a Straw man", "an Ad hominem".
export function article(word) {
  return /^[aeiou]/i.test(word ?? '') ? 'an' : 'a';
}

export function fallacyText(f) {
  const a = article(f.name);
  return `${a[0].toUpperCase()}${a.slice(1)} ${f.name} fallacy is when an argument ${f.when}`;
}
