interface BuildFile {
  type: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  viteMetadata?: { importedCss: Set<string> };
}
/** Follow static imports only: secondary routes are cached when actually requested. */
export function criticalPwaAssets(bundle: Record<string, BuildFile>): Set<string> {
  const assets = new Set<string>();
  const visit = (name: string): void => {
    if (assets.has(name)) return;
    const file = bundle[name];
    if (!file) throw new Error(`Missing critical PWA dependency: ${name}`);
    assets.add(name);
    for (const css of file.viteMetadata?.importedCss ?? []) assets.add(css);
    for (const dependency of file.imports ?? []) visit(dependency);
  };
  for (const [name, file] of Object.entries(bundle)) {
    if (file.type === 'chunk' && (file.isEntry || file.facadeModuleId?.endsWith('/screens/SectionsScreen.tsx'))) visit(name);
  }
  return assets;
}
