import { describe, expect, it } from 'vitest';
import { extractPhpUsages } from '../../src/extractors/php.js';

const run = async (source: string) =>
  (await extractPhpUsages(source, 'app/X.php')).map((u) => ({
    key: u.key,
    line: u.line,
    column: u.column,
    dynamic: u.dynamic,
    ...(u.pattern === undefined ? {} : { pattern: u.pattern }),
  }));

describe('extractPhpUsages', () => {
  it('finds helper functions and the Lang facade', async () => {
    const usages = await run(`<?php
echo __('messages.welcome');
echo trans('auth.failed');
echo trans_choice('messages.apples', 3);
echo Lang::get('lang.get');
echo \\Lang::choice('lang.choice', 2);
echo \\Illuminate\\Support\\Facades\\Lang::get('lang.full');
echo \\trans('leading.slash');
echo __('Welcome back');
`);
    expect(usages.map((u) => [u.key, u.line, u.column])).toEqual([
      ['messages.welcome', 2, 9],
      ['auth.failed', 3, 12],
      ['messages.apples', 4, 19],
      ['lang.get', 5, 16],
      ['lang.choice', 6, 20],
      ['lang.full', 7, 44],
      ['leading.slash', 8, 13],
      ['Welcome back', 9, 9],
    ]);
    expect(usages.every((u) => !u.dynamic)).toBe(true);
  });

  it('ignores comments, lookalike functions, methods and other classes', async () => {
    const usages = await run(`<?php
// __('commented.line')
/* trans('commented.block') */
# __('commented.hash')
$a = "__('inside.string')";
$b = format('not.a.call');
$c = $this->trans('method.call');
$d = $translator->__('method.underscore');
$e = Other::get('other.class');
$f = Lang::has('lang.has');
$g = my__('prefixed');
$h = strans('prefixed');
function __construct() {}
$i = ['__' => 'array key', 'trans' => 'x'];
`);
    expect(usages).toEqual([]);
  });

  it('evaluates concatenation and escapes in the key', async () => {
    const usages = await run(`<?php __('a.' . 'b'); __("tab\\tkey"); __('it\\'s');`);
    expect(usages.map((u) => u.key)).toEqual(['a.b', 'tab\tkey', "it's"]);
  });

  it('marks interpolation, concatenation with variables and variables as dynamic', async () => {
    const usages = await run(`<?php
__("roles.$role");
__('status.' . $status . '.label');
__("x.{$y}.z");
__($key);
__(config('k'));
__(...$args);
__('a' . 'b' . $c);
`);
    expect(usages).toEqual([
      { key: 'roles.*', line: 2, column: 4, dynamic: true, pattern: 'roles.*' },
      { key: 'status.*.label', line: 3, column: 4, dynamic: true, pattern: 'status.*.label' },
      { key: 'x.*.z', line: 4, column: 4, dynamic: true, pattern: 'x.*.z' },
      { key: '', line: 5, column: 4, dynamic: true },
      { key: '', line: 6, column: 4, dynamic: true },
      { key: '', line: 7, column: 4, dynamic: true },
      { key: 'ab*', line: 8, column: 4, dynamic: true, pattern: 'ab*' },
    ]);
  });

  it('ignores calls without arguments and reads named key arguments', async () => {
    const usages = await run(
      `<?php __(); __(key: 'named.key'); __(replace: [], key: 'later.key'); __(other: 'x');`,
    );
    expect(usages.map((u) => u.key)).toEqual(['named.key', 'later.key']);
  });

  it('finds calls nested in arrays, closures and method arguments', async () => {
    const usages = await run(`<?php
return [
    'title' => __('nested.title'),
    'fn' => function () { return trans('nested.closure'); },
];
$this->validate($r, ['name' => 'required'], ['name.required' => __('validation.custom')]);
`);
    expect(usages.map((u) => u.key)).toEqual([
      'nested.title',
      'nested.closure',
      'validation.custom',
    ]);
  });

  it('reports columns in UTF-16 units after multi-byte characters', async () => {
    const usages = await run(`<?php $x = 'नमस्ते'; echo __('after.unicode');`);
    expect(usages[0]).toMatchObject({ key: 'after.unicode', line: 1, column: 30 });
  });

  it('handles HTML around PHP and short echo tags', async () => {
    const usages = await run(`<h1><?= __('html.title') ?></h1>
<?php if (true): ?>
  <p><?php echo trans('html.body'); ?></p>
<?php endif; ?>`);
    expect(usages.map((u) => [u.key, u.line])).toEqual([
      ['html.title', 1],
      ['html.body', 3],
    ]);
  });
});
