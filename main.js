/**
 * @file ssptool CLI main entry point.
 */

var program = require('commander')
  , package = require('./package.json')
  , fs = require('fs')
  , config = require('./lib/config')
  , opencontrol = require('./lib/opencontrol')
  , logger = console
  , commands =
    { list: require('./commands/list')
    , validate: require('./commands/validate')
    , refcheck: require('./commands/refcheck')
    , document: require('./commands/document')
    };

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip	 = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP   || process.env.SECURITYCENTRAL_SSPTOOL_SERVICE_HOST   || '0.0.0.0';

program.version(package.version);

program.option('-c, --config <file>','path to configuration file');
program.option('-d, --datadir <dir>','path to opencontrols data','./opencontrols');
program.option('-m, --docdir <dir>','path to markdown documents','./markdowns');

/** Log an error.
 * @param {Error} err
 */
function logError(err) { logger.error(err.message); }

/**
 * Load configuration from file if --config specified or ssptool.yaml exists,
 * or from command-line arguments / program defaults otherwise.
 */
function loadConfig (cb) {
    var defaultFile = 'ssptool.yaml'
      , defaultConfig = { datadir: program.datadir, docdir: program.docdir }
      ;
    if (program.config) {
        config.load(program.config, cb);
    } else {
        fs.access(defaultFile, fs.constants.R_OK, err =>
            err ? cb(null, defaultConfig) : config.load(defaultFile, cb));
    }
}

function loadDatabase (cb) {
    var done = (err, db) => err ? logError(err) : cb(db);
    loadConfig ((err, config) =>
        err ? done(err) : opencontrol.load(config, done));
}

/** Launch HTTP server
 */
program
  .command('server')
  .description('Run preview server')
  .action(function (options) {

    var app = require('./app')
      , http = require('http')
      , server = http.createServer(app)
      , startServer = (config, db) => {
          logger.info('Initializing...');
          app.initialize(config, db);
          console.log((new Date()) + ' SSP Tool is listening on http://%s:%s', ip, port);
          logger.info('Listening on http://%s:%s', ip, port);
          server.listen(ip, port, () => logger.info('Ready.'));
        };

    server.on('error', logError);
    logger.info('Loading data...');
    loadConfig ((err, config) =>
      err ? logError(err) : opencontrol.load(config, (err, db) =>
        err ? logError(err) : startServer(config, db)));

  });

program
  .command('list').alias('ls')
  .description('List all OpenControl artefacts')
  .action(function () {
    loadDatabase(db => commands.list.run(db));
  });

program
  .command('validate')
  .description('Validate all OpenControl artefacts')
  .action(function () {
    loadConfig ((err, config) =>
      err ? logError(err) : commands.validate(config));
  });

program
  .command('refcheck')
  .description('Referential integrity check')
  .action(function () {
    loadDatabase(db => commands.refcheck(db));
  });

program
  .command('report [reportid] [inputs...]')
  .description('Generate report')
  .action(function (reportid, inputs) {
    const reports = require('./lib/reports');
    const report = reports[reportid];
    var params = {};
    inputs.forEach(input => {
        let pair=input.split('=');
        if (pair.length == 2) {
            params[pair[0]] = pair[1];
        } else {
            logger.error('%s: should be name=value', input);
        }
    });
    if (reportid && !report) {
        logger.error('Report %s not defined', reportid);
    }
    if (!reportid || !report) {
        logger.info('\nAvailable reports:\n');
        for (reportid in reports) {
            logger.info('   %s - %s', reportid, reports[reportid].title);
        }
        logger.info('\n');
    } else {
        loadDatabase(db => {
            process.stdout.write(
                JSON.stringify(report.run(db, params), null, ' '));
        });
    }
  });

program
  .command('document <docid>')
  .description('Generate document')
  .action(function (docid) {
    loadConfig ((err, config) =>
      err ? logError(err) : opencontrol.load(config, (err, db) =>
        err ? logError(err) : commands.document(config, db, docid)));
  });

program
  .command('*')
  .description('Show help')
  .action(function() { program.help(); })
  ;

program.parse(process.argv);
if (!program.args.length) { program.help(); }

