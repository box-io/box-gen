exports.box = {

  id: '/box',
  type: 'object',
  properties: {
    root: {
      type: 'boolean',
    },
    configurations: {
      type: 'object',
      patternProperties: {
        '.*': {$ref: '/configuration'}
      }
    }
  }

}

exports.configuration = {

  id: '/configuration',
  type: 'object',
  properties: {
    includePaths: {type: 'array'},
    defs: {type: 'array'},
    includes: {type: 'array'},
    excludes: {type: 'array'},
    templates: {type: 'array'},
  }

}
