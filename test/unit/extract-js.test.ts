import { describe, expect, it } from 'vitest';
import { extractJsUsages } from '../../src/extractors/javascript.js';

const options = { functions: ['t', '$t', 'i18n.t', 'i18next.t'], namespaceSeparator: ':' };

const run = async (source: string, file = 'src/App.tsx', functions = options.functions) =>
  (await extractJsUsages(source, file, { ...options, functions })).map((u) => ({
    key: u.key,
    line: u.line,
    dynamic: u.dynamic,
    ...(u.pattern === undefined ? {} : { pattern: u.pattern }),
  }));

const keys = async (source: string, file?: string) => (await run(source, file)).map((u) => u.key);

describe('extractJsUsages: calls', () => {
  it('finds configured functions with string and plain template literals', async () => {
    expect(
      await keys(`
t('a.single'); t("a.double"); t(\`a.template\`); $t('a.dollar');
i18n.t('a.i18n'); i18next.t('a.i18next'); i18n?.t('a.optional'); i18n . t ('a.spaced');
`),
    ).toEqual([
      'a.single',
      'a.double',
      'a.template',
      'a.dollar',
      'a.i18n',
      'a.i18next',
      'a.optional',
      'a.spaced',
    ]);
  });

  it('records line numbers of the key argument', async () => {
    const usages = await run(`const a = 1;\n\nconst b = t(\n  'multi.line'\n);\n`);
    expect(usages).toEqual([{ key: 'multi.line', line: 4, dynamic: false }]);
  });

  it('decodes escapes in keys', async () => {
    expect(
      await keys(`t('a\\'b'); t("tab\\tkey"); t('\\u0041\\x42\\u{43}'); t('line\\\ncont');`),
    ).toEqual(["a'b", 'tab\tkey', 'ABC', 'linecont']);
  });

  it('never counts comments, strings, lookalikes, object keys or imports', async () => {
    expect(
      await keys(`
import { t as translate } from 'i18n-lib';
import t2 from './t';
// t('commented.line')
/* t('commented.block') */
const s = "t('inside.string')";
const tpl = \`t('inside.template')\`;
const obj = { t: 'object.value', 't2': 'x', [t]: 'y' };
format('format.call'); test('test.call'); tt('tt.call'); t2('t2.call'); translate('alias.call');
foo.t('member.other'); this.t('this.member'); t.call(null, 'call.method'); t;
const jsx = <div title="t('attr.string')">{/* t('jsx.comment') */}</div>;
`),
    ).toEqual([]);
  });

  it('supports custom function names', async () => {
    expect(
      (
        await run(`translate('custom.a'); t('not.listed'); this.$t('this.dollar');`, 'a.ts', [
          'translate',
          'this.$t',
        ])
      ).map((u) => u.key),
    ).toEqual(['custom.a', 'this.dollar']);
  });

  it('resolves concatenation and conditionals', async () => {
    expect(
      await keys(
        `t('a.' + 'b'); t(cond ? 'yes.key' : 'no.key'); t(('wrapped')); t('as.const' as const); t(key!);`,
        'a.ts',
      ),
    ).toEqual(['a.b', 'yes.key', 'no.key', 'wrapped', 'as.const', '']);
  });

  it('marks dynamic keys and derives patterns', async () => {
    expect(
      await run(`
t(\`status.\${s}\`);
t('prefix.' + kind);
t(\`a.\${b}.label\`);
t(key);
t(obj.key);
t(\`\${only}\`);
t(cond ? 'static.a' : dynamicKey);
t(...args);
t(a * b);
`),
    ).toEqual([
      { key: 'status.*', line: 2, dynamic: true, pattern: 'status.*' },
      { key: 'prefix.*', line: 3, dynamic: true, pattern: 'prefix.*' },
      { key: 'a.*.label', line: 4, dynamic: true, pattern: 'a.*.label' },
      { key: '', line: 5, dynamic: true },
      { key: '', line: 6, dynamic: true },
      { key: '', line: 7, dynamic: true },
      { key: 'static.a', line: 8, dynamic: false },
      { key: '', line: 8, dynamic: true },
      { key: '', line: 9, dynamic: true },
      { key: '', line: 10, dynamic: true },
    ]);
  });

  it('ignores calls without arguments', async () => {
    expect(await keys(`t(); const f = t;`)).toEqual([]);
  });

  it('selects the grammar by extension', async () => {
    expect(await keys(`const x = <T,>(a: T) => t('ts.generic');`, 'a.tsx')).toEqual(['ts.generic']);
    expect(await keys(`const x = <string>t('ts.assert');`, 'a.ts')).toEqual(['ts.assert']);
    expect(await keys(`export default () => <p>{t('js.jsx')}</p>;`, 'a.jsx')).toEqual(['js.jsx']);
    expect(await keys(`t('mjs');`, 'a.mjs')).toEqual(['mjs']);
    expect(await keys(`const a = (x: number): string => t('mts');`, 'a.mts')).toEqual(['mts']);
  });
});

