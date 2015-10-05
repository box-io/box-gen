const {Validator} = require('jsonschema')
const chai = require('chai')
const {expect} = chai

describe('bo', function() {

  it('should validate', () => {
    const v = new Validator
    const {box, configuration} = require('../schema')
    v.addSchema(configuration)
    const boxConfig = require('./fixtures/box.js')
    const val = v.validate(boxConfig, box)
    expect(val.errors).to.be.empty
  })

})
