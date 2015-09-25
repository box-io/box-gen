//region Imports
const debug = require('debug')('eclipse-gen')
const path = require('path')
const {join} = path
const fs = require('fs')
const _ = require('lodash')
const prettyjson = require('prettyjson')
const prettydiff = require('prettydiff')
const cheerio = require('cheerio')
const mkdirp = require('mkdirp')
const jsondiffpatch = require('jsondiffpatch')
const log = console.log
const yargs = require('yargs')
//endregion

const pp = function() {
  return console.log(prettyjson.render.apply(prettyjson, arguments))
}

const prefix = 'ilg.gnuarmeclipse.managedbuild.cross.option'

class EclipseGenerator {

  constructor(filename) {
    this.filename = filename
    const original = fs.readFileSync(this.filename, 'utf8')
    const $ = this.$ = cheerio.load(original, {
      xmlMode: true,
      // NOTE: Needs to be false, otherwise `&quot;` strings in original file
      // are converted to `"`
      // causing attributes which are not modified to become something like
      // `<Foo foo="&quot;foo bar&quot;"/>` -> `<Foo foo=""foo bar""/>`.
      // See https://github.com/cheeriojs/cheerio/issues/496.
      decodeEntities: false,
    })
    this.$.prototype.getListOptionValuesAsArray = function(val) {
      return this.find('listOptionValue').map(function() {
        return $(this).attr('value')
      }).toArray()
    }
    this.$.getConfiguration = function(configuration) {
      return $(`configuration[name="${configuration}"]`)
    }
    this.$.getConfigurations = function() {
      return $('configuration').map(function() {
        return $(this).attr('name')
      }).toArray()
    }
  }

  getPaths(lang, key) {
    return this.$build.find(`[superClass='${prefix}.${lang}.${key}']`).getListOptionValuesAsArray()
  }

  setPaths(lang, key, items) {
    if (!items) return []
    const el = this.$build.find(`[superClass='${prefix}.${lang}.${key}']`)
    el.empty()
    const results = []
    for (let item of items) {
      const newEl = this.$('<listOptionValue/>').attr({
        builtIn: false,
        value: item
      })
      results.push(el.append(newEl).append('\n'))
    }
    return results
  }

  setExcludes(items) {
    if (!items) return []
    const excluding = items.join('|')
    return this.$("sourceEntries > entry").attr('excluding', excluding)
  }

  getPathsForConfig(configuration) {
    this.$build = this.$.getConfiguration(configuration)
    const includes = {
      assembler: this.getPaths('assembler', 'include.paths'),
      c: this.getPaths('c.compiler', 'include.paths'),
      cpp: this.getPaths('cpp.compiler', 'include.paths')
    }
    const defs = {
      assembler: this.getPaths('assembler', 'defs'),
      c: this.getPaths('c.compiler', 'defs'),
      cpp: this.getPaths('cpp.compiler', 'defs')
    }
    const excluding = this.$('sourceEntries > entry').attr('excluding')
    const excludes = excluding ? excluding.split('|') : null
    return {includes, defs, excludes}
  }

  printPaths(configuration) {
    this.$build = this.$.getConfiguration(configuration)
    const paths = this.getPathsForConfig(configuration)
    return pp(paths)
  }

  update(configuration, arg) {
    const {includePaths, excludes, defs} = arg
    this.$build = this.$.getConfiguration(configuration)
    this.setPaths('assembler', 'include.paths', includePaths)
    this.setPaths('c.compiler', 'include.paths', includePaths)
    this.setPaths('cpp.compiler', 'include.paths', includePaths)
    this.setPaths('assembler', 'defs', defs)
    this.setPaths('c.compiler', 'defs', defs)
    this.setPaths('cpp.compiler', 'defs', defs)
    return this.setExcludes(excludes)
  }

  diffXMLChangesAsJSON(configuration, newConfig) {
    let oldConfig = this.getPathsForConfig(configuration)
    oldConfig = {
      includePaths: oldConfig.includes.cpp,
      defs: oldConfig.defs.cpp,
      excludes: oldConfig.excludes
    }
    delete newConfig.templates
    delete newConfig.includes
    delete newConfig.optional
    console.log('------------------------')
    console.log(oldConfig, newConfig)
    console.log('------------------------')
    const delta = jsondiffpatch.diff(oldConfig, newConfig)
    console.log(`Diff for configuration: ${configuration}`)
    jsondiffpatch.console.log(delta)
  }