describe('extractJsUsages: namespaces', () => {
  it('applies useTranslation namespace to t calls in the same function', async () => {
    expect(
      await keys(`
function A() {
  const { t } = useTranslation('common');
  return t('save') + t('other:explicit') + t('nested.key');
}
function B() {
  const { t } = useTranslation();
  return t('no.namespace');
}
`),
    ).toEqual(['common:save', 'other:explicit', 'common:nested.key', 'no.namespace']);
  });

  it('applies the namespace to callbacks nested in the component', async () => {
    expect(
      await keys(`
const Page = () => {
  const { t } = useTranslation(['dash', 'common']);
  const items = list.map((i) => t('item.label'));
  function helper() { return t('helper'); }
  return items;
};
const Outside = () => t('outside');
`),
    ).toEqual(['dash:item.label', 'dash:helper', 'outside']);
  });

  it('supports aliases and array destructuring from useTranslation', async () => {
    expect(
      await keys(`
function A() {
  const { t: translate } = useTranslation('aliased');
  return translate('key') + t('plain');
}
function B() {
  const [tr] = useTranslation('arr');
  return tr('key');
}
function C() {
  const { t } = useTranslation('one');
  return t('x');
}
`),
    ).toEqual(['aliased:key', 'plain', 'arr:key', 'one:x']);
  });

  it('uses the ns option and does not apply scope namespaces to member calls', async () => {
    expect(
      await keys(`
function A() {
  const { t } = useTranslation('scope');
  return [
    t('k', { ns: 'other' }),
    t('k', { ns: ['first', 'second'], count: 1 }),
    t('k', { 'ns': 'quoted' }),
    t('k', { count: 3 }),
    t('k', opts),
    t('k', { ns: dynamicNs }),
    i18n.t('member'),
  ];
}
`),
    ).toEqual(['other:k', 'first:k', 'quoted:k', 'scope:k', 'scope:k', 'scope:k', 'member']);
  });

  it('honours the namespace separator and prefixes patterns', async () => {
    const usages = await extractJsUsages(
      `function A() { const { t } = useTranslation('ns'); return [t('a'), t('b|c'), t(\`dyn.\${x}\`), t(\`\${x}.tail\`)]; }`,
      'a.ts',
      { functions: ['t'], namespaceSeparator: '|' },
    );
    expect(usages.map((u) => u.key)).toEqual(['ns|a', 'b|c', 'ns|dyn.*', '*.tail']);
  });

  it('ignores a dynamic useTranslation argument', async () => {
    expect(await keys(`function A() { const { t } = useTranslation(ns); return t('x'); }`)).toEqual(
      ['x'],
    );
  });
});

describe('extractJsUsages: Trans component', () => {
  it('reads i18nKey from string and expression attributes', async () => {
    expect(
      await keys(`
const a = <Trans i18nKey="trans.string" />;
const b = <Trans i18nKey={'trans.expr'}>hello</Trans>;
const c = <Trans i18nKey={\`trans.template\`} ns="nsattr" />;
const d = <Trans i18nKey="inline:ns" />;
const e = <Trans i18nKey="withNsExpr" ns={'other'} />;
`),
    ).toEqual([
      'trans.string',
      'trans.expr',
      'nsattr:trans.template',
      'inline:ns',
      'other:withNsExpr',
    ]);
  });

  it('uses the enclosing useTranslation namespace and reports dynamic keys', async () => {
    expect(
      await run(`
function A() {
  useTranslation('page');
  return <><Trans i18nKey="inside" /><Trans i18nKey={dynamicKey} /><Trans i18nKey={\`row.\${n}\`} /></>;
}
`),
    ).toEqual([
      { key: 'page:inside', line: 4, dynamic: false },
      { key: '', line: 4, dynamic: true },
      { key: 'page:row.*', line: 4, dynamic: true, pattern: 'page:row.*' },
    ]);
  });

  it('ignores Trans without i18nKey and other components', async () => {
    expect(
      await keys(
        `const a = <Trans>just children</Trans>; const b = <Other i18nKey="no" />; const c = <Trans i18nKey />;`,
      ),
    ).toEqual([]);
  });
});
