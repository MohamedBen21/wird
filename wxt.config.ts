import { defineConfig } from 'wxt';

// A fixed ID is required by Firefox for storage.sync and for AMO submissions. AMO never frees an ID once
// an add-on using it was created (even if deleted), so keep this value once you publish.
const GECKO_ID = '{3d2d7b2e-11e0-49de-a867-2f88c7bc38f3}';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Everything needed day to day. Access to web pages is NOT requested at install time:
    //  - the reader uses `activeTab` (granted when the user clicks the button or uses the shortcut),
    //  - on-page reminders use an optional "all sites" permission the user can grant in settings.
    permissions: ['storage', 'alarms', 'scripting', 'activeTab'],
    optional_permissions: ['notifications'],
    optional_host_permissions: ['<all_urls>'],
    commands: {
      'open-reader': {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: '__MSG_cmdOpenReader__',
      },
    },
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['<all_urls>'] }],
    action: { default_title: '__MSG_extName__' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              // 140 is the first release that understands data_collection_permissions.
              strict_min_version: '140.0',
              // Required by AMO: Wird collects and transmits nothing.
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
  hooks: {
    // Runtime-injected content scripts must not add install-time host permissions.
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  zip: { name: 'wird', excludeSources: ['docs/**'] },
});
