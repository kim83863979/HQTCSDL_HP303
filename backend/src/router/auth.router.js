const express = require("express");
const authRouter = express.Router();
const { register, login } = require("../controller/auth.controller");
const { ValidateAuthInput } = require("../middleware/auth.regex");

authRouter.post("/register", ValidateAuthInput, register);
authRouter.post("/login", login);

module.exports = authRouter;