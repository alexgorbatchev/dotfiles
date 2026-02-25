import { $, type TemplateExpr } from 'dax-sh';

/**
 * Tagged template wrapper around dax-sh's `$` that logs the command before executing it.
 */
export function shell(strings: TemplateStringsArray, ...exprs: TemplateExpr[]) {
  let command = '';

  for (let i = 0; i < strings.length; i++) {
    command += strings[i];

    if (i < exprs.length) {
      command += String(exprs[i]);
    }
  }

  console.log(`$ ${command.replace(/\s+/g, ' ').trim()}`);
  return $(strings, ...exprs);
}
