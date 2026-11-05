// src/router/auth.router.js
// Router cho API xác thực.

const express                                      = require('express');
const authRouter                                   = express.Router();
const { register, login }                          = require('../controller/auth.controller');
const { ValidateRegisterInput, ValidateLoginInput } = require('../middleware/auth.regex');

// POST /api/auth/register
authRouter.post('/register', ValidateRegisterInput, register);

// POST /api/auth/login
authRouter.post('/login', ValidateLoginInput, login);

module.exports = authRouter;
