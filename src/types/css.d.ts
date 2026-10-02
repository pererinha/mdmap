// The rollup build inlines .css imports as strings; views inject them at runtime.
declare module '*.css' {
    const css: string;
    export default css;
}
