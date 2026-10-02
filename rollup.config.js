import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import copy from 'rollup-plugin-copy';

// Inline .css imports as strings so the view can inject React Flow's styles at runtime.
const cssAsString = () => ({
  name: 'css-as-string',
  transform(code, id) {
    if (!id.endsWith('.css')) return null;
    return { code: `export default ${JSON.stringify(code)};`, map: { mappings: '' } };
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
  external: ['obsidian'],
  plugins: [
    cssAsString(),
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
