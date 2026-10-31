import { describe, expect, it } from 'vitest';
import { extractBladeUsages } from '../../src/extractors/blade.js';

const run = async (source: string) =>
  (await extractBladeUsages(source, 'resources/views/x.blade.php')).map((u) => ({
    key: u.key,
    line: u.line,
    column: u.column,
    ...(u.dynamic ? { dynamic: true } : {}),
    ...(u.pattern === undefined ? {} : { pattern: u.pattern }),
  }));

const keys = async (source: string) => (await run(source)).map((u) => u.key);

describe('extractBladeUsages', () => {
  it('finds echo statements, raw echoes and directives with correct positions', async () => {
    const usages = await run(`<h1>{{ __('blade.echo') }}</h1>
<p>{!! __('blade.raw') !!}</p>
@lang('blade.lang')
@choice('blade.choice', 3)
<span>{{{ __('blade.triple') }}}</span>
`);
    expect(usages).toEqual([
      { key: 'blade.echo', line: 1, column: 11 },
      { key: 'blade.raw', line: 2, column: 11 },
      { key: 'blade.lang', line: 3, column: 7 },
      { key: 'blade.choice', line: 4, column: 9 },
      { key: 'blade.triple', line: 5, column: 14 },
    ]);
  });

  it('maps line offsets correctly after multi-line constructs and unicode text', async () => {
    const usages = await run(`<p>नमस्ते {{ __('first') }}</p>
@php
    $label = __('in.php.block');
@endphp
{{
    __('multi.line.echo')
}}
@if (
    __('in.directive') === 'x'
)
@endif
<?php echo trans('in.php.tag'); ?>
<?= __('short.echo') ?>
`);
    expect(usages.map((u) => [u.key, u.line, u.column])).toEqual([
      ['first', 1, 17],
      ['in.php.block', 3, 17],
      ['multi.line.echo', 6, 8],
      ['in.directive', 9, 8],
      ['in.php.tag', 12, 18],
      ['short.echo', 13, 8],
    ]);
  });

  it('supports @php(...) inline statements and directive expressions', async () => {
    expect(
      await keys(`@php($title = __('inline.php'))
@include('partials.header', ['title' => __('include.title')])
@foreach ($items as $item) {{ __('in.loop') }} @endforeach
@if (trans('if.cond') === 'x') @endif
@unless(Lang::get('unless.cond')) @endunless
`),
    ).toEqual(['inline.php', 'include.title', 'in.loop', 'if.cond', 'unless.cond']);
  });

  it('reads bound component attributes', async () => {
    expect(
      await keys(`<x-button :label="__('component.label')" class="a" :title='trans("component.title")' />
<x-alert type="info" :message="__('multi.attr')" :count="$n => 1">{{ __('slot.text') }}</x-alert>
<livewire:search :placeholder="__('livewire.placeholder')" />
<x-plain label="__('not.bound')" />
`),
    ).toEqual([
      'component.label',
      'component.title',
      'multi.attr',
      'slot.text',
      'livewire.placeholder',
    ]);
  });

  it('ignores Blade comments, verbatim blocks, escaped output and escaped directives', async () => {
    expect(
      await keys(`{{-- __('comment.only') --}}
{{--
   @lang('multi.comment')
--}}
@verbatim
  {{ __('verbatim.echo') }}
  @lang('verbatim.directive')
@endverbatim
@{{ __('escaped.echo') }}
@@lang('escaped.directive')
<a href="mailto:me@lang.com">me@lang.com</a>
{{ __('kept.after') }}
`),
    ).toEqual(['kept.after']);
  });

  it('keeps string delimiters safe: braces and quotes inside echoes', async () => {
    expect(
      await keys(`{{ __('has }} braces') }} {{ __("it's {{ ok }}") }} {{ __('after') }}`),
    ).toEqual(['has }} braces', "it's {{ ok }}", 'after']);
  });

  it('reports dynamic keys and patterns', async () => {
    expect(await run(`{{ __('status.' . $status) }} @lang($key)`)).toEqual([
      { key: 'status.*', line: 1, column: 7, dynamic: true, pattern: 'status.*' },
      { key: '', line: 1, column: 37, dynamic: true },
    ]);
  });

  it('survives malformed templates without throwing', async () => {
    expect(await keys(`{{ __('unclosed') `)).toEqual([]);
    expect(await keys(`{!! __('unclosed') `)).toEqual([]);
    expect(await keys(`@lang('unclosed`)).toEqual([]);
    expect(await keys(`@if (broken`)).toEqual([]);
    expect(await keys(`@php __('no.endphp')`)).toEqual(['no.endphp']);
    expect(await keys(`<?php echo __('no.close');`)).toEqual(['no.close']);
    expect(await keys(`<x-a :b="__('unclosed.tag')`)).toEqual([]);
    expect(await keys(`@ alone, @ 1 and email@host and {{{ __('x') }}`)).toEqual([]);
  });

  it('skips fragments that cannot contain translation calls', async () => {
    expect(await keys(`{{ $user->name }} @if($a) @endif @media (min-width: 1px) { }`)).toEqual([]);
  });
});
