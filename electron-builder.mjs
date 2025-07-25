import pkg from './package.json' with {type: 'json'};
import mapWorkspaces from '@npmcli/map-workspaces';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export default /** @type import('electron-builder').Configuration */
({
  directories: {
    output: 'dist',
    buildResources: 'buildResources',
  },
  generateUpdatesFilesForAllChannels: true,
  linux: {
    target: ['deb'],
  },
  /**
   * It is recommended to avoid using non-standard characters such as spaces in artifact names,
   * as they can unpredictably change during deployment, making them impossible to locate and download for update.
   */
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  files: [
    'LICENSE*',
    pkg.main,
    '!node_modules/@app/**',
    ...await getListOfFilesFromEachWorkspace(),
    'node_modules/@bufbuild/protobuf/**/*',
    'node_modules/@effect/cluster/**/*',
    'node_modules/@effect/experimental/**/*',
    'node_modules/@effect/rpc/**/*',
    'node_modules/@effect/sql/**/*',
    'node_modules/@effect/workflow/**/*',
    'node_modules/@electron/get/**/*',
    'node_modules/@jridgewell/sourcemap-codec/**/*',
    'node_modules/@sindresorhus/is/**/*',
    'node_modules/@szmarczak/http-timer/**/*',
    'node_modules/@types/cacheable-request/**/*',
    'node_modules/@types/deep-eql/**/*',
    'node_modules/@types/estree/**/*',
    'node_modules/@types/http-cache-semantics/**/*',
    'node_modules/@types/keyv/**/*',
    'node_modules/@types/ms/**/*',
    'node_modules/@types/responselike/**/*',
    'node_modules/@types/yauzl/**/*',
    'node_modules/@vue/reactivity/**/*',
    'node_modules/@vue/runtime-core/**/*',
    'node_modules/@vue/runtime-dom/**/*',
    'node_modules/@vue/server-renderer/**/*',
    'node_modules/@vue/shared/**/*',
    'node_modules/assertion-error/**/*',
    'node_modules/bignumber.js/**/*',
    'node_modules/boolean/**/*',
    'node_modules/buffer-builder/**/*',
    'node_modules/buffer-crc32/**/*',
    'node_modules/cac/**/*',
    'node_modules/cacheable-lookup/**/*',
    'node_modules/cacheable-request/**/*',
    'node_modules/chai/**/*',
    'node_modules/check-error/**/*',
    'node_modules/clone/**/*',
    'node_modules/clone-response/**/*',
    'node_modules/colorjs.io/**/*',
    'node_modules/csstype/**/*',
    'node_modules/decompress-response/**/*',
    'node_modules/deep-eql/**/*',
    'node_modules/defer-to-connect/**/*',
    'node_modules/define-data-property/**/*',
    'node_modules/define-properties/**/*',
    'node_modules/detect-node/**/*',
    'node_modules/encoding/**/*',
    'node_modules/end-of-stream/**/*',
    'node_modules/engine.io/**/*',
    'node_modules/engine.io-client/**/*',
    'node_modules/engine.io-parser/**/*',
    'node_modules/entities/**/*',
    'node_modules/es-module-lexer/**/*',
    'node_modules/es6-error/**/*',
    'node_modules/esbuild/**/*',
    'node_modules/escape-string-regexp/**/*',
    'node_modules/estree-walker/**/*',
    'node_modules/expect-type/**/*',
    'node_modules/extract-zip/**/*',
    'node_modules/fd-slicer/**/*',
    'node_modules/fdir/**/*',
    'node_modules/get-stream/**/*',
    'node_modules/global-agent/**/*',
    'node_modules/globalthis/**/*',
    'node_modules/got/**/*',
    'node_modules/graphql/**/*',
    'node_modules/graphql-ws/**/*',
    'node_modules/has-flag/**/*',
    'node_modules/has-property-descriptors/**/*',
    'node_modules/http-cache-semantics/**/*',
    'node_modules/http2-wrapper/**/*',
    'node_modules/immutable/**/*',
    'node_modules/ipaddr.js/**/*',
    'node_modules/js-tokens/**/*',
    'node_modules/json-buffer/**/*',
    'node_modules/keyv/**/*',
    'node_modules/linkify-it/**/*',
    'node_modules/lodash.escaperegexp/**/*',
    'node_modules/lodash.isequal/**/*',
    'node_modules/loupe/**/*',
    'node_modules/lowercase-keys/**/*',
    'node_modules/magic-string/**/*',
    'node_modules/markdown-it/**/*',
    'node_modules/markdown-it-container/**/*',
    'node_modules/markdown-it-imsize/**/*',
    'node_modules/markdown-it-toc-and-anchor/**/*',
    'node_modules/matcher/**/*',
    'node_modules/mdurl/**/*',
    'node_modules/mimic-response/**/*',
    'node_modules/nanoid/**/*',
    'node_modules/normalize-url/**/*',
    'node_modules/object-keys/**/*',
    'node_modules/p-cancelable/**/*',
    'node_modules/pathe/**/*',
    'node_modules/pathval/**/*',
    'node_modules/pend/**/*',
    'node_modules/picocolors/**/*',
    'node_modules/postcss/**/*',
    'node_modules/prismjs/**/*',
    'node_modules/progress/**/*',
    'node_modules/pump/**/*',
    'node_modules/quick-lru/**/*',
    'node_modules/resolve-alpn/**/*',
    'node_modules/responselike/**/*',
    'node_modules/roarr/**/*',
    'node_modules/rollup/**/*',
    'node_modules/rxjs/**/*',
    'node_modules/sass-embedded/**/*',
    'node_modules/semver-compare/**/*',
    'node_modules/serialize-error/**/*',
    'node_modules/siginfo/**/*',
    'node_modules/socket.io/**/*',
    'node_modules/socket.io-adapter/**/*',
    'node_modules/socket.io-client/**/*',
    'node_modules/socket.io-parser/**/*',
    'node_modules/sprintf-js/**/*',
    'node_modules/stackback/**/*',
    'node_modules/std-env/**/*',
    'node_modules/strip-literal/**/*',
    'node_modules/sumchecker/**/*',
    'node_modules/supports-color/**/*',
    'node_modules/sync-child-process/**/*',
    'node_modules/sync-message-port/**/*',
    'node_modules/tinybench/**/*',
    'node_modules/tinyexec/**/*',
    'node_modules/tinyglobby/**/*',
    'node_modules/tinypool/**/*',
    'node_modules/tinyrainbow/**/*',
    'node_modules/tinyspy/**/*',
    'node_modules/tslib/**/*',
    'node_modules/typescript/**/*',
    'node_modules/uc.micro/**/*',
    'node_modules/unorm/**/*',
    'node_modules/uslug/**/*',
    'node_modules/varint/**/*',
    'node_modules/vite/**/*',
    'node_modules/vite-node/**/*',
    'node_modules/why-is-node-running/**/*',
    'node_modules/yauzl/**/*',
  ],
  asarUnpack: [
    'node_modules/@bufbuild/protobuf/**',
    'node_modules/@effect/cluster/**',
    'node_modules/@effect/experimental/**',
    'node_modules/@effect/rpc/**',
    'node_modules/@effect/sql/**',
    'node_modules/@effect/workflow/**',
    'node_modules/@electron/get/**',
    'node_modules/@jridgewell/sourcemap-codec/**',
    'node_modules/@sindresorhus/is/**',
    'node_modules/@szmarczak/http-timer/**',
    'node_modules/@types/cacheable-request/**',
    'node_modules/@types/deep-eql/**',
    'node_modules/@types/estree/**',
    'node_modules/@types/http-cache-semantics/**',
    'node_modules/@types/keyv/**',
    'node_modules/@types/ms/**',
    'node_modules/@types/responselike/**',
    'node_modules/@types/yauzl/**',
    'node_modules/@vue/reactivity/**',
    'node_modules/@vue/runtime-core/**',
    'node_modules/@vue/runtime-dom/**',
    'node_modules/@vue/server-renderer/**',
    'node_modules/@vue/shared/**',
    'node_modules/assertion-error/**',
    'node_modules/bignumber.js/**',
    'node_modules/boolean/**',
    'node_modules/buffer-builder/**',
    'node_modules/buffer-crc32/**',
    'node_modules/cac/**',
    'node_modules/cacheable-lookup/**',
    'node_modules/cacheable-request/**',
    'node_modules/chai/**',
    'node_modules/check-error/**',
    'node_modules/clone/**',
    'node_modules/clone-response/**',
    'node_modules/colorjs.io/**',
    'node_modules/csstype/**',
    'node_modules/decompress-response/**',
    'node_modules/deep-eql/**',
    'node_modules/defer-to-connect/**',
    'node_modules/define-data-property/**',
    'node_modules/define-properties/**',
    'node_modules/detect-node/**',
    'node_modules/encoding/**',
    'node_modules/end-of-stream/**',
    'node_modules/engine.io/**',
    'node_modules/engine.io-client/**',
    'node_modules/engine.io-parser/**',
    'node_modules/entities/**',
    'node_modules/es-module-lexer/**',
    'node_modules/es6-error/**',
    'node_modules/esbuild/**',
    'node_modules/escape-string-regexp/**',
    'node_modules/estree-walker/**',
    'node_modules/expect-type/**',
    'node_modules/extract-zip/**',
    'node_modules/fd-slicer/**',
    'node_modules/fdir/**',
    'node_modules/get-stream/**',
    'node_modules/global-agent/**',
    'node_modules/globalthis/**',
    'node_modules/got/**',
    'node_modules/graphql/**',
    'node_modules/graphql-ws/**',
    'node_modules/has-flag/**',
    'node_modules/has-property-descriptors/**',
    'node_modules/http-cache-semantics/**',
    'node_modules/http2-wrapper/**',
    'node_modules/immutable/**',
    'node_modules/ipaddr.js/**',
    'node_modules/js-tokens/**',
    'node_modules/json-buffer/**',
    'node_modules/keyv/**',
    'node_modules/linkify-it/**',
    'node_modules/lodash.escaperegexp/**',
    'node_modules/lodash.isequal/**',
    'node_modules/loupe/**',
    'node_modules/lowercase-keys/**',
    'node_modules/magic-string/**',
    'node_modules/markdown-it/**',
    'node_modules/markdown-it-container/**',
    'node_modules/markdown-it-imsize/**',
    'node_modules/markdown-it-toc-and-anchor/**',
    'node_modules/matcher/**',
    'node_modules/mdurl/**',
    'node_modules/mimic-response/**',
    'node_modules/nanoid/**',
    'node_modules/normalize-url/**',
    'node_modules/object-keys/**',
    'node_modules/p-cancelable/**',
    'node_modules/pathe/**',
    'node_modules/pathval/**',
    'node_modules/pend/**',
    'node_modules/picocolors/**',
    'node_modules/postcss/**',
    'node_modules/prismjs/**',
    'node_modules/progress/**',
    'node_modules/pump/**',
    'node_modules/quick-lru/**',
    'node_modules/resolve-alpn/**',
    'node_modules/responselike/**',
    'node_modules/roarr/**',
    'node_modules/rollup/**',
    'node_modules/rxjs/**',
    'node_modules/sass-embedded/**',
    'node_modules/semver-compare/**',
    'node_modules/serialize-error/**',
    'node_modules/siginfo/**',
    'node_modules/socket.io/**',
    'node_modules/socket.io-adapter/**',
    'node_modules/socket.io-client/**',
    'node_modules/socket.io-parser/**',
    'node_modules/sprintf-js/**',
    'node_modules/stackback/**',
    'node_modules/std-env/**',
    'node_modules/strip-literal/**',
    'node_modules/sumchecker/**',
    'node_modules/supports-color/**',
    'node_modules/sync-child-process/**',
    'node_modules/sync-message-port/**',
    'node_modules/tinybench/**',
    'node_modules/tinyexec/**',
    'node_modules/tinyglobby/**',
    'node_modules/tinypool/**',
    'node_modules/tinyrainbow/**',
    'node_modules/tinyspy/**',
    'node_modules/tslib/**',
    'node_modules/typescript/**',
    'node_modules/uc.micro/**',
    'node_modules/unorm/**',
    'node_modules/uslug/**',
    'node_modules/varint/**',
    'node_modules/vite/**',
    'node_modules/vite-node/**',
    'node_modules/why-is-node-running/**',
    'node_modules/yauzl/**',
  ],
});

