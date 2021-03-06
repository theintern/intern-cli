#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { sync as resolve } from 'resolve';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

import program from '../lib/commander';
import {
	acceptVersion,
	die,
	enumArg,
	getLogger,
	intArg,
	print
} from '../lib/util';
import cli3, {
	minVersion as cli3Min,
	maxVersion as cli3Max
} from '../lib/cli3';
import cli4, {
	minVersion as cli4Min,
	maxVersion as cli4Max
} from '../lib/cli4';

let internDir: any;
let internPkg: any;

const pkg = require('../package.json');
const minVersion = cli3Min;
const testsDir = 'tests';
const commands: { [name: string]: program.ICommand } = Object.create(null);
const browsers = {
	chrome: {
		name: 'Chrome'
	},
	firefox: {
		name: 'Firefox 47+'
	},
	safari: {
		name: 'Safari',
		note:
			'Note that Safari currently requires that the Safari WebDriver ' +
			'extension be manually installed.'
	},
	'internet explorer': {
		name: 'Internet Explorer'
	},
	microsoftedge: {
		name: 'Microsft Edge'
	}
};

let vlog = getLogger();

process.on('unhandledRejection', (error: Error) => {
	console.error(error);
	process.exit(1);
});

program
	.version(pkg.version)
	.description(
		'Run JavaScript tests. If no command is given, Intern is ' +
			'run using the default test config.  ' +
			'Run `intern help run` for run options.'
	)
	.option(
		'-v, --verbose',
		'show more information about what Intern is doing'
	);

program.on('option:verbose', () => {
	vlog = getLogger(true);
});

program
	.command('version')
	.description('Show versions of intern-cli and intern')
	.action(() => {
		const text = [`intern-cli: ${pkg.version}`];
		if (internDir) {
			text.push(`intern: ${internPkg.version}`);
		}
		print();
		print([, ...text, '']);
	});

// Add a blank line after help
program.on('--help', () => {
	print();
});

commands.help = program
	.command('help [command]')
	.description('Get help for a command')
	.action(commandName => {
		const cmdName = typeof commandName === 'string' ? commandName : '';
		const commands: any[] = (<any>program).commands;
		const command = commands.find(cmd => cmd.name() === cmdName);

		if (command) {
			command.outputHelp();
		} else {
			if (cmdName) {
				print(`Unknown command: ${cmdName}\n`);
			}

			print(
				'To get started with Intern, run `intern init` to setup a ' +
					`"${testsDir}" directory and then ` +
					'run `intern` to start testing!'
			);
			program.outputHelp();
		}
	});

commands.init = program
	.command('init')
	.description('Setup a project for testing with Intern')
	.option(
		'-b, --browser <browser>',
		'browser to use for functional tests',
		(val: string) => enumArg(Object.keys(browsers), val),
		'chrome'
	)
	.on('--help', function() {
		print();
		print([
			`This command creates a "${testsDir}" directory with a ` +
				'default Intern config file and some sample tests.',
			'',
			'Browser names:',
			'',
			`  ${Object.keys(browsers).join(', ')}`,
			''
		]);
	});

commands.run = program
	.command('run [args...]')
	.description('Run tests in Node or in a browser using WebDriver')
	.option('-b, --bail', 'quit after the first failing test')
	.option('-g, --grep <regex>', 'filter tests by ID')
	.option(
		'-l, --leaveRemoteOpen',
		'leave the remote browser open after tests finish'
	)
	.option('-p, --port <port>', 'port that test proxy should serve on', intArg)
	.option('-I, --noInstrument', 'disable instrumentation')
	.option('--debug', 'enable the Node debugger')
	.option(
		'--serveOnly',
		"start Intern's test server, but don't run any tests"
	)
	.option(
		'--timeout <int>',
		'set the default timeout for async tests',
		intArg
	)
	.option('--tunnel <name>', 'use the given tunnel for WebDriver tests')
	.option('-w, --webdriver', 'run WebDriver tests only');

commands.serve = program
	.command('serve [args...]')
	.description(
		'Start a simple web server for running unit tests in a browser on ' +
			'your system'
	)
	.option(
		'-c, --config <module ID|file>',
		`config file to use (default is ${testsDir}/intern.js)`
	)
	.option('-o, --open', 'open the test runner URL when the server starts')
	.option('-p, --port <port>', 'port to serve on', intArg)
	.option('-I, --noInstrument', 'disable instrumentation')
	.on('--help', () => {
		print('\n');
		print([
			'When running WebDriver tests, Intern runs a local server to ' +
				'serve itself and the test files to the browser(s) running the ' +
				'tests. This server can also be used instead of a dedicated web ' +
				'server such as nginx or Apache for running unit tests locally.',
			''
		]);
	});

// Handle any unknown commands
commands['*'] = program
	.command('*', undefined, { noHelp: true })
	.action(command => {
		print(`Unknown command: ${command}`);
		program.outputHelp();
	});

(async () => {
	try {
		internDir = dirname(resolve('intern', { basedir: process.cwd() }));
		internPkg = JSON.parse(
			readFileSync(join(internDir, 'package.json'), { encoding: 'utf8' })
		);
	} catch (error) {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout
		});

		try {
			print();
			print([
				'You need a local install of Intern to use this command.',
				''
			]);
			const shouldInstall = await new Promise(resolve => {
				rl.question(
					'  Install intern now [latest, next, no]? ',
					answer => {
						if (/l(a(t(e(s(t)?)?)?)?)?/.test(answer)) {
							resolve('latest');
						} else if (/ne(x(t)?)?/.test(answer)) {
							resolve('next');
						} else {
							resolve('no');
						}
					}
				);
			});

			if (shouldInstall !== 'no') {
				print();
				execSync(`npm install intern@${shouldInstall} --save-dev`, {
					stdio: 'inherit'
				});
			}
		} finally {
			rl.close();
		}
	}

	if (!internPkg) {
		try {
			internDir = dirname(resolve('intern', { basedir: process.cwd() }));
			internPkg = JSON.parse(
				readFileSync(join(internDir, 'package.json'), {
					encoding: 'utf8'
				})
			);
		} catch (error) {
			die([
				'Install the latest Intern release with:',
				'',
				'  npm install --save-dev intern@latest',
				'',
				'Install the development version with:',
				'',
				'  npm install --save-dev intern@next',
				''
			]);
		}
	}

	const context = {
		browsers,
		commands,
		program,
		vlog,
		internDir,
		internPkg,
		testsDir
	};

	if (acceptVersion(internPkg.version, cli3Min, cli3Max)) {
		cli3(context);
	} else if (acceptVersion(internPkg.version, cli4Min, cli4Max)) {
		cli4(context);
	} else {
		die(
			`This command requires Intern ${minVersion} or newer (` +
				`${internPkg.version} is installed).`
		);
	}

	for (const command of program.commands) {
		command.options.sort((a: program.IOption, b: program.IOption) => {
			const af = a.flags.toLowerCase();
			const bf = b.flags.toLowerCase();

			if (/^--/.test(af) && !/^--/.test(bf)) {
				return 1;
			}
			if (!/^--/.test(af) && /^--/.test(bf)) {
				return -1;
			}
			if (af < bf) {
				return -1;
			}
			if (af > bf) {
				return 1;
			}
			return 0;
		});
	}

	// If no command was provided and the user didn't request help, run intern
	// by default
	const parsed = program.parseOptions(process.argv);
	if (
		parsed.args.length < 3 &&
		!(parsed.unknown[0] === '-h' || parsed.unknown[0] === '--help')
	) {
		process.argv.splice(2, 0, 'run');
	}

	program.parse(process.argv);
})();
