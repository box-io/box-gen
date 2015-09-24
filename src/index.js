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
const {pd} = require('pretty-data')
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
      xmlMode: true
    })
    this.$.prototype.getListOptionValuesAsArray = function(val) {
      return this.find('listOptionValue').map(function() {
        return $(this).attr('value')
      }).toArray()
    }
  }

  getPaths(lang, key) {
    return this.$build.find(`[superClass='${prefix}.${lang}.${key}']`).getListOptionValuesAsArray()
  }

  setPaths(lang, key, items) {
    const el = this.$build.find(`[superClass='${prefix}.${lang}.${key}']`)
    el.empty()
    const results = []
    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i]
      const newEl = this.$('<listOptionValue/>').attr({
        builtIn: false,
        value: item
      })
      results.push(el.append(newEl).append('\n'))
    }
    return results
  }

  setExcludes(items) {
    const excluding = items.join('|')
    return this.$("sourceEntries > entry").attr('excluding', excluding)
  }

  getPathsForConfig(configuration) {
    this.$build = this.$("configuration[name=" + configuration + "]")
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
    this.$build = this.$("configuration[name=" + configuration + "]")
    const paths = this.getPathsForConfig(configuration)
    return pp(paths)
  }

  update(configuration, arg) {
    const {includePaths, excludes, defs} = arg
    this.$build = this.$("configuration[name=" + configuration + "]")
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
    const delta = jsondiffpatch.diff(oldConfig, newConfig)
    console.log('Diff:')
    jsondiffpatch.console.log(delta)
  }

  static performUpdate(file, configurations, settings, dry) {
    const eg = new EclipseGenerator(file)
    for (let conf of configurations) {
      eg.diffXMLChangesAsJSON(conf, settings)
      eg.update(conf, settings)
    }
    if (dry) return
    const backupDir = path.join(path.dirname(file), '.cproject-box-backups')
    mkdirp.sync(backupDir)
    const original = fs.readFileSync(file, 'utf8')
    const backupFile = path.join(backupDir, ".cproject.bak-" + (+(new Date)))
    fs.writeFileSync(backupFile, original)
    log('Backed up old file to:', backupFile)
    const xml = eg.$.xml()
    const formatXml = require('./formatXml')
    //const prettyXML = xml // a
    const prettyXML = pd.xml(xml) // b
    //const prettyXML = formatXml(xml) // c
    fs.writeFileSync(file, prettyXML)
    log("Successfully updated `" + file + "`")
  }

}

// DEBUG: Print paths if not used as library.
// TODO: Do something useful - get config.
if (require.main === module.parent) {

  const boxConfig = require(join(process.cwd(), 'box.js'))

  let {configuration} = yargs.argv
  configuration = configuration || 'Debug'
  if (!_.isArray(configuration)) configuration = [configuration]

  const projectFile = join(process.cwd(), '.cproject')
  //const projectFile = '/Users/Vaughan/dev-quantitec/intranav-node/.cproject-box-backups/.cproject.bak-1442278144199'

  if (!fs.existsSync(projectFile)) {
    log('Nothing to do.')
    process.exit()
  }
  const eg = new EclipseGenerator(projectFile)
  log('Printing DEBUG paths')
  eg.printPaths(configuration)
  log('Printing DEBUG paths complete')

  log('Printing config')
  pp(boxConfig)

  EclipseGenerator.performUpdate(projectFile, ['Debug_F411'], boxConfig)


}
