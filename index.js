// Sonoff-Tasmota Switch/Outlet Platform Device Accessory plugin for HomeBridge
// Sabahat Afzal

'use strict';

var Service, Characteristic;
var mqtt = require("mqtt");
var path = require('path');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-sonoff-tasmota", "Sonoff-Tasmota", SonoffTasmotaPlatform);
};

/**
 *
 * @param log
 * @param config
 * @constructor
 *
 * "accessory": "mqtt-temperature-tasmota",
 "name": "NAME OF THIS ACCESSORY",
 "url": "mqtt://MQTT-ADDRESS",
 "username": "MQTT USER NAME",
 "password": "MQTT PASSWORD",
 "topic": "tele/sonoff/SENSOR",
 "activityTopic": "tele/sonoff/LWT",
 "activityParameter": "Online",
 "startCmd": "cmnd/sonoff/TelePeriod",
 "startParameter": "120",
 "sensorPropertyName": "DS1",
 "manufacturer": "ITEAD",
 "model": "Sonoff TH",
 "serialNumberMAC": "MAC OR SERIAL NUMBER"
 */
function SonoffTasmotaPlatform(log, config) {
    this.log = log;
    this.devices = config["devices"];
    this.name = config["name"] || "Sonoff";
    this.manufacturer = config['manufacturer'] || "ITEAD";
    this.model = config['model'] || "Sonoff";
    this.serialNumberMAC = config['serialNumberMAC'] || "";
    this.config = config;
    this.log("Sonoff Tasmota Platform Plugin Version " + this.getVersion());
}

/**
 *
 * @param log
 * @param config
 * @param device
 * @constructor
 */
function SonoffTasmotaAccessory(log, config, device) {

    this.log = log;
    this.url = config["url"];
    this.manufacturer = config['manufacturer'] || "ITEAD";
    this.model = config['model'] || "Sonoff";
    this.serialNumberMAC = config['serialNumberMAC'] || "";

    this.publish_options = {
        qos: ((config["qos"] !== undefined) ? config["qos"] : 0)
    };

    this.client_Id = 'sonoff_' + device.name + Math.random().toString((16 - device.name.length)).substr(2, 8);
    this.options = {
        keepalive: 10,
        clientId: this.client_Id,
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        will: {
            topic: 'WillMsg',
            payload: 'Connection Closed abnormally..!',
            qos: 0,
            retain: false
        },
        username: config["username"],
        password: config["password"],
        rejectUnauthorized: false
    };

    this.topicStatusGet = device.topics.statusGet;
    this.topicStatusSet = device.topics.statusSet;
    this.topicsStateGet = (device.topics.stateGet !== undefined) ? device.topics.stateGet : "";

    this.onValue = (device.onValue !== undefined) ? device.onValue : "ON";
    this.offValue = (device.offValue !== undefined) ? device.offValue : "OFF";

    var powerVal = this.topicStatusSet.split("/");
    this.powerValue = powerVal[powerVal.length - 1];
    this.log('Device do RESULT ', this.powerValue);

    if (device.activityTopic !== undefined && device.activityParameter !== undefined) {
        this.activityTopic = device.activityTopic;
        this.activityParameter = device.activityParameter;
    } else {
        this.activityTopic = "";
        this.activityParameter = "";
    }

    this.buttonType = device.buttonType;
    this.isLockMechanism = (device.buttonType.indexOf('L') > -1);
    this.isOutlet = (device.buttonType.indexOf('O') > -1);
    this.isSwitch = (device.buttonType.indexOf('S') > -1);
    this.isGarageDoor = (device.buttonType.indexOf('G') > -1);
    this.isWindowCovering = (device.buttonType.indexOf('WC') > -1);
    this.status = 0; // 0 = off, else on / percentage
    this.timeOut = device.timeOut ? device.timeOut : -1;
    this.minTemp = device.minTemp ? device.minTemp : -1;
    this.maxTemp = device.maxTemp ? device.maxTemp : -1;
    this.minHum = device.minHum ? device.minHum : -1;
    this.maxHum = device.maxHum ? device.maxHum : -1;
    this.maxOn = device.maxOn ? device.maxOn : 1000;

    this.closeAfter = device.closeAfter ? device.closeAfter : -1;
}

SonoffTasmotaPlatform.prototype = {

    accessories: function (callback) {
        this.log("Fetching Sonoff Tasmota Device...");
        var getRemoteButtons = function () {

            var foundAccessories = [];
            if (this.devices) {
                // Remote control connection
                for (var i = 0; i < this.devices.length; ++i) {
                    var device = this.devices[i];
                    this.log("devices = ");
                    this.log(device);
                    var accessory = new SonoffTasmotaAccessory(this.log, this.config, device);
                    foundAccessories.push(accessory);
                }
            }
            callback(foundAccessories);
        }.bind(this);

        getRemoteButtons();
    },

    getVersion: function () {
        var pjPath = path.join(__dirname, './package.json');
        var pj = JSON.parse(fs.readFileSync(pjPath));
        return pj.version;
    }
};

