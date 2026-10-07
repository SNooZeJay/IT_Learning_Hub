import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/coverage/**',
      // Vendored skill scripts. `.agents/skills/impeccable/scripts/` ships
      // prebuilt, minified JavaScript that we neither author nor ship. Linting
      // it produced 94 findings on code that is never edited here, which would
      // make the lint gate meaningless: a green run has to mean "our code is
      // clean", and that signal is destroyed by a permanently red third-party
      // bundle. The skill's markdown references and launcher stay linted.
      '.agents/skills/*/scripts/**/*.{js,cjs,mjs}',
      // Built engine binary, also ignored by git for the same reason.
      '.agents/skills/*/scripts/bin/**',
      // The same skill, installed under the other two agent directories. Its scripts
      // are the identical vendored bundle, so they are ignored for the identical reason:
      // linting them produces ~95 findings on third-party code and destroys the signal
      // the lint gate is supposed to carry.
      '.claude/skills/*/scripts/**/*.{js,cjs,mjs}',
      '.claude/skills/*/scripts/bin/**',
      '.opencode/skills/*/scripts/**/*.{js,cjs,mjs}',
      '.opencode/skills/*/scripts/bin/**',
    ],
  },

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
)
