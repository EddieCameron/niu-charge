const storage = require('node-persist');

module.exports = class Limit {
	constructor() {
		storage.init();
		this._limit;
	}

	async load() {
		await storage.init();
		this._limit = await storage.getItem('limit');

		if (isNaN(this._limit)) {
			this.set(90);
		}
	}

	get() {
		return this._limit;
	}

	async set(newLimit) {
		this._limit = parseInt(newLimit);
		await storage.setItem('limit', parseInt(newLimit));
	}
}