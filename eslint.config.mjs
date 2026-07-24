import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        // tools/ holds build-time Node scripts (not shipped visual code), so the visual security rules
        // (e.g. non-literal-fs-path) don't apply — they're meant for the runtime bundle.
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "tools/**"],
    },
];