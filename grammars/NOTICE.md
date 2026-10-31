# Grammar provenance

The WebAssembly grammars in this directory are copied unmodified from the
[`tree-sitter-wasms`](https://www.npmjs.com/package/tree-sitter-wasms) npm package, version 0.1.13
(`out/tree-sitter-javascript.wasm`, `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`,
`tree-sitter-php.wasm`). They are built from the upstream tree-sitter grammars:

| File                         | Upstream grammar                                                          | License |
| ---------------------------- | ------------------------------------------------------------------------- | ------- |
| `tree-sitter-javascript.wasm` | https://github.com/tree-sitter/tree-sitter-javascript                     | MIT     |
| `tree-sitter-typescript.wasm` | https://github.com/tree-sitter/tree-sitter-typescript (TypeScript)        | MIT     |
| `tree-sitter-tsx.wasm`        | https://github.com/tree-sitter/tree-sitter-typescript (TSX)               | MIT     |
| `tree-sitter-php.wasm`        | https://github.com/tree-sitter/tree-sitter-php (PHP with HTML text nodes) | MIT     |

The packaging repository's own notice is in `LICENSE-tree-sitter-wasms`. The upstream grammars are
distributed under the MIT License; each upstream repository contains its license text and
copyright notice.
