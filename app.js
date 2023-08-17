/* eslint-disable linebreak-style */
/* eslint-disable indent */
/* eslint-disable no-tabs */
/* eslint-disable max-len */

'use strict';

/* eslint-disable no-tabs */

const Homey = require('homey');
const Logger = require('./captureLog');

class Aseko extends Homey.App {

	onInit() {
		this.logger = new Logger(this.homey, 'log', 100);

		this.log(`ASEKO Pool Units ${this.manifest.version} is initialising.`);

		process.on('uncaughtException', (err) => {
			this.error(`UnCaught exception: ${err}\n`);
		});

		process.on('unhandledRejection', (reason, p) => {
			this.error('Unhandled Rejection at:', p, 'reason:', reason);
		});

		this.homey
			.on('unload', () => {
				this.log('app unload called');
				this.logger.saveLogs();
			})
			.on('memwarn', () => {
				this.log('memwarn!');
			})
			.on('cpuwarn', () => {
				this.log('cpu warning');
		});
	}

	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		if (this.logger) return this.logger.logArray;
		return ['inactive'];
	}

}

module.exports = Aseko;