/**
 * By default, electron-builder copies each package into the output compilation entirety,
 * including the source code, tests, configuration, assets, and any other files.
 *
 * So you may get compiled app structure like this:
 * ```
 * app/
 * ├── node_modules/
 * │   └── workspace-packages/
 * │       ├── package-a/
 * │       │   ├── src/            # Garbage. May be safely removed
 * │       │   ├── dist/
 * │       │   │   └── index.js    # Runtime code
 * │       │   ├── vite.config.js  # Garbage
 * │       │   ├── .env            # some sensitive config
 * │       │   └── package.json
 * │       ├── package-b/
 * │       ├── package-c/
 * │       └── package-d/
 * ├── packages/
 * │   └── entry-point.js
 * └── package.json
 * ```
 *
 * To prevent this, we read the “files”
 * property from each package's package.json
 * and add all files that do not match the patterns to the exclusion list.
 *
 * This way,
 * each package independently determines which files will be included in the final compilation and which will not.
 *
 * So if `package-a` in its `package.json` describes
 * ```json
 * {
 *   "name": "package-a",
 *   "files": [
 *     "dist/**\/"
 *   ]
 * }
 * ```
 *
 * Then in the compilation only those files and `package.json` will be included:
 * ```
 * app/
 * ├── node_modules/
 * │   └── workspace-packages/
 * │       ├── package-a/
 * │       │   ├── dist/
 * │       │   │   └── index.js    # Runtime code
 * │       │   └── package.json
 * │       ├── package-b/
 * │       ├── package-c/
 * │       └── package-d/
 * ├── packages/
 * │   └── entry-point.js
 * └── package.json
 * ```
 */
async function getListOfFilesFromEachWorkspace() {

  /**
   * @type {Map<string, string>}
   */
  const workspaces = await mapWorkspaces({
    cwd: process.cwd(),
    pkg,
  });

  const allFilesToInclude = [];

  for (const [name, path] of workspaces) {
    const pkgPath = join(path, 'package.json');
    const {default: workspacePkg} = await import(pathToFileURL(pkgPath), {with: {type: 'json'}});

    let patterns = workspacePkg.files || ['dist/**', 'package.json'];

    patterns = patterns.map(p => join('node_modules', name, p));
    allFilesToInclude.push(...patterns);
  }

  return allFilesToInclude;
}
