/**
 * Characters github-slugger removes: everything that is not Unicode `Alphabetic`, a mark, a decimal
 * digit, connector punctuation (`_`), a hyphen or a space. Compared against the generated regex
 * shipped in github-slugger@2.0.0 over every code point: identical for everything assigned in
 * Unicode 13, which that regex was generated from; characters added in later Unicode versions are
 * removed by the pinned regex and kept here because the runtime's Unicode tables know them.
 */
const REMOVED_CHARACTERS = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\- ]/gu;

/**
 * Slugify one heading the way github-slugger does without tracking duplicates.
 */
export function slugify(value: string): string {
  return value.toLowerCase().replace(REMOVED_CHARACTERS, "").replaceAll(" ", "-");
}

/**
 * Per-document slugger with github-slugger's duplicate handling: the second `Foo` heading becomes
 * `foo-1`, the third `foo-2`, and a heading that literally reads `Foo 1` claims `foo-1` first.
 * Astro creates one of these per markdown file, so anchors are unique within a page only.
 */
export class GithubSlugger {
  private readonly occurrences = new Map<string, number>();

  slug(value: string): string {
    const originalSlug = slugify(value);
    let result = originalSlug;

    while (this.occurrences.has(result)) {
      const count = (this.occurrences.get(originalSlug) ?? 0) + 1;
      this.occurrences.set(originalSlug, count);
      result = `${originalSlug}-${count}`;
    }

    this.occurrences.set(result, 0);
    return result;
  }
}
