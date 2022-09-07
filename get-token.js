const config = require("config");
const fs = require("fs");
const Account = require("./src/account.js");

const TOKEN_NAME = "config/token";

var account;
let accountConfig = {
    serial: config.get("scooter"),
};

if (config.has("lang")) {
    accountConfig.lang = config.get("lang");
}

account = new Account(accountConfig);

const args = process.argv.slice(2);
account.login(args[0], args[1]).then((token) => {
    console.log(token);
    fs.writeFileSync(TOKEN_NAME, token);
})
    .catch(error => console.error(error));