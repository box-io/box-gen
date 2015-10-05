var babel = require('babel');

module.exports = function(wallaby) {
  return {
    debug: true,
    files: [
      {pattern: 'node_modules/babel/node_modules/babel-core/browser-polyfill.js', instrument: false},
      'src/**/*.js',
      {pattern: 'src/**/__tests__/*-test.js', ignore: true},
    ],
    tests: [
      'src/**/__tests__/*-test.js'
    ],
    compilers: {
      '**/*.js': wallaby.compilers.babel({
        babel: babel,
        stage: 0
      })
    },
    testFramework: 'mocha',
    env: {
      type: 'node',
    }
  }
}
