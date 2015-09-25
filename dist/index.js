//region Imports
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var debug = require('debug')('eclipse-gen');
var path = require('path');
var join = path.join;

var fs = require('fs');
var _ = require('lodash');
var prettyjson = require('prettyjson');
var prettydiff = require('prettydiff');
var cheerio = require('cheerio');
var mkdirp = require('mkdirp');
var jsondiffpatch = require('jsondiffpatch');
var log = console.log;
var yargs = require('yargs');
//endregion

var pp = function pp() {
  return console.log(prettyjson.render.apply(prettyjson, arguments));
};

var prefix = 'ilg.gnuarmeclipse.managedbuild.cross.option';

var EclipseGenerator = (function () {
  function EclipseGenerator(filename) {
    _classCallCheck(this, EclipseGenerator);

    this.filename = filename;
    var original = fs.readFileSync(this.filename, 'utf8');
    var $ = this.$ = cheerio.load(original, {
      xmlMode: true,
      // NOTE: Needs to be false, otherwise `&quot;` strings in original file
      // are converted to `"`
      // causing attributes which are not modified to become something like
      // `<Foo foo="&quot;foo bar&quot;"/>` -> `<Foo foo=""foo bar""/>`.
      // See https://github.com/cheeriojs/cheerio/issues/496.
      decodeEntities: false
    });
    this.$.prototype.getListOptionValuesAsArray = function (val) {
      return this.find('listOptionValue').map(function () {
        return $(this).attr('value');
      }).toArray();
    };
    this.$.getConfiguration = function (configuration) {
      return $('configuration[name="' + configuration + '"]');
    };
    this.$.getConfigurations = function () {
      return $('configuration').map(function () {
        return $(this).attr('name');
      }).toArray();
    };
  }

  // DEBUG: Print paths if not used as library.
  // TODO: Do something useful - get config.

  _createClass(EclipseGenerator, [{
    key: 'getPaths',
    value: function getPaths(lang, key) {
      return this.$build.find('[superClass=\'' + prefix + '.' + lang + '.' + key + '\']').getListOptionValuesAsArray();
    }
  }, {
    key: 'setPaths',
    value: function setPaths(lang, key, items) {
      if (!items) return [];
      var el = this.$build.find('[superClass=\'' + prefix + '.' + lang + '.' + key + '\']');
      el.empty();
      var results = [];
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = items[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var item = _step.value;

          var newEl = this.$('<listOptionValue/>').attr({
            builtIn: false,
            value: item
          });
          results.push(el.append(newEl).append('\n'));
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator['return']) {
            _iterator['return']();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return results;
    }
  }, {
    key: 'setExcludes',
    value: function setExcludes(items) {
      if (!items) return [];
      var excluding = items.join('|');
      return this.$("sourceEntries > entry").attr('excluding', excluding);
    }
  }, {
    key: 'getPathsForConfig',
    value: function getPathsForConfig(configuration) {
      this.$build = this.$.getConfiguration(configuration);
      var includes = {
        assembler: this.getPaths('assembler', 'include.paths'),
        c: this.getPaths('c.compiler', 'include.paths'),
        cpp: this.getPaths('cpp.compiler', 'include.paths')
      };
      var defs = {
        assembler: this.getPaths('assembler', 'defs'),
        c: this.getPaths('c.compiler', 'defs'),
        cpp: this.getPaths('cpp.compiler', 'defs')
      };
      var excluding = this.$('sourceEntries > entry').attr('excluding');
      var excludes = excluding ? excluding.split('|') : null;
      return { includes: includes, defs: defs, excludes: excludes };
    }
  }, {
    key: 'printPaths',
    value: function printPaths(configuration) {
      this.$build = this.$.getConfiguration(configuration);
      var paths = this.getPathsForConfig(configuration);
      return pp(paths);
    }
  }, {
    key: 'update',
    value: function update(configuration, arg) {
      var includePaths = arg.includePaths;
      var excludes = arg.excludes;
      var defs = arg.defs;

      this.$build = this.$.getConfiguration(configuration);
      this.setPaths('assembler', 'include.paths', includePaths);
      this.setPaths('c.compiler', 'include.paths', includePaths);
      this.setPaths('cpp.compiler', 'include.paths', includePaths);
      this.setPaths('assembler', 'defs', defs);
      this.setPaths('c.compiler', 'defs', defs);
      this.setPaths('cpp.compiler', 'defs', defs);
      return this.setExcludes(excludes);
    }
  }, {
    key: 'diffXMLChangesAsJSON',
    value: function diffXMLChangesAsJSON(configuration, newConfig) {
      var oldConfig = this.getPathsForConfig(configuration);
      oldConfig = {
        includePaths: oldConfig.includes.cpp,
        defs: oldConfig.defs.cpp,
        excludes: oldConfig.excludes
      };
      delete newConfig.templates;
      delete newConfig.includes;
      delete newConfig.optional;
      console.log('------------------------');
      console.log(oldConfig, newConfig);
      console.log('------------------------');
      var delta = jsondiffpatch.diff(oldConfig, newConfig);
      console.log('Diff for configuration: ' + configuration);
      jsondiffpatch.console.log(delta);
    }

    // configurations - leave null to modify all.
  }], [{
    key: 'performUpdate',
    value: function performUpdate(file, boxConfig) {
      var opts = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var eg = new EclipseGenerator(file);

      //
      // box.js module.exports schema looks like:
      //
      //     configurations.<all|Debug|Release>.<includePaths|defs|includes|excludes>
      //
      // TODO(vjpr): Only updates existing configurations at the moment.
      // Ideally it would create new configurations.
      //
      var configurations = opts.configurations || eg.$.getConfigurations();
      var settings = {};
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = configurations[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var conf = _step2.value;

          _.merge(settings, _.get(boxConfig, 'configurations.all', {}));
          _.merge(settings, _.get(boxConfig, ['configurations', conf], {}));
          eg.diffXMLChangesAsJSON(conf, settings);
          eg.update(conf, settings);
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2['return']) {
            _iterator2['return']();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      if (opts.dry) return;
      EclipseGenerator.backup(file);
      var xml = eg.$.xml();
      var prettyXML = EclipseGenerator.format(xml);
      fs.writeFileSync(file, prettyXML);
      log("Successfully updated `" + file + "`");
    }
  }, {
    key: 'format',
    value: function format(xml) {

      // a
      //const formatXml = require('./formatXml')
      //const prettyXML = xml
      // b

      var _require = require('pretty-data');

      var pd = _require.pd;

      var prettyXML = pd.xml(xml);
      // c
      //const prettyXML = formatXml(xml)
      // d
      //const prettyXML = require('./formatXml2')(xml)
      // e
      //const prettyXML = xml

      return prettyXML;
    }
  }, {
    key: 'backup',
    value: function backup(file) {

      var backupDir = join(path.dirname(file), '.cproject-box-backups');
      mkdirp.sync(backupDir);
      var original = fs.readFileSync(file, 'utf8');

      // `.cproject.bak-<timestamp>`
      var backupFilePath = join(backupDir, ".cproject.bak-" + +new Date());
      fs.writeFileSync(backupFilePath, original);

      // `.cproject.bak-latest`
      // We save the latest file as well to allow easy diffing with a merge tool for testing.
      // We could have used a symlink but avoided it because I am not sure they play well with Windows.
      var backupFileLatestPath = join(backupDir, '.cproject.bak-latest');
      fs.writeFileSync(backupFileLatestPath, original);

      // `.cproject.bak-latest-formatted`
      // We format the original file, because it allows us to easily diff the changes to the XML code rather than the formatting.
      var backupFileLatestFormattedPath = join(backupDir, '.cproject.bak-latest-formatted');
      var originalFormatted = EclipseGenerator.format(original);
      fs.writeFileSync(backupFileLatestFormattedPath, originalFormatted);

      log('Backed up old file to:', backupFilePath);
    }
  }, {
    key: 'revert',
    value: function revert(file) {
      log('To return .cproject to last commit run:');
      log('\n  git checkout HEAD -- .cproject\n');
      log('TODO(vjpr): In the future we will revert to a file in the `.cproject-box-backups/` dir.');
    }
  }, {
    key: 'printConfigurations',
    value: function printConfigurations(file) {

      var eg = new EclipseGenerator(file);
      var configurations = eg.$.getConfigurations();
      console.log(configurations);
    }
  }]);

  return EclipseGenerator;
})();

if (require.main === module.parent) {

  // File has been run from the command line.

  var boxConfig = require(join(process.cwd(), 'box.js'));

  //let {configuration} = yargs.argv
  //configuration = configuration || 'Debug'
  //if (!_.isArray(configuration)) configuration = [configuration]

  var projectFile = join(process.cwd(), '.cproject');

  if (!fs.existsSync(projectFile)) {
    log('Nothing to do.');
    process.exit();
  }

  var revert = yargs.argv.revert;

  if (revert) {
    EclipseGenerator.revert(projectFile);
    process.exit();
  }

  //const eg = new EclipseGenerator(projectFile)
  //log('Printing DEBUG paths')
  //eg.printPaths(configuration)
  //log('Printing DEBUG paths complete')
  //
  //log('Printing config')
  //pp(boxConfig)

  log('Found configurations:');
  EclipseGenerator.printConfigurations(projectFile, boxConfig);

  //EclipseGenerator.performUpdate(projectFile, boxConfig, {configurations: ['Debug_F411']})
  EclipseGenerator.performUpdate(projectFile, boxConfig);
}