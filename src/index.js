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
const yargs = require('yargs')
const log = console.log
const chalk = require('chalk')
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

    this.jsondiffpatch = jsondiffpatch.create({
      // used to match objects when diffing arrays, by default only === operator is used
      objectHash: function(obj) {
        // this function is used only to when objects are not equal by ref
        return obj._id || obj.id
      },
      arrays: {
        // default true, detect items moved inside the array (otherwise they will be registered as remove+add)
        detectMove: true,
        // default false, the value of items moved is not included in deltas
        includeValueOnMove: false,
      },
      textDiff: {
        // default 60, minimum string length (left and right sides) to use text diff algorythm: google-diff-match-patch
        minLength: 60
      }
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
      includePaths: oldConfig.includes.cpp, // TODO(vjpr): Only using cpp. Should merge all together.
      defs: oldConfig.defs.cpp,
      excludes: oldConfig.excludes
    }

    // These are Box-specific settings that do not have direct mappings to the XML
    // so we omit them from diffing.
    newConfig = _.omit(newConfig, ['templates', 'includes', 'optional'])

    //console.log(oldConfig, '\n', newConfig)
    const delta = this.jsondiffpatch.diff(oldConfig, newConfig)

    log('-'.repeat(80))
    console.log(`Configuration: ${chalk.bold(configuration)}`)
    log('-'.repeat(80))
    if (!delta) return log(chalk.green('No change.'))
    jsondiffpatch.console.log(delta) // NOTE: We explicitly don't use `this.jsondiffpatch`.
  }

  // configurations - leave null to modify all.
  static performUpdate(file, boxConfig, opts = {}) {

    const eg = new EclipseGenerator(file)

    const merger = (a, b) => _.isArray(a) ? _.union(a, b) : _.merge(a, b)

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
    // TODO(vjpr): Don't show if there are no changes for a configuration.
    log('\nThe following changes will be mode:')
    for (let conf of configurations) {
      _.merge(settings, _.get(boxConfig, 'configurations.all', {}), merger)
      _.merge(settings, _.get(boxConfig, ['configurations', conf], {}), merger)
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

  static mergeArrays

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

    log('\nBacking up...')

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

    log('Backed up old .cproject to:', backupFileLatestPath)

  }

  static revert(file) {
    log('To return .cproject to last commit run:')
    log('\n  git checkout HEAD -- .cproject\n')
    log('TODO(vjpr): In the future we will revert to a file in the `.cproject-box-backups/` dir.')
  }

  static printConfigurations(file) {

    const eg = new EclipseGenerator(file)
    const configurations = eg.$.getConfigurations()
    log('Found configurations:')
    log(prettyjson.render(configurations))

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

  EclipseGenerator.printConfigurations(projectFile, boxConfig)

  //EclipseGenerator.performUpdate(projectFile, boxConfig, {configurations: ['Debug_F411']})
  EclipseGenerator.performUpdate(projectFile, boxConfig)

  log('\nDone!\n')

}
