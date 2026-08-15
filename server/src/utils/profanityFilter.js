import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

// englishRecommendedTransformers already normalizes case, leetspeak substitutions, repeated
// characters, and non-alphabetic separators before matching, so this catches common evasion
// attempts (e.g. "n1gger") without flagging legitimate names/words that merely contain a profane
// substring (e.g. "Scunthorpe", "Cassandra").
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(text) {
  return matcher.hasMatch(text);
}
