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

//
// Include Paths patterns.
//
// TODO: Move docs somewhere else.

// Cross GCC
// <configuration artifactName="${ProjName}" buildArtefactType="org.eclipse.cdt.build.core.buildArtefactType.exe" buildProperties="org.eclipse.cdt.build.core.buildArtefactType=org.eclipse.cdt.build.core.buildArtefactType.exe,org.eclipse.cdt.build.core.buildType=org.eclipse.cdt.build.core.buildType.debug" cleanCommand="rm -rf" description="Run Google Tests on local machine." id="cdt.managedbuild.config.gnu.cross.exe.debug.1637339521" name="buildTestGoogleTest" parent="cdt.managedbuild.config.gnu.cross.exe.debug">
// <option id="gnu.c.compiler.option.include.paths.2056425181" name="Include paths (-I)" superClass="gnu.c.compiler.option.include.paths" useByScannerDiscovery="false" valueType="includePath">

// Cross ARM GCC
// <configuration artifactName="${ProjName}" buildArtefactType="org.eclipse.cdt.build.core.buildArtefactType.exe" buildProperties="org.eclipse.cdt.build.core.buildArtefactType=org.eclipse.cdt.build.core.buildArtefactType.exe,org.eclipse.cdt.build.core.buildType=org.eclipse.cdt.build.core.buildType.debug" cleanCommand="${cross_rm} -rf" description="Flash to F411" errorParsers="org.eclipse.cdt.core.GmakeErrorParser;org.eclipse.cdt.core.CWDLocator;org.eclipse.cdt.core.GCCErrorParser;org.eclipse.cdt.core.GASErrorParser;org.eclipse.cdt.core.GLDErrorParser" id="ilg.gnuarmeclipse.managedbuild.cross.config.elf.debug.764883146" name="buildDebugF411" parent="ilg.gnuarmeclipse.managedbuild.cross.config.elf.debug" postannouncebuildStep="" postbuildStep="" preannouncebuildStep="" prebuildStep="">
// <option id="ilg.gnuarmeclipse.managedbuild.cross.option.assembler.include.paths.136940756" name="Include paths (-I)" superClass="ilg.gnuarmeclipse.managedbuild.cross.option.assembler.include.paths" valueType="includePath">

// Include Paths:
// Cross GCC     => gnu.c.compiler.option.include.paths
// Cross ARM GCC => ilg.gnuarmeclipse.managedbuild.cross.option.assembler.include.paths
// --

//
//
//

