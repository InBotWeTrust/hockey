import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
const root = path.resolve('src');
function eagerModules(entry: string): Set<string> {
  const visited = new Set<string>();
  const walk = (file: string): void => {
    if (visited.has(file)) return; visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) continue;
      if (ts.isExportDeclaration(node) && node.isTypeOnly) continue;
      if (ts.isImportDeclaration(node) && !node.importClause?.name && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.every(item => item.isTypeOnly)) continue;
      const spec = node.moduleSpecifier.text;
      if (!spec.startsWith('.') || spec.endsWith('.css')) continue;
      const base = path.resolve(path.dirname(file), spec.replace(/\.js$/, ''));
      const target = ['.ts','.tsx'].map(extension => base+extension).find(existsSync);
      if (target) walk(target);
    }
  };
  walk(path.join(root,entry)); return visited;
}
it('keeps the required-onboarding gate independent of the game renderer', () => {
  expect([...eagerModules('onboarding/OnboardingGate.tsx')].filter(file => file.endsWith('/game/PlayView.tsx'))).toEqual([]);
});
it('keeps the common game menu independent of the full game screen and renderer', () => {
  const modules = [...eagerModules('city/GameHub.tsx')];
  expect(modules.filter(file => /\/(DailyScreen|PlayView)\.tsx$/.test(file))).toEqual([]);
});