  // configurations - leave null to modify all.
  static performUpdate(file, boxConfig, opts = {}) {

    const eg = new EclipseGenerator(file)

    //
    // box.js module.exports schema looks like:
    //
    //     configurations.<all|Debug|Release>.<includePaths|defs|includes|excludes>
    //
    // TODO(vjpr): Only updates existing configurations at the moment.
    // Ideally it would create new configurations.
    //
    const configurations = opts.configurations || eg.$.getConfigurations()
    let settings = {}
    for (let conf of configurations) {
      _.merge(settings, _.get(boxConfig, 'configurations.all', {}))
      _.merge(settings, _.get(boxConfig, ['configurations', conf], {}))
      eg.diffXMLChangesAsJSON(conf, settings)
      eg.update(conf, settings)
    }

    if (opts.dry) return
    EclipseGenerator.backup(file)
    const xml = eg.$.xml()
    const prettyXML = EclipseGenerator.format(xml)
    fs.writeFileSync(file, prettyXML)
    log("Successfully updated `" + file + "`")

  }

  static format(xml) {

    // a
    //const formatXml = require('./formatXml')
    //const prettyXML = xml
    // b
    const {pd} = require('pretty-data')
    const prettyXML = pd.xml(xml)
    // c
    //const prettyXML = formatXml(xml)
    // d
    //const prettyXML = require('./formatXml2')(xml)
    // e
    //const prettyXML = xml

    return prettyXML
  }

  static backup(file) {

    const backupDir = join(path.dirname(file), '.cproject-box-backups')
    mkdirp.sync(backupDir)
    const original = fs.readFileSync(file, 'utf8')

    // `.cproject.bak-<timestamp>`
    const backupFilePath = join(backupDir, ".cproject.bak-" + (+(new Date)))
    fs.writeFileSync(backupFilePath, original)

    // `.cproject.bak-latest`
    // We save the latest file as well to allow easy diffing with a merge tool for testing.
    // We could have used a symlink but avoided it because I am not sure they play well with Windows.
    const backupFileLatestPath = join(backupDir, '.cproject.bak-latest')
    fs.writeFileSync(backupFileLatestPath, original)

    // `.cproject.bak-latest-formatted`
    // We format the original file, because it allows us to easily diff the changes to the XML code rather than the formatting.
    const backupFileLatestFormattedPath = join(backupDir, '.cproject.bak-latest-formatted')
    const originalFormatted = EclipseGenerator.format(original)
    fs.writeFileSync(backupFileLatestFormattedPath, originalFormatted)

    log('Backed up old file to:', backupFilePath)

  }

  static revert(file) {
    log('To return .cproject to last commit run:')
    log('\n  git checkout HEAD -- .cproject\n')
    log('TODO(vjpr): In the future we will revert to a file in the `.cproject-box-backups/` dir.')
  }

  static printConfigurations(file) {

    const eg = new EclipseGenerator(file)
    const configurations = eg.$.getConfigurations()
    console.log(configurations)

  }

}

// DEBUG: Print paths if not used as library.
// TODO: Do something useful - get config.
if (require.main === module.parent) {

  // File has been run from the command line.

  const boxConfig = require(join(process.cwd(), 'box.js'))

  //let {configuration} = yargs.argv
  //configuration = configuration || 'Debug'
  //if (!_.isArray(configuration)) configuration = [configuration]

  const projectFile = join(process.cwd(), '.cproject')

  if (!fs.existsSync(projectFile)) {
    log('Nothing to do.')
    process.exit()
  }

  let {revert} = yargs.argv
  if (revert) {
    EclipseGenerator.revert(projectFile)
    process.exit()
  }

  //const eg = new EclipseGenerator(projectFile)
  //log('Printing DEBUG paths')
  //eg.printPaths(configuration)
  //log('Printing DEBUG paths complete')
  //
  //log('Printing config')
  //pp(boxConfig)

  log('Found configurations:')
  EclipseGenerator.printConfigurations(projectFile, boxConfig)

  //EclipseGenerator.performUpdate(projectFile, boxConfig, {configurations: ['Debug_F411']})
  EclipseGenerator.performUpdate(projectFile, boxConfig)


}
