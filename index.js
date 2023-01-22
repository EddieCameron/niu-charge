// We need this to build our post string
const bodyParser = require("body-parser");
const config = require("config");
const express = require("express");
const fs = require("fs");
const to = require('await-to-js').default;

const TOKEN_NAME = "config/token";

const Account = require("./src/account.js");
const Plug = require("./src/plug");
const Limit = require("./src/limit");
const History = require("./src/history");

var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

var interval = {
	state: 0,
	id: 0,
};

var account;
if (fs.existsSync(TOKEN_NAME)) {
	let token = fs.readFileSync(TOKEN_NAME);
	let accountConfig = {
		serial: config.get("scooter"),
	};

	if (token != "") {
		accountConfig.token = token.toString().trim();
	}

	if (config.has("lang")) {
		accountConfig.lang = config.get("lang");
	}

	account = new Account(accountConfig);
	account.updateScooter();
}

var history = new History();
var plug = new Plug(config.get("plug"));
var limit = new Limit();
limit.load();

plug.on("connected", async () => {
	plug.update().then((data) => {
		io.emit("plug", data);
	});
});

plug.on("data", (data) => {
	if (!interval.state && data.state) {
		setChargingInterval();
	}

	io.emit("plug", data);
});

io.on("connection", function (socket) {
	socket.on("ready", () => {
		sendData();
	});

	socket.on("limit", async (msg) => {
		[err] = await to(limit.set(msg));
		if (err) {
			console.error(err);
			return;
		}
		io.emit("limit", msg);
	});

	socket.on("plug", async (msg) => {
		[err] = await to(plug.set(msg));
		if (err) {
			console.error(err);
			return;
		}

		io.emit("plug", plug.get());
	});
});

plug.connect();

function sendData() {
	io.emit("data", {
		limit: limit.get(),
		scooter: account.getScooter(),
		plug: plug.get(),
	});
}

function isAllowedToCharge() {
	if (config.get("useAllowedChargeTime")) {
		var hour = new Date().getHours();
		if (hour < config.get("startAllowedChargeTime"))
			return false;
		if (hour > config.get("endAllowedChargeTime"))
			return false;
	}
	return true;
}

async function isUnderChargeLimit() {
	try {
		let lim = await limit.get();

		return account.getScooter().soc < lim;
	} catch (err) {
		console.error(err);
		return true;
	}
}

setChargingInterval();

// Update every 30 minutes until the charge begins
function setIdleInterval() {
	console.log("Setting IDLE interval");

	clearInterval(interval.id);
	interval.state = 0;
	interval.id = setInterval(async () => {
		[err] = await to(plug.update());
		if (err) {
			console.error(err);
			return;
		}
		[err] = await to(account.updateScooter());
		if (err) {
			console.error(err);
			return;
		}
		sendData();

		var canCharge = await isUnderChargeLimit();

		if (isAllowedToCharge() && canCharge) {
			// free power!, switch on
			console.log("Starting charge - free power!");
			plug.set(true);
			setChargingInterval();
		}
	}, 30 * 60 * 1000); //30min
}

function setChargingInterval() {
	console.log("Setting CHARGING interval");

	clearInterval(interval.id);
	interval.state = 1;
	let first = true;
	interval.id = setInterval(
		(async () => {
			[err] = await to(plug.update());
			if (err) {
				console.error(err);
				return;
			}
			[err] = await to(account.updateScooter());
			if (err) {
				console.error(err);
				return;
			}

			if (first || history.get().length == 0) {
				first = false;
				history.start(account.getScooter().soc, plug.get().power);
				io.emit("start", true);
			} else {
				history.update(account.getScooter().soc, plug.get().power);
			}
			sendData();

			console.log("Checking SOC", account.getScooter().soc, "%", first);

			var canCharge = await isUnderChargeLimit();

			if (isAllowedToCharge() && canCharge) {
				// free power!, switch on
				console.log("Starting charge - free power!");
				plug.set(true);
			}
			else {
				// shouldn't charge! switch off
				console.log("Stopping charge - not free power");
				plug.set(false);

				setIdleInterval();
			}
		}).bind(first),
		10 * 60 * 1000 //10min
	);
}

function checkLogged(req, res, next) {
	if (account.isLogged()) {
		next();
	} else {
		res.redirect("/login");
	}
}

app.use(express.static("public"));
app.use(
	bodyParser.urlencoded({
		extended: true,
	})
);

app.set("view engine", "pug");

app.get("/", checkLogged, (req, res) => {
	let hist = history.get();

	res.render("index", { data: hist[hist.length - 1] });
});

app.get("/login", (req, res) => {
	if (account.isLogged()) {
		res.redirect("/");
	} else {
		res.render("login");
	}
});

app.get("/history", checkLogged, (req, res) => {
	let hist = history.get();

	res.render("history", {
		data: hist[hist.length - 1],
	});
});

app.post("/login", (req, res) => {
	account
		.login(req.body.username, req.body.password)
		.then((token) => {
			console.log("User logged in!");

			require("fs").writeFile(TOKEN_NAME, token, () => {});

			account = new Account({
				serial: config.get("scooter"),
				token: token,
			});
			account.updateScooter().then(() => {
				res.redirect("/");
			});
		})
		.catch((e) => {
			res.send("error: " + e);
		});
});

app.post("/charging", (req, res) => {
	device
		.set({
			dps: 1,
			set: req.body.value == "true",
		})
		.then(() => {
			res.statusCode = 200;
			res.send();
		})
		.catch(() => {
			res.statusCode = 500;
			res.send();
		});
});

process.on('unhandledRejection', (reason, p) => {
	console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
	// application specific logging, throwing an error, or other logic here
});

http.listen(process.env.PORT || config.get("port"), () => {
	console.log("NIU Charge started!");
});
