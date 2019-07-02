module.exports = {
  chainWebpack: (config) => {
    config.module
      .rule('shaders')
      .test(/\.glsl$/)
      .use('shader-loader')
      .loader('shader-loader');
  },
  lintOnSave: false,
  transpileDependencies: [
    'vtk.js',
  ],
};
