const storage = require('node-persist');

module.exports = class Limit {
	constructor() {
		storage.init();
		this._limit;
		this._limitMin;
	}

	async load() {
		await storage.init();
		this._limit = await storage.getItem('limit');
		this._limitMin = await storage.getItem('limitMin');

		if (isNaN(this._limit)) {
			this.set(90);
		}
		if (isNaN(this._limitMin)) {
			this.set(5);
		}
	}

	get() {
		return this._limit;
	}

	async set(newLimit) {
		this._limit = parseInt(newLimit);
		await storage.setItem('limit', parseInt(newLimit));
	}

	getMin() {
		return this._limitMin;
	}

	async set(newLimitMin) {
		this._limitMin = parseInt(newLimitMin);
		await storage.setItem('limitMin', parseInt(newLimitMin));
	}
}