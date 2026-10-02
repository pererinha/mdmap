import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import copy from 'rollup-plugin-copy';
import { readFileSync } from 'fs';

// Obsidian loads styles.css itself and plugins may not add <style> elements, so the build writes the
// plugin's styles and React Flow's into it. React Flow's come last, as when the view injected them.
const stylesheet = () => ({
  name: 'stylesheet',
  generateBundle() {
    const reactFlow = readFileSync('node_modules/@xyflow/react/dist/style.css', 'utf8');
    const source = `${readFileSync('src/styles.css', 'utf8')}\n/* @xyflow/react styles, MIT license: see THIRD_PARTY_LICENSES.md */\n${reactFlow}`;
    this.emitFile({ type: 'asset', fileName: 'styles.css', source });
  },
});

// MDMAP_VAULT=/path/to/vault copies the build into that vault's plugin folder.
const vault = process.env.MDMAP_VAULT;

export default {
  input: 'src/main.ts',
  output: {
    file: 'main.js',
    format: 'cjs',
    exports: 'default',
    banner: '/* mdmap. Bundled third-party code and its licenses: THIRD_PARTY_LICENSES.md in the repository. */',
  },
  // Obsidian provides CodeMirror at runtime; the plugin must use its copy so editor extensions share the editor's state.
  external: ['obsidian', '@codemirror/state', '@codemirror/view'],
  plugins: [
    stylesheet(),
    // React and React Flow read process.env.NODE_ENV; Obsidian has no process.env.
    replace({ 'process.env.NODE_ENV': JSON.stringify('production'), preventAssignment: true }),
    typescript(),
    nodeResolve({ browser: true }),
    commonjs(),
    vault &&
      copy({
        targets: [{ src: ['main.js', 'manifest.json', 'styles.css'], dest: `${vault}/.obsidian/plugins/mdmap` }],
        hook: 'writeBundle',
      }),
  ],
};
