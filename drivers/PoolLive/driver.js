/* eslint-disable linebreak-style */
/* eslint-disable indent */
/* eslint-disable no-tabs */
/* eslint-disable max-len */
/* eslint-disable object-curly-newline */

'use strict';

const Homey = require('homey');
const Unit = require('../../lib/Pool');

// associate capability with either name or type
const capabilities = {
    waterTemp: 'measure_temperature.water',
    airTemp: 'measure_temperature.air',
    ph: 'measure_Ph',
    rx: 'measure_Redox',
    clf: 'measure_Clf',
    waterLevel: 'measure_Waterlevel',
    Salinity: 'measure_Salinity',
};

const consumables = {
    cl: 'measure_consumable_cl',
    phMinus: 'measure_consumable_phMinus',
    algicide: 'measure_consumable_algicide',
    flocculant: 'measure_consumable_flocculant',
};

const Pool = new Unit();

class PoolLiveDriver extends Homey.Driver {

    async onInit() {
        this.log('Init driver');
        Pool.app = this;
        this.test = true;
        this.testUnit = true;
        this.timelineItems = [];

        this.prefs = this.homey.settings.get('preferences');
		this.log(this.prefs);
		
        this.homey.settings.on('set', async (key) => {  
            this.log('onInit() Update Settings:', key);    

            if ( key === 'preferences' ) {
                this.prefs = this.homey.settings.get('preferences')
                this.log('onInit() New preferences:')
                this.log('onInit()', this.prefs)
            }
        });

        this.settings = this.homey.settings.get('settings');
        if (this.settings === null) this.settings = {};
        if (this.settings && this.settings.username && this.settings.password) {

            await Pool.getWebAccount({ username: this.settings.username, password: this.settings.password })

            this.homey.setTimeout(() => {
                this.setFiltrationDelays();        
            }, 3 * 1000);
            this.homey.setTimeout(() => {
                Pool.logoutWebAccount();         
            }, 6 * 1000);

            this.getMobileAccount();  

            if (!this.settings.timelineSolved || typeof this.settings.timelineSolved === 'boolean') {
                this.settings.timelineSolved = { status: this.settings.timelineSolved, timestamp: new Date().getTime() };
                this.homey.settings.set('settings', this.settings);
            }
        } else {
            this.settings.username = '';
            this.settings.password = '';
            this.settings.timelineSolved = { status: false, timestamp: new Date().getTime() };
        }

        this.goWithTheFlow();

        this.intervalPool = this.homey.setInterval(() => {
            this.updatePoolUnits();
        }, 3 * 59 * 1000);

        this.intervalFilter = this.homey.setInterval(() => {
            this.checkFiltration();
        }, 60 * 1000);
    }

    async getMobileAccount() {
        Pool.getMobileAccount({ username: this.settings.username, password: this.settings.password })
        .then((result) => {
            this.refreshAccessToken()
            .then((result) => {
                this.updatePoolUnits(); // initial update if authorized 
            }).catch((err) => {
                this.error(err);
            });
        }).catch((err) => {
            Pool.authorized = false;
            this.error(err);
        });
    }

    async onPair(session) {
        let username = '';
        let password = '';

        session.setHandler('showView', async (view) => {
			if (view === 'loading') {
				if (Pool.authorized === true) await session.showView('list_devices');
				else {
					session.nextView();
				}
			}
		});

        session.setHandler('login', async (data) => {
            username = data.username;
            password = data.password;

            const response = await Pool.getMobileAccount({
                username,
                password,
            });

            if (response) {
                this.settings.username = username;
                this.settings.password = password;
                this.homey.settings.set('settings', this.settings);
                this.refreshAccessToken();
            }

            return response;
        });

        session.setHandler('list_devices', async () => {
            let devices = [];
            const response = await Pool.getUnits();

            response.items.forEach((unit) => {
                devices = devices.concat({ name: unit.name,
                data: { id: unit.serialNumber } });
            });

            return devices;
        });
    }

    async updatePoolUnits() {
        if (Pool.authorized === false) {
            const response = await Pool.getMobileAccount({ username: this.settings.username, password: this.settings.password });
            if (typeof response === 'object' && 'status' in response) {
                if (response.status !== 200) {
                    this.log(JSON.stringify(response, ' ', 4));
                    this.getDevices.forEach((device) => {
                        device.setUnavailable(response.message);
                    });
                    return;
                }
            }
            this.homey.clearInterval(this.refreshToken);
            await this.refreshAccessToken();
        }

        const response = await Pool.getUnits();

	    if (!response || 'items' in response === false) return;

        response.items.forEach((unit) => {
            this.doPoolUnitUpdates(unit);
            this.doTimeLineUpdates(unit);
            this.doConsumableUpdates(unit);
        });
    }

