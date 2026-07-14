module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.monorepo.editor',
    ignore: (filePath) => {
      if (filePath === '') return false;
      if (filePath === '/package.json') return false;
      if (filePath.startsWith('/dist')) return false;
      if (filePath.startsWith('/dist-electron')) return false;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {},
    },
  ],
};
