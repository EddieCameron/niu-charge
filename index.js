// We need this to build our post string
const bodyParser = require("body-parser");
const config = require("config");
const express = require("express");
const fs = require("fs");

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
		accountConfig.token = token.toString();
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
		await limit.set(msg);
		io.emit("limit", msg);
	});

	socket.on("plug", async (msg) => {
		await plug.set(msg);

		io.emit("plug", plug.get());
	});
});

plug.connect();
history.start(account.getScooter().soc, plug.get().power);

function sendData() {
	io.emit("data", {
		limit: limit.get(),
		scooter: account.getScooter(),
		plug: plug.get(),
	});
}

setChargingInterval();

// Update every 30 minutes until the charge begins
function setIdleInterval() {
	console.log("Setting IDLE interval");

	clearInterval(interval.id);
	interval.state = 0;
	interval.id = setInterval(async () => {
		await plug.update();
		if (!plug.get().state) {
			if (isInPowerTime()) {
				// free power!, switch on
				console.log("Starting charge - free power!");
				plug.set(true);
			}
		}

		await account.updateScooter();
		sendData();

		if (account.getScooter().isCharging) {
			console.log("NIU is charging, decreasing interval");

			setChargingInterval();
		}
	}, 300000); //30min
}

function setChargingInterval() {
	console.log("Setting CHARGING interval");

	clearInterval(interval.id);
	interval.state = 1;
	let first = true;
	interval.id = setInterval(
		(async () => {
			await plug.update();
			await account.updateScooter();
			sendData();

			console.log("Checking SOC", account.getScooter().soc, "%", first);

			if (plug.get().state) {
				if (!isInPowerTime()) {
					// not free power anymore, switch off
					console.log("Stopping charge - not free power");
					plug.set(false);
				}
				else {
					let lim = await limit.get();
					if (account.getScooter().soc > lim && lim < 100) {
						console.log("Stopping charge - limit reached");
						plug.set(false);
					} else {
						if (first || history.get().length == 0) {
							first = false;
							history.start(account.getScooter().soc, plug.get().power);
							io.emit("start", true);
						} else {
							history.update(account.getScooter().soc, plug.get().power);
						}
					}
				}
			} else if (!account.getScooter().isCharging) {
				setIdleInterval();
			}
		}).bind(first),
		10000
	);
}

function checkLogged(req, res, next) {
	if (account.isLogged()) {
		next();
	} else {
		res.redirect("/login");
	}
}

function isInPowerTime() {
	var hour = new Date().getHours();
	return hour >= 21;	// free 9pm to midnight
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

http.listen(process.env.PORT || 3000, () => {
	console.log("NIU Charge started!");
});