    async doPoolUnitUpdates(unit) {
        // UPDATE POOL UNIT
        try {
            const unitDev = this.getDevice({ id: unit.serialNumber });
            if (unitDev.getAvailable() === false) unitDev.setAvailable();

            Pool.getUnit({ unit: unit.serialNumber })
            .then((unitState) => {
                // this.log(JSON.stringify(unitState, ' ', 4));
                this.updatePoolUnit({ device: unitDev, state: unitState, unit });
            }).catch((err) => {
                this.error(err);
            });
        }   catch (error) {
            this.error(error);
        }
    }

    async doConsumableUpdates(unit) {
        // GET CONSUMABLES
        try {
            const unitDev = this.getDevice({ id: unit.serialNumber });
            Pool.getConsumables({ unit: unit.serialNumber })
            .then((data) => {
                if (data && data.hasOwnProperty('consumables')) {
                    data.consumables.forEach((consumable) => {
                        let capability = null;
                        if (consumable.type in consumables) capability = consumables[consumable.type];
                        if (capability) {
                            if (unitDev.hasCapability(capability)) {
                                let currentValue = 0;
                                if (consumable.currentVolume > 0) currentValue = Math.floor(consumable.currentVolume * 100 / consumable.maxVolume);
                                unitDev.setCapabilityValue(capability, currentValue).catch((err) => this.error(err));
                            }
                        }
                    });
                }
            }).catch((err) => {
                this.error(err);
            });
        }   catch (error) {
            this.error(error);
        }
    }

    async doTimeLineUpdates(unit) {
        // GET TIMELINE
        try {
            const unitDev = this.getDevice({ id: unit.serialNumber });
            Pool.getTimeline({ unit: unit.serialNumber })
            .then((unitTimeline) => {
                if (unitTimeline && unitTimeline.hasOwnProperty('items') && unitTimeline.items.length > 0) {
                    if (!this.settings.timelineSolved) this.settings.timelineSolved = { status: false, timestamp: new Date().getTime() };
                    const ts = Date.parse(unitTimeline.items[0].date);
                    if (ts > this.settings.timelineSolved.timestamp) {
                        if (unitTimeline.items[0].label.includes('just ended')) {
                            this.log('Trigger solved timeline');
                            this.settings.timelineSolved.status = true;
                            this.settings.timelineSolved.timestamp = ts;
                            this.homey.settings.set('settings', this.settings);
                            this.trgTimeLineSolved.trigger(unitDev);
                        } else {
                            let i = 0;
                            while (Date.parse(unitTimeline.items[i].date) > this.settings.timelineSolved.timestamp && unitTimeline.items[i].label.includes('just ended' === false) && i < unitTimeline.items.length) {
                                if (unitTimeline.items[i].type === 'error') {
                                    this.log('Trigger issue(s) for timeline', unitTimeline.items[i].label);
                                    this.trgTimeLine(unitDev, { timeline_message: unitTimeline.items[i].label });
                                }
                                i++;
                            }
                            this.settings.timelineSolved.status = false;
                            this.settings.timelineSolved.timestamp = ts;
                            this.homey.settings.set('settings', this.settings);
                        }
                    }
                }
            }).catch((err) => {
                this.error(err);
            });
        }   catch (error) {
            this.error(error);
        }       
    }

    async refreshAccessToken() {
        // if (Pool.authorized === false) return;
        if (this.refreshToken) this.homey.clearInterval(this.refreshToken);
        Pool.refreshToken();
        this.refreshToken = this.homey.setInterval(() => {
            Pool.refreshToken();
        }, 15 * 60 * 1000 - 500);
    }

    async updatePoolUnit({ device, state, unit } = {}) {
        if (unit.isOnline && device.getAvailable() === false) await device.setAvailable();
        else if (unit.isOnline === false && device.getAvailable() === true) {
            device.setUnavailable();
            return;
        }

        if (unit.hasError !== device.getCapabilityValue('alarm_unit')) {
            device.setCapabilityValue('alarm_unit', unit.hasError);
            if (unit.hasError) this.trgAlarmOn.trigger(device).catch((err) => this.error(err)); else this.trgAlarmOff.trigger(device).catch((err) => this.error(err));
        }

        device.setCapabilityValue('unitType', unit.type);
        let errorMsg = null;

        if (state && state.variables) {
            state.variables.forEach((variable) => {
                let capability = null;
                if (variable.type in capabilities) capability = capabilities[variable.type];
                else if (variable.name in capabilities) capability = capabilities[variable.name];
                if (capability) {
                    if (device.hasCapability(capability)) {
                        device.setCapabilityValue(capability, variable.currentValue).catch((err) => this.error(err));
                        if (variable.hasError && this.prefs && this.prefs.preference) {
                            let notify = true;
                            if (this.prefs.preference === 'NoAlarms') notify = false;
                            else if (this.prefs.preference === 'FilteredAlarms') notify = this.activeFiltration(device);

                            if (notify) {
                                errorMsg = variable.name;
                                this.homey.notifications.createNotification({ excerpt: errorMsg }).catch((error) => this.error('Unable to notify', errorMsg, error));
                                this.trgErrorChanged.trigger(device, { error_message: errorMsg }).catch((err) => this.error(err));
                            }
                        } 
                    }
                }
            });

            if (errorMsg && device.getCapabilityValue('unitError') !== errorMsg) device.setCapabilityValue('unitError', errorMsg);
            if (errorMsg === null && device.getCapabilityValue('unitError') !== null) device.setCapabilityValue('unitError', null);
        }
    }

