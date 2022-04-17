const EventEmitter = require('events');
const axios = require('axios').default;

module.exports = class Plug extends EventEmitter {

	constructor({ address }) {
		super();

		this.address = address;

		this._data = {
			state: -1,
			current: -1,
			power: -1,
			volt: -1
		}
	}

	connect(repeat = true) {
		this.emit('connected');
	}

	get() {
		return this._data;
	}

	async update() {
		try {
			const response = await axios.get(`${this.address}cm?cmnd=Power`);
			this._data.state = response.data.POWER == "ON"
		}
		catch (error) {
			console.error("error updating plug state: " + error);
		}
		return this._data;
	}

	async set(state) {
		try {
			const response = await axios.get(`${this.address}cm?cmnd=Power%20${state ? "ON" : "OFF"}`);
		}
		catch (error) {
			console.error("error setting plug state: " + error);
		}
	}
}