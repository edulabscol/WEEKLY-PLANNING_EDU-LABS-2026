// Análisis estático del proyecto con la API del compilador de TypeScript.
// Se usa en lugar de ESLint porque el entorno de construcción no tenía acceso a npm (ver docs/TECHNICAL_DECISIONS.md, DT-08).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'tests', 'scripts'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const RULES = {
  'no-explicit-any': 'No use el tipo any; use unknown o un tipo concreto.',
  'no-console': 'No use console.* en código de aplicación; use el logger.',
  'no-alert': 'No use alert/confirm/prompt; use toasts o modales.',
  'no-debugger': 'Elimine las sentencias debugger.',
  'no-empty-catch': 'Bloque catch vacío: maneje el error o documente por qué se ignora.',
  'no-eval': 'No use eval ni new Function.',
  'no-dangerous-html': 'No use dangerouslySetInnerHTML ni innerHTML (riesgo de XSS).',
  'no-web-storage': 'No use localStorage/sessionStorage para datos del negocio; persista en el servidor.',
  'no-only': 'No deje pruebas con .only.',
  'no-skip': 'No deje pruebas omitidas (.skip / .todo).',
  'no-sql-concat': 'No concatene valores en SQL; use parámetros ($nombre).',
  'max-file-lines': 'Archivo demasiado grande (> 600 líneas); divídalo en módulos.',
};

const problems = [];
const report = (file, node, sf, rule) => {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  problems.push(`${path.relative(root, file)}:${line + 1}:${character + 1}  ${rule}  ${RULES[rule]}`);
};

const files = DIRS.flatMap((d) => walk(path.join(root, d)));
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const isApp = rel.startsWith('src/') && !rel.startsWith('src/server/cli/');
  const isTest = rel.startsWith('tests/');
  if (text.split('\n').length > 600) report(file, sf, sf, 'max-file-lines');

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) report(file, node, sf, 'no-explicit-any');
    if (node.kind === ts.SyntaxKind.DebuggerStatement) report(file, node, sf, 'no-debugger');
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const inner = text.slice(node.block.getStart(sf) + 1, node.block.getEnd() - 1);
      if (!/\/\/|\/\*/.test(inner)) report(file, node, sf, 'no-empty-catch');
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (isApp && /^console\.(log|debug|info|warn|error)$/.test(callee)) report(file, node, sf, 'no-console');
      if (/^(window\.)?(alert|confirm|prompt)$/.test(callee)) report(file, node, sf, 'no-alert');
      if (callee === 'eval') report(file, node, sf, 'no-eval');
      if (isTest && /^(it|test|describe)\.only$/.test(callee)) report(file, node, sf, 'no-only');
      if (isTest && /^(it|test|describe)\.(skip|todo)$/.test(callee)) report(file, node, sf, 'no-skip');
      if (/(db|raw)\.(prepare|run|get|all|exec)$/.test(callee) && node.arguments[0] && ts.isTemplateExpression(node.arguments[0])) {
        // Solo se permiten interpolaciones de fragmentos internos (columnas/marcadores), nunca valores.
        const tpl = node.arguments[0].getText(sf);
        if (/\$\{(?!sets\.join|names\.join|ASSIGNEE_SQL|WEEK_COLS|TASK_COLS|quoteIdent\(|opts\.includeDeleted|COLUMN|cols|sp\})/.test(tpl)) report(file, node, sf, 'no-sql-concat');
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText(sf) === 'Function') report(file, node, sf, 'no-eval');
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'dangerouslySetInnerHTML') report(file, node, sf, 'no-dangerous-html');
    if (ts.isPropertyAccessExpression(node) && ['innerHTML', 'outerHTML'].includes(node.name.text) && isApp) report(file, node, sf, 'no-dangerous-html');
    if (isApp && ts.isIdentifier(node) && ['localStorage', 'sessionStorage'].includes(node.text)) report(file, node, sf, 'no-web-storage');
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n✖ ${problems.length} problema(s) en ${files.length} archivos.`);
  process.exit(1);
}
console.log(`✔ Lint sin problemas (${files.length} archivos, ${Object.keys(RULES).length} reglas).`);