// Depending on which toolchain is used, the attribute keys are different.
const getIncludePathsEl = ($configuration, lang, key) => {
  let superClass = ''
  let el
  const toolChainName = $configuration.find('toolChain').attr('name')
  switch (toolChainName) {
  case 'Cross GCC':
    //
    // We use `valueType` because the superClass differs depending on lang:
    //   c.compiler => 'preprocessor.def.symbols'
    //   cpp.compiler => 'preprocessor.def'
    //
    if (key === 'defs') {
      el = $configuration.find(`[valueType="definedSymbols"]`)
    } else {
      superClass = `gnu.${lang}.option.${key}`
      el = $configuration.find(`[superClass='${superClass}']`)
    }
    break
  case 'Cross ARM GCC':
    superClass = `ilg.gnuarmeclipse.managedbuild.cross.option.${lang}.${key}`
    el = $configuration.find(`[superClass='${superClass}']`)
    break
  }
  return el
}

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

  getPaths($configuration, lang, key) {
    return getIncludePathsEl($configuration, lang, key).getListOptionValuesAsArray()
  }

  setPaths($configuration, lang, key, items) {
    if (!items) return []
    const el = getIncludePathsEl($configuration, lang, key)
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

  setExcludes($configuration, items) {
    if (!items) return []
    // In Eclipse: `Project Properties > Paths and Symbols > Source Location`.
    let rootSourceEntryEl = $configuration.find('sourceEntries > entry[name=""]')
    if (!rootSourceEntryEl.length) {
      rootSourceEntryEl = this.$('<entry/>').attr({
        flags: 'VALUE_WORKSPACE_PATH|RESOLVED',
        kind: 'sourcePath',
        name: '',
      })
      $configuration.find('sourceEntries').append(rootSourceEntryEl).append('\n')
    }
    const excluding = items.join('|')
    rootSourceEntryEl.attr('excluding', excluding)
  }

  getExcludes($configuration) {
    const $ = this.$
    let rootSourceEntryEl = $configuration.find('sourceEntries > entry[name=""]')
    const excluding = rootSourceEntryEl.attr('excluding')
    const excludes = excluding ? excluding.split('|') : []
    return excludes
  }

  getPathsForConfig(configuration) {
    const $configuration = this.$.getConfiguration(configuration)
    const includes = {
      assembler: this.getPaths($configuration, 'assembler', 'include.paths'),
      c: this.getPaths($configuration, 'c.compiler', 'include.paths'),
      cpp: this.getPaths($configuration, 'cpp.compiler', 'include.paths')
    }
    const defs = {
      assembler: this.getPaths($configuration, 'assembler', 'defs'),
      c: this.getPaths($configuration, 'c.compiler', 'defs'),
      cpp: this.getPaths($configuration, 'cpp.compiler', 'defs')
    }
    const excludes = this.getExcludes($configuration)
    return {includes, defs, excludes}
  }

  printPaths(configuration) {
    const paths = this.getPathsForConfig(configuration)
    return pp(paths)
  }

  update(configuration, arg) {
    const {includePaths, excludes, defs} = arg
    const $configuration = this.$.getConfiguration(configuration)
    //console.log(this.$.html($configuration))
    this.setPaths($configuration, 'assembler', 'include.paths', includePaths)
    this.setPaths($configuration, 'c.compiler', 'include.paths', includePaths)
    this.setPaths($configuration, 'cpp.compiler', 'include.paths', includePaths)
    this.setPaths($configuration, 'assembler', 'defs', defs)
    this.setPaths($configuration, 'c.compiler', 'defs', defs)
    this.setPaths($configuration, 'cpp.compiler', 'defs', defs)
    return this.setExcludes($configuration, excludes)
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

  static getSettingsFromFile(configurations, boxConfig, configFileDir) {

    const merger = (a, b) => _.isArray(a) ? _.union(a, b) : _.merge(a, b)

    //
    // box.js module.exports schema looks like:
    //
    //     configurations.<all|Debug|Release>.<includePaths|defs|includes|excludes>
    //
    // TODO(vjpr): Only updates existing configurations at the moment.
    // Ideally it would create new configurations.
    //

    // Take a `box.js` file and merge the settings for each configuration,
    // and return an object.
    let settingsByConfiguration = {}
    _(configurations).each((conf) => {
      let mergedSettings = {
        excludes: [],
        includePaths: [],
        optional: [],
        defs: [],
        templates: [],
      }

      _.merge(mergedSettings, _.get(boxConfig, 'configurations.all', {}), merger)
      _.merge(mergedSettings, _.get(boxConfig, ['configurations', conf], {}), merger)

      // Files mentioned in `box.js` are relative to their module dir. Eclipse requires
      // the files to be relative to the project dir.
      const relFromRoot = (p) => join(configFileDir, p)
      const wrapDir = (p) => join('${ProjDirPath}', configFileDir, p)

      mergedSettings = _(mergedSettings).mapValues((v, k) => {
        switch (k) {
          // In .cproject these are relative to a sourceRoot.
          // We assume a single sourceRoot which is the project dir.
        case 'includes':
        case 'excludes':
        case 'optional':
        case 'templates':
          v = _(v).map((entry) => relFromRoot(entry)).value()
          break
        case 'includePaths':
          v = _(v).map((entry) => wrapDir(entry)).value()
          break
        }
        return v
      }).value()

      // Add optionals to excludes.
      // Optionals can be explicitly included, further down.
      mergedSettings.excludes = mergedSettings.excludes.concat(mergedSettings.optional || [])

      // Add templates to excludes.
      // Templates can be manually copied by user, never compiled without changes.
      // TODO(vjpr): Add cli tool to add templates.
      mergedSettings.excludes = mergedSettings.excludes.concat(mergedSettings.templates || [])

      // Remove includes from excludes.
      // NOTE: `includes` don't exist in .cproject - they are simply "not excluded".
      mergedSettings.excludes = _.difference(mergedSettings.excludes, mergedSettings.includes)

      mergedSettings.includePaths = _(mergedSettings.includePaths).unique().run()
      mergedSettings.optional = _(mergedSettings.optional).unique().run()
      mergedSettings.excludes = _(mergedSettings.excludes).unique().run()
      mergedSettings.defs = _(mergedSettings.defs).unique().run()
      mergedSettings.defs = _(mergedSettings.defs).without('').run()

      settingsByConfiguration[conf] = mergedSettings
    }).value()

    return settingsByConfiguration

  }

  // configurations - leave null to modify all.
  static performUpdate(file, boxConfigFiles = [], opts = {}) {

    const rootDir = process.cwd() // TODO(vjpr): Make more generic?

    const eg = new EclipseGenerator(file)

    const configurations = opts.configurations || eg.$.getConfigurations()

    const merger = (a, b) => _.isArray(a) ? _.union(a, b) : _.merge(a, b, merger)

    let mergedSettingsByConfiguration = {}
    for (let boxConfigFile of boxConfigFiles) {
      const boxConfig = require(boxConfigFile)
      let configFileDir = path.dirname(boxConfigFile)
      configFileDir = path.relative(rootDir, configFileDir)
      let settingsByConfiguration = EclipseGenerator.getSettingsFromFile(configurations, boxConfig, configFileDir)
      _.merge(mergedSettingsByConfiguration, settingsByConfiguration, merger)

      // DEBUG
      //pp(mergedSettingsByConfiguration)
      //console.log('-------------------')
    }

    // TODO(vjpr): Don't show if there are no changes for a configuration.
    log('\nThe following changes will be mode:')

    _(mergedSettingsByConfiguration).forEach((settings, conf) => {
      // `settings` = {includePaths, include, excludes, ...}

      // Add search paths (e.g. modules, node_modules, etc.) to allow relative requires.
      // E.g. Allows `#include "foo/foo.h"` to include `modules/foo/foo.h`.
      const searchPaths = ['modules', 'node_modules']
      searchPaths.forEach((p) => {
        settings.includePaths.push(join('${ProjDirPath}', p))
      })
      // ---

      // Add all dirs in `/config`.
      function getDirectories(srcpath) {
        return fs.readdirSync(srcpath).filter(function(file) {
          return fs.statSync(path.join(srcpath, file)).isDirectory()
        })
      }

      try {
        getDirectories(join(rootDir, 'config')).forEach(d => {
          settings.includePaths.push(join('${ProjDirPath}', 'config', d))
        })
      } catch (e) {
        if (e.code === 'ENOENT') {
          console.warn("config dir doesn't exist.")
        } else {
          throw e
        }
      }
      // ---

      eg.diffXMLChangesAsJSON(conf, settings)
      eg.update(conf, settings)
    }).value()

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
    log('Found configurations in .cproject:')
    log(prettyjson.render(configurations))

  }

}

// DEBUG: Print paths if not used as library.
// TODO: Do something useful - get config.
if (require.main === module.parent) {

  // File has been run from the command line.

  const rootBoxConfigFile = join(process.cwd(), 'box.js')
  const rootBoxConfig = require(rootBoxConfigFile)

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

  EclipseGenerator.printConfigurations(projectFile)

  const glob = require('glob')
  const configFiles = glob.sync(process.cwd() + '/modules/*/box.js')

  // Print found config files.
  log('Found configs in [project root and modules] dir:')
  const allConfigFiles = [...configFiles, rootBoxConfigFile]
  pp(allConfigFiles.map((file) => path.resolve(process.cwd(), file)))

  //EclipseGenerator.performUpdate(projectFile, boxConfig, {configurations: ['Debug_F411']})
  EclipseGenerator.performUpdate(projectFile, allConfigFiles)

  log('\nDone!\n')

}
