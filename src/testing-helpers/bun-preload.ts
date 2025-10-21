/** biome-ignore-all lint/suspicious/noExplicitAny: for console overrides */
const env = process.env;

if (env['AGENT'] !== '1') {
  console.error('Use `AGENT=1 bun test ...`');
  process.exit(1);
}

env['NODE_ENV'] = 'test';
