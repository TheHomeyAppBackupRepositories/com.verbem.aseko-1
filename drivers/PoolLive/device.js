/* eslint-disable linebreak-style */
/* eslint-disable indent */
/* eslint-disable no-tabs */
/* eslint-disable max-len */

'use strict';

const Homey = require('homey');

class PoolLiveDevice extends Homey.Device {

    async onInit() {
        this.log(`Init device ${this.getName()}`);
        this.setCapabilityOptions('measure_temperature.water', { title: { en: 'Water temperature' } });
        this.setCapabilityOptions('measure_temperature.air', { title: { en: 'Air temperature' } });
        this.ready().then(() => {
            this.homey.setTimeout(() => {
                this.driver.ready()
                .then(() => {
                    // this.driver.updatePoolUnits();
                    this.driver.checkCapabilities(this);
                });
            }, 10 * 1000);
        });
        this.filtrations = [];

        this.registerCapabilityListener('unitError', async (value, opts) => {
            this.log('unitError', value);
        });
    }

}

module.exports = PoolLiveDevice;