SonoffTasmotaAccessory.prototype = {

    // Get Services
    getServices: function () {
        this.getConnectToMQTT();

        if (this.isOutlet) {
            this.accessories = new Service.Outlet(this.name);
            this.accessories
                .getCharacteristic(Characteristic.OutletInUse)
                .on('get', function (callback) {
                    this.getState(this.buttonType, callback);
                }.bind(this))
                .value = this.extractValue(this.buttonType, this.status);

            this.accessories
                .getCharacteristic(Characteristic.On)
                .on('get', function (callback) {
                    this.getState(this.buttonType, callback);
                }.bind(this))
                .on('set', function (value, callback) {
                    this.executeChange(this.buttonType, value, callback);
                }.bind(this))
                .value = this.extractValue(this.buttonType, this.status);

        }

        else if (this.isLockMechanism) {
            this.accessories = new Service.LockMechanism(this.name);

            this.accessories
                .getCharacteristic(Characteristic.LockCurrentState)
                .on('get', function (callback) {
                    this.getState(this.buttonType, callback);
                }.bind(this))
                .value = this.extractValue(this.buttonType, this.status);

            this.accessories
                .getCharacteristic(Characteristic.LockTargetState)
                .on('get', function (callback) {
                    this.getState(this.buttonType, callback);
                }.bind(this))
                .on('set', function (value, callback) {
                    this.executeChange(this.buttonType, value, callback);
                }.bind(this))
                .value = this.extractValue(this.buttonType, this.status);
        }

        else if (this.isSwitch) {

            this.accessories = new Service.Switch(this.name);
            this.accessories
                .getCharacteristic(Characteristic.On)
                .on('get', function (callback) {
                    this.getState(this.buttonType, callback);
                }.bind(this))
                .on('set', function (value, callback) {
                    this.executeChange(this.buttonType, value, callback);
                }.bind(this))
                .value = this.extractValue(this.buttonType, this.status);
        }
        else if (this.isGarageDoor) {
            // Use HomeKit types defined in HAP node JS
            var openerService = new Service.GarageDoorOpener(this.name);

            // Basic light controls, common to Hue and Hue lux

            openerService
                .getCharacteristic(Characteristic.TargetDoorState)
                .on('get', function (callback) {
                    this.getState("door", callback);
                }.bind(this))
                .on('set', function (value, callback) {
                    this.executeChange("door", value, callback);
                }.bind(this))
                .value = this.extractValue("door", this.status);

            this.openerService = openerService;

        }
        else if (this.isWindowCovering) {
            // Use HomeKit types defined in HAP node JS
            var windowOpenerService = new Service.WindowCovering(this.name);

            // Basic light controls, common to Hue and Hue lux
            windowOpenerService
                .getCharacteristic(Characteristic.TargetPosition)
                .on('get', function (callback) {
                    this.getState("blinds", callback);
                }.bind(this))
                .on('set', function (value, callback) {
                    this.executeChange("blinds", value, callback, 0);
                }.bind(this))
                .value = this.extractValue("blinds", this.status);

            /*
             windowOpenerService
             .getCharacteristic(Characteristic.CurrentPosition)
             .on('get', function(callback) { this.getState("blinds", callback);})
             .on('set', function(value, callback) { this.executeChange("blinds", value, callback, 1);})
             .value = this.extractValue("blinds", this.status);
             */

            //windowOpenerService.getCharacteristic(Characteristic.PositionState.STOPPED)

            this.windowOpenerService = windowOpenerService;
        }

        /**
         * This is to show the device is online or offline.
         * When ActivityTopic is set to the device.
         */
        if (this.activityTopic !== "") {
            this.service
                .addOptionalCharacteristic(Characteristic.StatusActive);
            this.service
                .getCharacteristic(Characteristic.StatusActive)
                .on('get', this.getStatusActive.bind(this));
        }

        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumberMAC)
            .addCharacteristic(Characteristic.FirmwareRevision, "0.0.1");

        return [informationService, this.accessories];
    },

    extractValue: function (buttonType, status) {
        switch (buttonType.toLowerCase()) {
            case 's':
            case 'o':
            {
                if (this.activeStat) {
                    callback(null, status);
                } else {
                    callback(null);
                }
                break;
            }
            case 'l':
            {
                if (this.activeStat) {
                    var locked = (status == "lock") ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
                    this.setCharacteristic(Characteristic.LockCurrentState, locked);
                    callback(null, status);
                } else {
                    callback(null);
                }
                break;
            }
            case 'blinds':
            {
                break;
            }
            default:
            {
                if (this.activeStat) {
                    callback(null, status);
                } else {
                    callback(null);
                }
            }
        }
    },

    // Create and set a light state
    executeChange: function (characteristic, value, callback, option) {

        switch (characteristic.toLowerCase()) {
            case 'identify':
                // Turn on twice to let the light blink
                if (context !== 'fromSetValue') {
                    this.status = status;
                    this.client.publish(this.topicStatusSet, this.onValue, this.publish_options);
                    setTimeout(function () {
                        this.client.publish(this.topicStatusSet, this.offValue, this.publish_options);
                        setTimeout(function () {
                            this.client.publish(this.topicStatusSet, this.onValue, this.publish_options);
                            setTimeout(function () {
                                this.client.publish(this.topicStatusSet, this.offValue, this.publish_options);
                            }.bind(this), 2000);
                        }.bind(this), 2000);
                    }.bind(this), 2000);
                }
                if (callback) callback();
                break;
            case 's':
                if (context !== 'fromSetValue') {
                    this.status = status;
                    this.client.publish(this.topicStatusSet, status ? this.onValue : this.offValue, this.publish_options);
                }
                if (callback) callback();
                break;
            case 'l':
                if (context !== 'fromSetValue') {
                    this.status = status;
                    this.client.publish(this.topicStatusSet, status ? this.onValue : this.offValue, this.publish_options);
                    if (this.status != "lock") {
                        setTimeout(function () {
                            this.status = !this.status;
                            this.client.publish(this.topicStatusSet, status ? this.onValue : this.offValue, this.publish_options);
                        }.bind(this), this.maxOn * 1000);
                    }
                }
                if (callback) callback();
                break;
            case 'door':
            case 'blinds':
            case 'button':
                this.getTvIsOn(function (err, isOn) {
                    if (isOn == true) {
                        var send = status > 0 ? this.onCommand : this.offCommand;
                        this.setRemoteCommand(send);
                        callback(err, isOn);
                    } else {
                        callback(new Error("Button: Tv is Not On"), 0);
                    }
                }.bind(this));
                break;
            default:
                callback(new Error("Default: No place define to send this command " + characteristic), 0);
                break;
        }
    },

    // Respond to identify request
    identify: function (callback) {
        this.executeChange("identify");
        callback();
    },

    /**
     * @param callback
     */
    getStatusActive: function (callback) {
        this.log(this.name, " -  Activity Set : ", this.activeStat);
        callback(null, this.activeStat);
    },

    /**
     * @param callback
     */
    getOutletUse: function (callback) {
        callback(null, true); // If configured for outlet - always in use (for now)
    },

    /**
     * Connect to MQTT client
     */
    getConnectToMQTT: function () {

        this.client = mqtt.connect(this.url, this.options);
        var that = this;
        this.client.on('error', function () {
            that.log('Error event on MQTT');
        });

        this.client.on('connect', function () {
            if (config["startCmd"] !== undefined && config["startParameter"] !== undefined) {
                that.client.publish(config["startCmd"], config["startParameter"]);
            }
        });

        this.client.on('message', function (topic, message) {
            if (topic == that.topicStatusGet) {
                try {
                    // In the event that the user has a DUAL the topicStatusGet will return for POWER1 or POWER2 in the JSON.
                    // We need to coordinate which accessory is actually being reported and only take that POWER data.
                    // This assumes that the Sonoff single will return the value { "POWER" : "ON" }
                    var data = JSON.parse(message);
                    var status = data.POWER;
                    if (data.hasOwnProperty(that.powerValue)) {
                        var status = data[that.powerValue];
                        that.status = (status == that.onValue);
                        that.log(that.name, "(", that.powerValue, ") - Power from Status", status); //TEST ONLY
                    }

                } catch (e) {
                    var status = message.toString();

                    that.status = (status == that.onValue);
                }
                that.service.getCharacteristic(Characteristic.On).setValue(that.status, undefined, 'fromSetValue');
            }

            if (topic == that.topicsStateGet) {
                try {
                    var data = JSON.parse(message);
                    if (data.hasOwnProperty(that.powerValue)) {
                        var status = data[that.powerValue];
                        that.log(that.name, "(", that.powerValue, ") - Power from State", status); //TEST ONLY
                        that.status = (status == that.onValue);
                        that.service.getCharacteristic(Characteristic.On).setValue(that.status, undefined, '');
                    }
                } catch (e) {
                }
            } else if (topic == that.activityTopic) {
                var status = message.toString();
                that.activeStat = (status == that.activityParameter);
                that.service.setCharacteristic(Characteristic.StatusActive, that.activeStat);
            }
        });
        this.client.subscribe(this.topicStatusGet);
        if (this.topicsStateGet !== "") {
            this.client.subscribe(this.topicsStateGet);
        }
        if (this.activityTopic !== "") {
            this.client.subscribe(this.activityTopic);
        }
    }
};
