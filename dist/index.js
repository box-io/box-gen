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

var _require = require('pretty-data');

var pd = _require.pd;

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
      xmlMode: true
    });
    this.$.prototype.getListOptionValuesAsArray = function (val) {
      return this.find('listOptionValue').map(function () {
        return $(this).attr('value');
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
      var el = this.$build.find('[superClass=\'' + prefix + '.' + lang + '.' + key + '\']');
      el.empty();
      var results = [];
      for (var i = 0, len = items.length; i < len; i++) {
        var item = items[i];
        var newEl = this.$('<listOptionValue/>').attr({
          builtIn: false,
          value: item
        });
        results.push(el.append(newEl).append('\n'));
      }
      return results;
    }
  }, {
    key: 'setExcludes',
    value: function setExcludes(items) {
      var excluding = items.join('|');
      return this.$("sourceEntries > entry").attr('excluding', excluding);
    }
  }, {
    key: 'getPathsForConfig',
    value: function getPathsForConfig(configuration) {
      this.$build = this.$("configuration[name=" + configuration + "]");
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
      this.$build = this.$("configuration[name=" + configuration + "]");
      var paths = this.getPathsForConfig(configuration);
      return pp(paths);
    }
  }, {
    key: 'update',
    value: function update(configuration, arg) {
      var includePaths = arg.includePaths;
      var excludes = arg.excludes;
      var defs = arg.defs;

      this.$build = this.$("configuration[name=" + configuration + "]");
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
      var delta = jsondiffpatch.diff(oldConfig, newConfig);
      console.log('Diff:');
      jsondiffpatch.console.log(delta);
    }
  }], [{
    key: 'performUpdate',
    value: function performUpdate(file, configurations, settings, dry) {
      var eg = new EclipseGenerator(file);
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = configurations[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var conf = _step.value;

          eg.diffXMLChangesAsJSON(conf, settings);
          eg.update(conf, settings);
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

      if (dry) return;
      var backupDir = path.join(path.dirname(file), '.cproject-box-backups');
      mkdirp.sync(backupDir);
      var original = fs.readFileSync(file, 'utf8');
      var backupFile = path.join(backupDir, ".cproject.bak-" + +new Date());
      fs.writeFileSync(backupFile, original);
      log('Backed up old file to:', backupFile);
      var xml = eg.$.xml();
      var formatXml = require('./formatXml');
      //const prettyXML = xml // a
      var prettyXML = pd.xml(xml); // b
      //const prettyXML = formatXml(xml) // c
      fs.writeFileSync(file, prettyXML);
      log("Successfully updated `" + file + "`");
    }
  }]);

  return EclipseGenerator;
})();

if (require.main === module.parent) {

  var boxConfig = require(join(process.cwd(), 'box.js'));

  var configuration = yargs.argv.configuration;

  configuration = configuration || 'Debug';
  if (!_.isArray(configuration)) configuration = [configuration];

  var projectFile = join(process.cwd(), '.cproject');
  //const projectFile = '/Users/Vaughan/dev-quantitec/intranav-node/.cproject-box-backups/.cproject.bak-1442278144199'

  if (!fs.existsSync(projectFile)) {
    log('Nothing to do.');
    process.exit();
  }
  var eg = new EclipseGenerator(projectFile);
  log('Printing DEBUG paths');
  eg.printPaths(configuration);
  log('Printing DEBUG paths complete');

  log('Printing config');
  pp(boxConfig);

  EclipseGenerator.performUpdate(projectFile, ['Debug_F411'], boxConfig);
}