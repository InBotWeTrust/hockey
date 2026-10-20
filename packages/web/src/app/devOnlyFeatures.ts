export function isMarksmanshipConstructorEnabled(value: string | undefined): boolean {
  return value === 'dev-only-enabled';
}

// This flag is enabled only by the dev build workflow. A production bundle
// exclusion check is mandatory; this comment is not the release guard.
export const MARKSMANSHIP_CONSTRUCTOR_ENABLED = isMarksmanshipConstructorEnabled(
  import.meta.env.VITE_MARKSMANSHIP_CONSTRUCTOR,
);
