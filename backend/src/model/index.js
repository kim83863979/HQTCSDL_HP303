const { Sequelize } = require("sequelize");
const dbConfig = require("../config/db.config");
const { createUserModel } = require("./user.model");
if (!dbConfig.url) {
    throw new Error("Thiếu DATABASE_URL trong app/.env");
}
const sequelize = new Sequelize(dbConfig.url, {
    dialect: dbConfig.dialect,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: true
        }
    }
});

const User = createUserModel(sequelize);

module.exports = { sequelize, User };