    async checkCapabilities(device) {
        if (!Pool.authorized) return;

        Pool.getUnit({ unit: device.getData().id })
        .then((unitState) => {
            unitState.variables.forEach((variable) => {
                let capability = null;
                if (variable.type in capabilities) capability = capabilities[variable.type];
                else if (variable.name in capabilities) capability = capabilities[variable.name];
                if (capability) this.checkCapability(device, variable.currentValue, capability);
                else this.log('No capability defined for variable', variable);
            });
        }).catch((err) => {
            this.error(err);
        });

        Pool.getConsumables({ unit: device.getData().id })
        .then((data) => {
            data.consumables.forEach((consumable) => {
                let capability = null;
                if (consumable.type in consumables) capability = consumables[consumable.type];
                if (capability) {
                    let currentValue = 0;
                    if (consumable.currentVolume > 0) currentValue = Math.floor(consumable.currentVolume * 100 / consumable.maxVolume);
                    this.log(capability, currentValue, '%');
                    this.checkCapability(device, currentValue, capability);
                }
                else this.log('No capability defined for consumable', consumable);
            });
        }).catch((err) => {
            this.error(err);
        });
    }

    async checkCapability(device, currentValue, capability) {
        this.log('Check', capability);
        if (device.hasCapability(capability)) {
                return;
            }
            this.log('Add', capability);
            await device.addCapability(capability)
            .then(() => {
                device.setCapabilityValue(capability, currentValue).catch((err) => this.error('capability not set', device.getName(), capability, currentValue));
            }).catch((err) => {
                this.error('capability not valid on', device.getName(), capability);
            });
    }

    async goWithTheFlow() {
        this.trgErrorChanged = this.homey.flow.getDeviceTriggerCard('error_changed');
        this.trgAlarmOn = this.homey.flow.getDeviceTriggerCard('alarm_on');
        this.trgAlarmOff = this.homey.flow.getDeviceTriggerCard('alarm_off');
        this.trgTimeLine = this.homey.flow.getDeviceTriggerCard('timeline_problem');
        this.trgFiltrationOn = this.homey.flow.getDeviceTriggerCard('filtration_on');
        this.trgFiltrationOff = this.homey.flow.getDeviceTriggerCard('filtration_off');
        this.trgTimeLineSolved = this.homey.flow.getDeviceTriggerCard('timeline_problem_solved');

        this.conFiltrationActive = this.homey.flow.getConditionCard('filtration_is_active')
        .registerRunListener(async (args, state) => {
            const active = await this.activeFiltration(args.device);
            this.log('Filtration Active', active);
            return active
        });
    }

    async setFiltrationDelays() {
        this.getDevices().forEach((device) => {
            const unit = device.getData().id;
            Pool.getConfiguration({ unit })
            .then((data) => {
                data.left.forEach((names) => {
                    if (names.name === 'Delay time at startup') device.delay = Math.ceil(names.value / 60);
                });
                data.right.forEach((names) => {
                    if (names.name === 'Delay time at startup') device.delay = Math.ceil(names.value / 60);
                });
                this.log('Filtration delay for', device.getName(), 'has been set to', device.delay);
            }).catch((err) => {
                this.error(err);
            });
        })
    }

    async checkFiltration() {
        for (const device of this.getDevices()) {
            if (!device.hasCapability('filtration')) await device.addCapability('filtration');
            this.activeFiltration(device)
            .then((status) => {
                const filter = device.getCapabilityValue('filtration');
                this.log('checkFiltration', device.getName(), status, filter, (filter !== null && filter !== status));
                device.setCapabilityValue('filtration', status);
                if (filter !== null && filter !== status) if (status) this.trgFiltrationOn.trigger(device); else this.trgFiltrationOff.trigger(device);               
            })
            .catch((error) => this.error('checkFiltration', error));
        }
    }

    async activeFiltration(device) {
        const unit = device.getData().id;
        const result = await Pool.apiRequired({ unit })
        .catch((error) => {
            throw new Error('Problem with call to APIRequired');
        });

        if (!result || (result && 'filtrations' in result === false)) throw new Error('Problem with result from APIRequired');

        if (result.filtrations.length === 0) return true;

        const date = new Date();
        const timeZone = this.homey.clock.getTimezone();
        const tzDate = new Date(date.toLocaleString(undefined, { timeZone: timeZone }));

        var hours = tzDate.getHours();
        var minutes = tzDate.getMinutes();
        var totalMinutes = (hours*60) + minutes;
        let active = false;
        let delay = device.delay;

        result.filtrations.forEach(timeslot => {
            if (totalMinutes >= timeslot.start+delay && totalMinutes <= timeslot.stop) active = true;
        });
        return active;           
    }
}

module.exports = PoolLiveDriver;
